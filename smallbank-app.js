/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * This file contains the main configuration parameters and setup for the benchmarking program.
 * Ensure that these parameters are set correctly before running the benchmark.
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
const channelName = 'channel1';
const chaincodeName = 'smallbank';
const department = `org1.department1`;
const mspOrg = `Org1MSP`;
const walletPath = path.join(__dirname, 'transferWallet');
const orgUserId = `appUser`;

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

// Skew for generating account IDs
const skew = parseFloat(process.env.skew);

// Probability of function selection
const probOfFunc = parseInt(process.env.probOfFunc);

// Directory name
const folderName = process.env.folderName; 

// ---------------------------------
// Configuration Parameters - Rate
// ---------------------------------

// Requests per second
const rps = parseInt(process.env.rps);

// Total duration in milliseconds
const totalDuration = parseInt(process.env.totalDuration);

// Start time
const startTime = parseInt(process.env.startTime);

// -------------------------
// Configuration Parameters - TRC
// -------------------------

// Transaction rate control mechanism
const RetransmissionType = process.env.type;

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
const sample = zipfian(0, numAccount - 1, skew);

// Variables related to Functions
const { controllerParameterModify, updateClientStartTime, enqueueToQueueExport } = require('./transactioncontroller');
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
 * Query account information for a specific account ID.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {String} id - The account ID to query.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function query(contract, RetransmissionType, id) {
  try {
    let key = id;
    var args = [id].map(d => `"${d}"`).join(',');
    if (readType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'Query', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'Query', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to query: ${error}`);
  }
}

/**
 * Send a payment from one account to another.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {Number} checkingValue - The amount to send.
 * @param {String} toId - The recipient's account ID.
 * @param {String} fromId - The sender's account ID.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function sendPayment(contract, RetransmissionType, checkingValue, toId, fromId) {
  try {
    let key;
    if (hotAccount == 'recipient') {
      key = toId;
    } else {
      key = fromId;
    }
    var args = [checkingValue, toId, fromId].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'SendPayment', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'SendPayment', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to sendPayment: ${error}`);
    return error;
  }
}

/**
 * Write a check from the sender's account.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {Number} checkingValue - The amount to write on the check.
 * @param {String} id - The sender's account ID.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function writeCheck(contract, RetransmissionType, checkingValue, id) {
  try {
    let key = id;
    var args = [checkingValue, id].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'WriteCheck', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'WriteCheck', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to writeCheck: ${error}`);
    return error;
  }
}

/**
 * Perform a savings transaction for a specific account.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {Number} savingValue - The amount to transact for savings.
 * @param {String} id - The account ID.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function transactSavings(contract, RetransmissionType, savingValue, id) {
  try {
    let key = id;
    var args = [savingValue, id].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'TransactSavings', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'TransactSavings', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to transactSavings: ${error}`);
    return error;
  }
}

/**
 * Deposit a specific amount into the checking account.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {Number} checkingValue - The amount to deposit into checking.
 * @param {String} id - The account ID.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function depositChecking(contract, RetransmissionType, checkingValue, id) {
  try {
    let key = id;
    var args = [checkingValue, id].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'DepositChecking', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'DepositChecking', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to depositChecking: ${error}`);
    return error;
  }
}

/**
 * Amalgamate the funds of two accounts.
 *
 * @param {String} contract - The Fabric smart contract object.
 * @param {String} RetransmissionType - The Transaction Rate Control Type.
 * @param {String} toId - The recipient's account ID.
 * @param {String} fromId - The sender's account ID.
 * @returns {Boolean} - True if the transaction is successfully dispatched.
 */

async function amalgamate(contract, RetransmissionType, toId, fromId) {
  try {
    let key;
    if (hotAccount == 'recipient') {
      key = toId;
    } else {
      key = fromId;
    }
    var args = [toId, fromId].map(d => `"${d}"`).join(',');
    if (writeType == 'ksQueue') {
      return await enqueueToQueueExport(contract, 'amalgamate', key, RetransmissionType, false, [`[${args}]`]);
    } else {
      return await enqueueToQueueExport(contract, 'amalgamate', null, RetransmissionType, false, [`[${args}]`]);
    }
  } catch (error) {
    console.error(`******** FAILED to amalgamate: ${error}`);
    return error;
  }
}

