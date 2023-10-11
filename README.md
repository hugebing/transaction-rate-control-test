# transaction-rate-control-test

This repository is designed for testing a Transaction Rate Control Mechanism in a Hyperledger Fabric 2.2 network. The network configuration is pre-set to use a fixed set of Hyperledger Fabric key materials for the sake of convenience in experimentation.

## Prerequisites

Before getting started, make sure you have the following prerequisites:

- Node.js version 10.20.0
- npm version 6.14.4
- [Hyperledger Fabric 2.2](https://hyperledger-fabric.readthedocs.io/en/release-2.2/getting_started.html) is installed.

## Getting Started

1. Clone this repository to your local machine:

   ```bash
   git clone https://github.com/hugebing/transaction-rate-control-test.git

2. Setting Up the Fabric Network:

   The fabric network comes pre-configured with fixed key materials for convenience.
   You do not need to re-register users when connecting the Fabric client; simply use the provided user key materials.
   
   If you intend to deploy Fabric on multiple hosts, please refer to this guide https://kctheservant.medium.com/multi-host-deployment-for-first-network-hyperledger-fabric-v2-273b794ff3d .
   
   Update your /etc/hosts file by adding the following entries:
   
   127.0.0.1 orderer.example.com
   127.0.0.1 peer0.org1.example.com
   127.0.0.1 peer1.org1.example.com
   127.0.0.1 peer2.org1.example.com
   
   127.0.0.1 peer0.org2.example.com
   127.0.0.1 peer1.org2.example.com
   127.0.0.1 peer2.org2.example.com
   
   The purpose of these entries is to map the domain names to your local machine's IP address.

3. Navigate to the transaction-rate-control-test directory:

   ```bash
   cd transaction-rate-control-test

4. Execute the test script:

   ```bash
   bash test.sh
   
## License
This project is licensed under the MIT License.
   
