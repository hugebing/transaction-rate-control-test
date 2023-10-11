/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

// ----------------------
// External Dependencies
// ----------------------

// Load environment variables from a .env file
require('dotenv').config();

// Import path module for handling file paths
const path = require('path');

// Import fs module for file system operations
const fs = require('fs');

// ----------------------------------
// Configuration Parameters - General
// ----------------------------------

// Benchmarking type (you can modify this if needed)
const benchmarkType = 'fixRate';

// Fabric Network Configuration
const caHost = `ca.org1.example.com`;
const mspOrg = `Org1MSP`;
const channelName = 'channel1';
const chaincodeName = 'smallbank';
const department = `org1.department1`;
const walletPath = path.join(__dirname, 'transferWallet');

// ------------------------------------
// Configuration Parameters - Functions
// ------------------------------------

// Function type ("all" or another value).
// When another value is selected, only the "send payment" transaction is chosen.
const functionType = process.env.functionType;

// Hot Account (one of "all", "sender", "recipient", "null")
const hotAccount = process.env.hotAccount;

// -----------------------------
// Configuration Parameters - Data
// -----------------------------

// Number of accounts
const numAccount = parseInt(process.env.numAccount);

// Probability of function selection
const probOfFunc = parseInt(process.env.probOfFunc);

// ---------------------------------
// Configuration Parameters - Rate
// ---------------------------------

// Requests per second
const rps = parseInt(process.env.rps);

// Total duration in milliseconds
const totalDuration = parseInt(process.env.totalDuration);

// -------------------------
// Configuration Parameters - TRC
// -------------------------

// RetransmissionType
const RetransmissionType = 'noRetransmission';

// -------------------------
// Configuration Parameters - Queue
// -------------------------

// Dispatch read-only transactions to the KS transaction queue (ksQueue) or the default transaction queue (defQueue).
const readType = process.env.readType;

// Dispatch write operations transactions to either the KS transaction queue (ksQueue) or the default transaction queue (defQueue)
const writeType = process.env.writeType;

// -------------------------
// Additional Imports and Variables
// -------------------------

// Imports
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const zipfian = require('zipfian-integer');

// Variables related to Functions
const { controllerParameterModify, enqueueToQueueExport } = require('./transactioncontroller');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('./test-application/javascript/CAUtil.js');
const { buildCCPOrg1, buildWallet } = require('./test-application/javascript/AppUtil.js');

// Variables related to Fabric Network
let contract;
let gateways = [];
const GRPC = 0;
let ccp;
let wallet;
let qsccContract;

// Output key configuration parameters to the console
console.log(`Starting Fabric Server ${GRPC}...\ncaHost:${caHost}\ndepartment:${department}\nmspOrg:${mspOrg}\n`);

/**
 * Introduces a delay in asynchronous code by resolving a Promise after a specified time.
 *
 * @param {number} ms - The number of milliseconds to wait before resolving the Promise.
 * @returns {Promise} A Promise that resolves after the specified delay.
 */