function getRandom(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}


/**
 * Main function for the fixRate benchmark test. It simulates transactions at a fixed rate.
 * The function performs various transactions based on the provided parameters.
 */

async function fixRate() {
  let preTime = Date.now()
  let count = 0;
  while (true) {
    if (Date.now() - preTime >= totalDuration) {
      break;
    }
    for (let i = 0; i < rps; i++) {
      let fromId;
      let toId;
      let id;

      // Wait for a brief interval before each transaction
      await wait(0.5);

      // Decide whether to perform a query or a write transaction
      if (getRandom(1, 101) > probOfFunc) {
        if (hotAccount == 'all') {
          id = sample();
        } else {
          id = getRandom(0, numAccount);
        }
        // Perform a query transaction
        query(contract, RetransmissionType, id);
      } else {
        let functionNum;
        if (functionType == 'all') {
          functionNum = getRandom(1, 6);
        } else {
          functionNum = 1;
        }

        // Determine the sender, recipient, and account for the transaction
        if (hotAccount == 'all') {
          fromId = sample();
          toId = sample();
          id = sample();
        } else if (hotAccount == 'sender') {
          fromId = sample();
          toId = getRandom(0, numAccount);
          id = sample();
        } else if (hotAccount == 'recipient') {
          fromId = getRandom(0, numAccount);
          toId = sample();
          id = sample();
        } else if (hotAccount == 'null') {
          fromId = getRandom(0, numAccount);
          toId = getRandom(0, numAccount);
          id = getRandom(0, numAccount);
        }

        let checkingValue = 1;
        let savingValue = 1;

        // Perform the selected transaction function
        if (functionNum == 1) {
          sendPayment(contract, RetransmissionType, checkingValue, toId, fromId);
          console.log(`sendPayment`);
        } else if (functionNum == 2) {
          writeCheck(contract, RetransmissionType, checkingValue, id);
          console.log(`writeCheck`);
        } else if (functionNum == 3) {
          transactSavings(contract, RetransmissionType, savingValue, id);
          console.log(`transactSavings`);
        } else if (functionNum == 4) {
          depositChecking(contract, RetransmissionType, checkingValue, id);
          console.log(`depositChecking`);
        } else if (functionNum == 5) {
          amalgamate(contract, RetransmissionType, toId, fromId);
          console.log(`amalgamate`);
        }
      }

      count++;
    }
    console.log(count);
    console.log(totalDuration);
    // Wait to achieve the target transactions per second (rps)
    await wait(1000 - ((Date.now() - preTime) % 1000));
  }
}

/**
 * Merge two dictionaries by adding values for matching keys.
 *
 * @param {object} dict1 - The first dictionary to merge.
 * @param {object} dict2 - The second dictionary to merge.
 * @returns {object} A new dictionary containing the merged values.
 */

function addDictionaries(dict1, dict2) {
  const result = { ...dict1 };
  for (let key in dict2) {
    if (dict2.hasOwnProperty(key)) {
      if (result[key]) {
        result[key] += dict2[key];
      } else {
        result[key] = dict2[key];
      }
    }
  }
  return result;
}

/**
 * The main entry point of the program.
 */

