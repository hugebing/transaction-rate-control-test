/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/chaincode/smallbank/chaincode-go/chaincode"
)

func main() {
	smallbankChaincode, err := contractapi.NewChaincode(&chaincode.SmallbankChaincode{})
	if err != nil {
		log.Panicf("Error creating smallbank chaincode: %v", err)
	}

	if err := smallbankChaincode.Start(); err != nil {
		log.Panicf("Error starting smallbank chaincode: %v", err)
	}
}