function wait(ms) {
  // Create a new Promise that resolves after the specified delay (ms)
  return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 *  A test application to show basic queries operations with any of the asset-transfer-basic chaincodes
 *   -- How to submit a transaction
 *   -- How to query and check the results
 *
 * To see the SDK workings, try setting the logging to show on the console before running
 *        export HFC_LOGGING='{"debug":"console"}'
 *
 * @param {number} numAccount - The number of users to enroll.
 * @returns {Array} An array containing the connection profile (ccp), wallet, and enrolled user IDs.
 */

async function enrollUsers(numAccount) {
	try {
		// build an in memory object with the network configuration (also known as a connection profile)
		ccp = await buildCCPOrg1(GRPC.toString());

		// build an instance of the fabric ca services client based on
		// the information in the network configuration
		const caClient = buildCAClient(FabricCAServices, ccp, caHost);

		// setup the wallet to hold the credentials of the application user
		wallet = await buildWallet(Wallets, walletPath);

		// in a real application this would be done on an administrative flow, and only once
		await enrollAdmin(caClient, wallet, mspOrg);

        let users = [];
        for (let i = 0; i < numAccount; i++) {
            let user = `${orgUserId}-${Math.random()}`;
            // in a real application this would be done only when a new user was required to be added
		    // and would be part of an administrative flow
            await registerAndEnrollUser(caClient, wallet, mspOrg, user, department);
            users.push(user);
        }

        return ccp, wallet, users

    } catch (error) {
		console.error(`******** FAILED to enroll users: ${error}`);
        return error;
	}
}

/**
 * Retrieves a smart contract instance from the Fabric network.
 *
 * @param {object} ccp - The Common Connection Profile (CCP) containing network information.
 * @param {object} wallet - The wallet containing user identities.
 * @param {string} user - The identity of the user to connect to the network.
 * @returns {object} The smart contract instance.
 */

async function getCC(ccp, wallet, user) {
  try {
    // Create a new gateway instance for interacting with the fabric network.
    // In a real application this would be done as the backend server session is setup for
    // a user that has been verified.
    const gateway = new Gateway();

    // setup the gateway instance
    // The user will now be able to create connections to the fabric network and be able to
    // submit transactions and query. All transactions submitted by this gateway will be
    // signed by this user using the credentials stored in the wallet.
    await gateway.connect(ccp, {
        wallet,
        identity: user,
        discovery: { enabled: true, asLocalhost: false } // using asLocalhost as this gateway is using a fabric network deployed locally
    });


    // Store the connected gateway for later reference
    gateways.push(gateway);

    // Get the network associated with a specific channel
    const network = await gateway.getNetwork(channelName);

    // Get the contract instance associated with the specified chaincode
    const contract = network.getContract(chaincodeName);

    // Get the qscc contract for potential use
    qsccContract = network.getContract("qscc");

    // Return the contract instance
    return contract;
  } catch (error) {
    console.error(`******** FAILED to connect to the Fabric network: ${error}`);
    return error;
  }
}

/**
 * Create a new account in the system.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {String} id - The account ID.
 * @param {String} name - The account holder's name.
 * @param {Number} checkingBalance - The initial checking balance.
 * @param {Number} savingsBalance - The initial savings balance.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function createAccount(contract, RetransmissionType, id, name, checkingBalance, savingsBalance) {
  try {
    let key = id;
    var args = [id, name, checkingBalance, savingsBalance].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'CreateAccount', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'CreateAccount', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to createAccount: ${error}`);
    return error;
  }
}

/**
 * The main function responsible for creating user accounts and controlling parameters.
 */

async function main() {
    // Calculate the initial start time.
    let startTime = Date.now() + (30000 - (Date.now() % 30000)) + 30000;

    // Set up an interval to call the controllerParameterModify function every second.
    setInterval(function(){ controllerParameterModify() }, 1000);

    let users = [];
    let successOfCreateAccount = 0;

    // Find user files in the transferWallet directory and store their names in the 'users' array.
    fs.readdirSync('./transferWallet').forEach(file => {
        if (file.includes('appUser')) {
            users.push(file.slice(0, -3));
            console.log(file.slice(0, -3));
        }
    });

    // Build network configuration, wallet, and get the contract.
    ccp = await buildCCPOrg1(GRPC.toString());
    wallet = await buildWallet(Wallets, walletPath);
    contract = await getCC(ccp, wallet, users[0]);

    console.log(`Create multiple account addresses, wait a minute.`);

    // Create user accounts using a loop.
    for (let i = 0; i < numAccount; i++) {
        try {
            createAccount(contract, RetransmissionType, `${i}`, `n_${i}`, `1000`, `500`);
        } catch (error) {
            console.error(`******** FAILED to mint: ${error}`);
        }
    }

    // Continuously check for the completion of transactions and exit when all are completed.
    while (true) {
        const res = await controllerParameterModify();
        if (res.numCompletedTransactions == numAccount) {
            process.exit();
        }
        await wait(1000);
    }
}

// Call the main function to start the process.
main(); 