async function main() {
  // Array to store user names
  let users = [];
  
  // Iterate through files in the './transferWallet' directory and extract user names
  fs.readdirSync('./transferWallet').forEach(file => {
    if (file.includes('appUser')) {
      users.push(file.slice(0, -3))
    }
  });
  
  // Initialize Chaincode Package Object (ccp)
  ccp = await buildCCPOrg1(GRPC.toString());
  
  // Create or load the wallet
  wallet = await buildWallet(Wallets, walletPath);
  
  // Get the contract instance for the first user
  contract = await getCC(ccp, wallet, users[0]);

  const readFile = require("util").promisify(fs.readFile);

  /**
   * Reads the content of a file specified by filePath.
   *
   * @param {string} filePath - The path to the file to read.
   * @returns {Promise<string>} A Promise that resolves with the file's content.
   */
  async function runRead(filePath) {
    try {
      const fr = await readFile(filePath, "utf-8");
      return fr;
    } catch (err) {
      console.log('Error', err);
    }
  }

  // Check if the benchmark type is 'fixRate'
  if (benchmarkType == 'fixRate') {
    // Wait for the specified start time
    await wait(startTime - Date.now());

    // Update the client's start time
    updateClientStartTime(Date.now());

    // Initialize and start the controllerParameterModify interval
    var controllerParameterModifyInterval = setInterval(function () { controllerParameterModify() }, 1000);
    
    console.log(`${Date.now()}`);

    // Store the current timestamp for reference
    let startForFixRate = Date.now();

    // Start the fixRate benchmark test
    await fixRate();

    // Store the timestamp after the test completion
    let endForFixRate = Date.now();

    // Execute controllerParameterModify and obtain the results
    await controllerParameterModify().then(async (res) => {
      // Build the result object with various performance metrics
      let result = {
        "folderName": folderName,
        "numCompletedTransactions": res.numCompletedTransactions,
        "numMvccrc": res.numCurrentMvccrc,
        "numTooFastError": res.numTooFastError,
        "numEndorseError": res.numEndorseError,
        "numOtherError": res.numOtherError,
        "tps": res.numCompletedTransactions / (totalDuration / 1000),
        "increaseKSQueueDequeueCount": res.increaseKSQueueDequeueCount,
        "defaultQueueControllerDuration": res.defaultQueueControllerDuration,
        "KSQueueControllerDuration": res.KSQueueControllerDuration,
        "KSQueueControllerSubmittedTransactions": res.KSQueueControllerSubmittedTransactions,
        "defaultQueueControllerSubmittedTransactions": res.defaultQueueControllerSubmittedTransactions,
        "KSQueueFunctionCount": res.KSQueueFunctionCount,
        "defaultQueueFunctionCount": res.defaultQueueFunctionCount,
        "functionMVCCRCCount": res.functionMVCCRCCount,
        "functionSuccessCount": res.functionSuccessCount,
        "amount": 1
      };

      // Clear the controllerParameterModify interval
      clearInterval(controllerParameterModifyInterval);

      // Wait for a specified duration before writing results to a file
      await wait(process.argv[2] * 2000);
      fs.writeFileSync(`data/${folderName}/total${process.argv[2]}.txt`, JSON.stringify(result));

      // Check if a total result file exists and read its contents
      if (fs.existsSync(`data/${folderName}/total.txt`) == true) {
        await runRead(`data/${folderName}/total.txt`).then(async (res) => {
          try {
            res = JSON.parse(res);
          } catch (err) {
            console.log('Error', err);
          }
          // Update the result object with data from the total result file
          result.numCompletedTransactions += res.numCompletedTransactions;
          result.numMvccrc += res.numMvccrc;
          result.numTooFastError += res.numTooFastError;
          result.numEndorseError += res.numEndorseError;
          result.numOtherError += res.numOtherError;
          result.tps = result.numCompletedTransactions / (totalDuration / 1000);
          result.increaseKSQueueDequeueCount += res.increaseKSQueueDequeueCount;
          result.defaultQueueControllerDuration += res.defaultQueueControllerDuration;
          result.KSQueueControllerDuration += res.KSQueueControllerDuration;
          result.KSQueueControllerSubmittedTransactions += res.KSQueueControllerSubmittedTransactions;
          result.defaultQueueControllerSubmittedTransactions += res.defaultQueueControllerSubmittedTransactions;
          result.KSQueueFunctionCount = await addDictionaries(result.KSQueueFunctionCount, res.KSQueueFunctionCount);
          result.defaultQueueFunctionCount = await addDictionaries(result.defaultQueueFunctionCount, res.defaultQueueFunctionCount);
          result.functionMVCCRCCount = await addDictionaries(result.functionMVCCRCCount, res.functionMVCCRCCount);
          result.functionSuccessCount = await addDictionaries(result.functionSuccessCount, res.functionSuccessCount);
          result.amount = res.amount + 1;
        });
        fs.writeFileSync(`data/${folderName}/total.txt`, JSON.stringify(result));
      } else {
        fs.writeFileSync(`data/${folderName}/total.txt`, JSON.stringify(result));
      }
    });
    
    // Wait for a specific duration before exiting the program
    await wait(2000);
    console.log(`finishTime ${Date.now()}   duration ${endForFixRate - startForFixRate}`);
    console.log(`View post-execution statistics, please go to folder data/${folderName}/total.txt.`);
    process.exit();
  }
}

// Start the main function
main();