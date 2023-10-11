// --------------------------
// External Module Imports
// --------------------------

// Import the Transaction class from the fabric-network library
const { Transaction } = require("fabric-network");

// Import the Console class from the console module
const { Console } = require("console");

// Import the fs module for file system operations
const fs = require("fs");

// Import the nano-time module for precise timing
const now = require('nano-time');

// Import the os module for operating system-related information
var os = require('os');


// -----------------------------
// Configuration Parameters - File and Logging
// -----------------------------

// Generate a timestamp for file naming
let timeOfFile = Date.now();

// Read the 'folderName' from the environment variables
const folderName = process.env.folderName;

// Generate a random number for naming log files
var rand = Math.ceil(Math.random() * 1000000);

// Initialize Console objects for logging
const logOfTransaction = new Console({
    stdout: fs.createWriteStream(`data/${folderName}/${timeOfFile}${rand}_logOfTransaction`),
});

const logOfResult = new Console({
    stdout: fs.createWriteStream(`data/${folderName}/${timeOfFile}${rand}_logOfResult`),
});

// -----------------------------
// Configuration Parameters - Timing and Congestion Control
// -----------------------------

// Initialize clientStartTime with a large initial value
var clientStartTime = 999999999999999;

// Initialize data structures and counters for managing transactions

// Keyed by competingKey
var KSQueues = {};

// Number of pending transactions
var numPendingTransaction = 0;

// Count of transactions with MVCC read conflict
var numMvcc = 0;

// Upper limit of pending transactions
var upperOfPendingTransaction = 32;

// Queue for default transactions
var defaultQueue = [];

// Lock status for competingKeys
var lockStatusQueue = {};

// Timestamp for congestion control
var lastTimeOfMinusUpperOfPendingTransaction = 0;

// Time interval for congestion control
var timeIntervalOfMinusUpperOfPendingTransaction = 5000;

// Threshold for adjusting upperOfPendingTransaction
var upperOfPendingTransactionSsthresh = 256;

// Variable to keep track of the count of transactions that were considered too fast
var tooFast = 0;

// -----------------------------
// Configuration Parameters - Error Handling
// -----------------------------

// Error counters

// Count of "Too Fast" errors
let numTooFastError = 0;

// Count of other errors
let numOtherError = 0;

// Count of endorsement errors
let numEndorseError = 0;

// -----------------------------
// Configuration Parameters - Monitoring and Statistics
// -----------------------------

// Counters and timers for monitoring and statistics

// Count of KSQueue dequeue operations
let increaseKSQueueDequeueCount = 0;

// Duration of defaultQueueController execution
let defaultQueueControllerDuration = 0;

// Duration of KSQueueController execution
let KSQueueControllerDuration = 0;

// Count of submitted transactions in KSQueueController
let KSQueueControllerSubmittedTransactions = 0;

// Count of submitted transactions in defaultQueueController
let defaultQueueControllerSubmittedTransactions = 0;

// Count of number of completed transactions
var numCompletedTransactions = 0;

// Variable to store the previous value of MVCCRC count
var numPreMvccrc = 0;

// -----------------------------
// Configuration Parameters - Function-Specific Counters
// -----------------------------

// Function-specific counters and data structures

// Count of transactions by function name in KSQueue
let KSQueueFunctionCount = {};

// Count of transactions by function name in defaultQueue
let defaultQueueFunctionCount = {};

// Count of successfully completed transactions by function name
let functionSuccessCount = {};

// Count of transactions with MVCC read conflict by function name
let functionMVCCRCCount = {};

// -----------------------------
// Configuration Parameters - Congestion Control Timing and History
// -----------------------------

// Timestamp and counters for congestion control

// Timestamp for congestion control
var preTime = 0;

// Number of completed transactions (used for calculating TPS)
var numPreCompletedTransactions = 0;


/**
 * Generates a random value within a specified range.
 *
 * @param  {Number} min - The minimum value.
 * @param  {Number} max - The maximum value.
 * @return {Number} A random number within the given range.
 */
function getRandomValue(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Increases the count of pending transactions.
 */
function addPendingTransaction() {
    numPendingTransaction += 1;
}

/**
 * Decreases the count of pending transactions and updates congestion control.
 */
function minusPendingTransaction() {
    updateCongestionControl();
    numPendingTransaction -= 1;
}

/**
 * Introduces a delay using Promises.
 *
 * @param  {Number} ms - The duration of the delay in milliseconds.
 * @return {Promise} A Promise that resolves after the specified delay.
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 * Asynchronously enqueues a transaction in a queue.
 *
 * @param  {Transaction} transaction - The transaction to be enqueued.
 * @param  {Number} startTime - The start time of the transaction.
 * @param  {String} competingKey - The competing key for the transaction (if any).
 * @param  {String} retransmissionPolicy - The retransmission policy for the transaction.
 * @param  {Boolean} needResponse - Indicates whether a response is needed.
 * @param  {...any} args - Additional arguments for the transaction.
 * @return {Promise} A Promise indicating the success of enqueuing the transaction.
 */
async function enqueueToQueue(transaction, startTime, competingKey, retransmissionPolicy, needResponse, ...args) {
    // Check if a response is needed
    if (needResponse == true) {
        // Check if there is a competing key
        if (competingKey === null) {
            return new Promise((res, rej) => {
                defaultQueue.push([transaction, startTime, retransmissionPolicy, res, args]);
                defaultQueueController();
            });
        } else {
            return new Promise((res, rej) => {
                if (competingKey === undefined) {
                    competingKey = `${transaction.contract.chaincodeId}_${transaction.name}`;
                }
                if (KSQueues[competingKey] === undefined) {
                    KSQueues[competingKey] = [];
                }
                KSQueues[competingKey].push([transaction, startTime, retransmissionPolicy, res, args]);
                KSQueueController(competingKey);
            });
        }
    } else {
        if (competingKey === null) {
            defaultQueue.push([transaction, startTime, retransmissionPolicy, args]);
            defaultQueueController();
        } else {
            if (competingKey === undefined) {
                competingKey = `${transaction.contract.chaincodeId}_${transaction.name}`;
            }
            if (KSQueues[competingKey] === undefined) {
                KSQueues[competingKey] = [];
            }
            KSQueues[competingKey].push([transaction, startTime, retransmissionPolicy, args]);
            KSQueueController(competingKey);
        }
    } 
}

/**
 * Asynchronously creates a transaction and retrieves its data.
 *
 * @param  {Object} contract - The contract object for the transaction.
 * @param  {String} name - The name of the transaction.
 * @return {Promise} A Promise with the created transaction data.
 */
async function createTransactionAndGetData(contract, name) {
    return await contract.createTransaction(name);
}

/**
 * Asynchronously controls the default queue of transactions.
 */
async function defaultQueueController() {
    var currentTime = now();

    if (numPendingTransaction < upperOfPendingTransaction) {
        if (defaultQueue.length != 0) {
            let transaction;
            let retransmissionPolicy;
            let callback = null;
            let args;

            addPendingTransaction();

            if (defaultQueue[0].length == 5) {
                transaction = defaultQueue[0][0];
                startTime = defaultQueue[0][1];
                retransmissionPolicy = defaultQueue[0][2];
                callback = defaultQueue[0][3];
                args = defaultQueue[0][4];
            } else {
                transaction = defaultQueue[0][0];
                startTime = defaultQueue[0][1];
                retransmissionPolicy = defaultQueue[0][2];
                args = defaultQueue[0][3];
            }

            defaultQueue.splice(0, 1);

            if (defaultQueueFunctionCount[transaction.name] === undefined) {
                defaultQueueFunctionCount[transaction.name] = 0;
            }

            defaultQueueFunctionCount[transaction.name] += 1;

            await wait(getRandomValue(0, 1000));

            defaultQueueControllerSubmittedTransactions++;

            const result = await submitTransaction(transaction, startTime, retransmissionPolicy, args);

            if (callback != null) {
                callback(result);
            }

            if (defaultQueue.length != 0) {
                defaultQueueController();
            }

            defaultQueueControllerDuration += (now() - currentTime);

            return result;
        }
    } else {
        await wait(100);
        defaultQueueController();
    }      
}

/**
 * Asynchronously controls the special (KS) queues of transactions.
 */
async function KSQueueController(competingKey) {
    var currentTime = now();

    if (lockStatusQueue[competingKey] == undefined) {
        lockStatusQueue[competingKey] = false;
    }

    if (lockStatusQueue[competingKey] != true && KSQueues[competingKey] !== undefined) {
        if (numPendingTransaction < upperOfPendingTransaction) {
            let transaction;
            let retransmissionPolicy;
            let callback = null;
            let args;

            increaseKSQueueDequeueCount++;

            addPendingTransaction();

            if (KSQueues[competingKey][0].length == 5) {
                transaction = KSQueues[competingKey][0][0];
                startTime = KSQueues[competingKey][0][1];
                retransmissionPolicy = KSQueues[competingKey][0][2];
                callback = KSQueues[competingKey][0][3];
                args = KSQueues[competingKey][0][4];
            } else {
                transaction = KSQueues[competingKey][0][0];
                startTime = KSQueues[competingKey][0][1];
                retransmissionPolicy = KSQueues[competingKey][0][2];
                args = KSQueues[competingKey][0][3];
            }

            increaseKSQueueDequeueCount++;

            addPendingTransaction();

            if (KSQueues[competingKey][0].length == 5) {
                transaction = KSQueues[competingKey][0][0];
                startTime = KSQueues[competingKey][0][1];
                retransmissionPolicy = KSQueues[competingKey][0][2];
                callback = KSQueues[competingKey][0][3];
                args = KSQueues[competingKey][0][4];
            } else {
                transaction = KSQueues[competingKey][0][0];
                startTime = KSQueues[competingKey][0][1];
                retransmissionPolicy = KSQueues[competingKey][0][2];
                args = KSQueues[competingKey][0][3];
            }

            lockStatusQueue[competingKey] = true;

            KSQueues[competingKey].splice(0, 1);

            if (!KSQueues[competingKey].length) {
                delete KSQueues[competingKey];
            }

            await wait(getRandomValue(0, 1000));

            KSQueueControllerSubmittedTransactions++;

            const result = await submitTransaction(transaction, startTime, retransmissionPolicy, args);

            lockStatusQueue[competingKey] = false;

            if (callback != null) {
                callback(result);
            }

            KSQueueController(competingKey);

            KSQueueControllerDuration += (now() - currentTime);

            return result;
        } else {
            await wait(100);
            KSQueueController(competingKey);
        }
    }
}

/**
 * Asynchronously handles transaction retransmissions with delay.
 *
 * @param  {Transaction} transaction - The transaction to be retransmitted.
 * @param  {String} retransmissionPolicy - The retransmission policy for the transaction.
 * @param  {Array} args - Additional arguments for the transaction.
 * @param  {Number} countOfResend - The count of resends for the transaction.
 * @return {Promise} A Promise with the result of the retransmission.
 */
async function transactionRetransmit(transaction, retransmissionPolicy, args, countOfResend) {
    countOfResend += 1;

    let retransmissionCount = 0;

    if (retransmissionPolicy == 'retransmissionWithDelay') {
        if (countOfResend <= 4) {
            retransmissionCount = Math.pow(2, countOfResend);
        } else {
            retransmissionCount = 16;
        }
    }

    console.log(`Transaction ID ${transaction.getTransactionId()} MVCC_READ_CONFLICT "RESEND" WAIT ${retransmissionCount}`);
    await wait(Math.floor(Math.random() * retransmissionCount * 1000));
    addPendingTransaction();
    let newTransaction = await createTransactionAndGetData(transaction.contract, transaction.name);
    let startTime = Date.now();
    return await submitTransaction(newTransaction, startTime, retransmissionPolicy, args, countOfResend).then((res) => {
        return [newTransaction.getTransactionId(), res, countOfResend];
    });
}

/**
 * Asynchronously submits a transaction.
 *
 * @param  {Transaction} transaction - The transaction to be submitted.
 * @param  {Number} startTime - The start time of the transaction.
 * @param  {String} retransmissionPolicy - The retransmission policy for the transaction.
 * @param  {Array} args - Additional arguments for the transaction.
 * @param  {Number} countOfResend - The count of resends for the transaction.
 * @return {Promise} A Promise with the result of the transaction submission.
 */
async function submitTransaction(transaction, startTime, retransmissionPolicy, args, countOfResend = 0) {
    try {
        if (Date.now() >= clientStartTime + 60000) {
            return "timeout";
        }
        return await transaction.submit(...args).then((res) => {
            if (Date.now() >= clientStartTime + 60000) {
                return "timeout";
            }

            if (functionSuccessCount[transaction.name] === undefined) {
                functionSuccessCount[transaction.name] = 0;
            }

            functionSuccessCount[transaction.name] += 1;

            minusPendingTransaction();

            numCompletedTransactions += 1;

            logOfTransaction.log([transaction.getTransactionId(), args, res.toString(), countOfResend, startTime, Date.now()]);

            return [transaction.getTransactionId(), `${transaction.getName()} ${res}`, countOfResend];
        });
    } catch (errMsg) {
        if (Date.now() >= clientStartTime + 60000) {
            return "timeout";
        }

        if (errMsg != undefined) {
            if (errMsg.toString().includes("MVCC_READ_CONFLICT")) {
                if (functionMVCCRCCount[transaction.name] === undefined) {
                    functionMVCCRCCount[transaction.name] = 0;
                }

                functionMVCCRCCount[transaction.name] += 1;

                numMvcc += 1;

                minusPendingTransaction();

                logOfTransaction.log([transaction.getTransactionId(), args, `MVCCRC ${transaction.getName()}`, countOfResend, startTime, Date.now()]);

                if (retransmissionPolicy == 'retransmissionWithoutDelay' || retransmissionPolicy == 'retransmissionWithDelay') {
                    return await transactionRetransmit(transaction, retransmissionPolicy, args, countOfResend);
                } else {
                    console.log(`Transaction ID ${transaction.getTransactionId()} MVCC_READ_CONFLICT "NO RESEND"`);
                    return [transaction.getTransactionId(), `MVCCRC ${transaction.getName()}`];
                }
            } else if (errMsg.toString().includes("exceeding concurrency limit") || errMsg.toString().includes("No endorsement plan available")) {
                numTooFastError += 1;
                logOfTransaction.log([transaction.getTransactionId(), args, `ERROR TOO MANY TRANSACTIONS OR PARAMETER ERROR ${transaction.getName()}`, countOfResend, startTime, Date.now()]);
                tooFast += 1;
                minusPendingTransaction();
                return await transactionRetransmit(transaction, 2, args, countOfResend);
            } else if (errMsg.toString().includes("endorsements do not match")) {
                numEndorseError += 1;
                minusPendingTransaction();
            } else {
                minusPendingTransaction();
            }
        } else {
            logOfTransaction.log([transaction.getTransactionId(), args, `Other Error ${transaction.getName()}`, countOfResend, startTime, Date.now()]);
            minusPendingTransaction();
        }
        throw errMsg;
    }
}

/**
 * Exports the function for enqueuing transactions.
 *
 * @param  {Object} contract - The contract object for the transaction.
 * @param  {String} name - The name of the transaction.
 * @param  {String} competingKey - The competing key for the transaction (if any).
 * @param  {String} retransmissionPolicy - The retransmission policy for the transaction.
 * @param  {Boolean} needResponse - Indicates whether a response is needed.
 * @param  {...any} args - Additional arguments for the transaction.
 * @return {Promise} A Promise indicating the success of enqueuing the transaction.
 */
exports.enqueueToQueueExport = async (contract, name, competingKey, retransmissionPolicy, needResponse, ...args) => {
    let transaction = await createTransactionAndGetData(contract, name);
    let startTime = Date.now();
    enqueueToQueue(transaction, startTime, competingKey, retransmissionPolicy, needResponse, ...args);
}

/**
 * Updates the client's start time.
 *
 * @param  {Number} time - The new client start time.
 */
exports.updateClientStartTime = async (time) => {
    clientStartTime = time;
}

/**
 * Modifies congestion control parameters based on current statistics.
 */
exports.controllerParameterModify = async () => {
    let currentTime = Date.now();
    let numCurrentCompletedTransactions = numCompletedTransactions;
    let numCurrentMvcc = numMvcc;
    let TPS = (numCurrentCompletedTransactions - numPreCompletedTransactions) / ((currentTime - preTime) / 1000);
    let MVCCPerSecond = (numCurrentMvcc - numPreMvccrc) / ((currentTime - preTime) / 1000);
    let result = {
        "preTime": preTime,
        "currentTime": currentTime,
        "numPendingTransaction": numPendingTransaction,
        "upperOfPendingTransaction": upperOfPendingTransaction,
        "TPS": TPS,
        "MVCCPerSecond": MVCCPerSecond,
        "ratioOfMVCC": MVCCPerSecond / (TPS + MVCCPerSecond),
        "lengthOfNormalQueue": defaultQueue.length,
        "numKSQueueTypes": Object.keys(KSQueues).length,
        "numCompletedTransactions": numCurrentCompletedTransactions,
        "numCurrentMvcc": numCurrentMvcc,
        "numTooFastError": numTooFastError,
        "numEndorseError": numEndorseError,
        "numOtherError": numOtherError,
        "increaseKSQueueDequeueCount": increaseKSQueueDequeueCount,
        "defaultQueueControllerDuration": defaultQueueControllerDuration,
        "KSQueueControllerDuration": KSQueueControllerDuration,
        "KSQueueControllerSubmittedTransactions": KSQueueControllerSubmittedTransactions,
        "defaultQueueControllerSubmittedTransactions": defaultQueueControllerSubmittedTransactions,
        "KSQueueFunctionCount": KSQueueFunctionCount,
        "defaultQueueFunctionCount": defaultQueueFunctionCount,
        "functionMVCCRCCount": functionMVCCRCCount,
        "functionSuccessCount": functionSuccessCount,
        "cpus": os.cpus(),
        "totalmem": os.totalmem(),
        "freemem": os.freemem()
    }

    logOfResult.log(result);

    return result;
}

/**
 * Updates the congestion control parameters.
 */
function updateCongestionControl() {
    let currentTime = Date.now();
    let numCurrentCompletedTransactions = numCompletedTransactions;
    let numCurrentMvcc = numMvcc;

    if (tooFast >= 1 && currentTime - lastTimeOfMinusUpperOfPendingTransaction >= timeIntervalOfMinusUpperOfPendingTransaction) {
        lastTimeOfMinusUpperOfPendingTransaction = currentTime;
        upperOfPendingTransaction = upperOfPendingTransaction / 2;
        tooFast = 0;
    } else {
        if (upperOfPendingTransaction >= upperOfPendingTransactionSsthresh && numPendingTransaction >= upperOfPendingTransaction) {
            upperOfPendingTransaction = upperOfPendingTransaction + (1 / upperOfPendingTransaction);
        } else if (upperOfPendingTransaction < upperOfPendingTransactionSsthresh && numPendingTransaction >= upperOfPendingTransaction) {
            upperOfPendingTransaction = upperOfPendingTransaction * 2;
        }
    }

    preTime = currentTime;
    numPreCompletedTransactions = numCurrentCompletedTransactions;
    numPreMvccrc = numCurrentMvcc;
}