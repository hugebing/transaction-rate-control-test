echo "Fetching the latest block"
# ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
# docker exec -e CHANNEL_NAME=channel1 -e ORDERER_CA=$ORDERER_CA cli1 bash -c 'peer channel fetch config config_block.pb -o orderer.example.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA'

export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
peer channel fetch config config_block.pb -o orderer.example.com:7050 --ordererTLSHostnameOverride orderer.example.com -c channel1 --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
docker cp config_block.pb cli1:/opt/gopath/src/github.com/hyperledger/fabric/peer/config_block.pb

echo "Decoding the configuration block into JSON format"
docker exec cli1 sh -c 'configtxlator proto_decode --input config_block.pb --type common.Block | jq .data.data[0].payload.data.config > config.json'
echo "we can see the config.json file"
docker exec cli1 sh -c 'ls -lh'

echo "Current value of Batch Size"
MAXBATCHSIZEPATH=".channel_group.groups.Orderer.values.BatchSize.value.max_message_count"
old_size=$(docker exec -e MAXBATCHSIZEPATH=$MAXBATCHSIZEPATH  cli1 sh -c 'jq "$MAXBATCHSIZEPATH" config.json')

echo "Updating the value Batch Size value from $old_size to $1"
docker exec -e MAXBATCHSIZEPATH=$MAXBATCHSIZEPATH -e new_size=$1 cli1 sh -c 'jq "$MAXBATCHSIZEPATH = $new_size" config.json > modified_config.json'
docker exec cli1 sh -c 'ls -lh'
docker exec -e MAXBATCHSIZEPATH=$MAXBATCHSIZEPATH cli1 sh -c 'jq "$MAXBATCHSIZEPATH" modified_config.json'

echo "Converting JSON to ProtoBuf"
docker exec cli1 sh -c 'configtxlator proto_encode --input config.json --type common.Config --output config.pb'
docker exec cli1 sh -c 'configtxlator proto_encode --input modified_config.json --type common.Config --output modified_config.pb'
docker exec cli1 sh -c 'ls -lh'

echo "Computing the Delta"
docker exec -e CHANNEL_NAME=channel1 cli1 sh -c 'configtxlator compute_update --channel_id $CHANNEL_NAME --original config.pb --updated modified_config.pb --output final_update.pb'
docker exec cli1 sh -c 'ls -lh'

echo "Adding the update to the envelope"
docker exec cli1 sh -c 'configtxlator proto_decode --input final_update.pb --type common.ConfigUpdate | jq . > final_update.json'
docker exec cli1 sh -c 'echo "{\"payload\":{\"header\":{\"channel_header\":{\"channel_id\":\"channel1\", \"type\":2}},\"data\":{\"config_update\":"$(cat final_update.json)"}}}" | jq . >  header_in_envolope.json'
docker exec cli1 sh -c 'configtxlator proto_encode --input header_in_envolope.json --type common.Envelope --output final_update_in_envelope.pb'
docker exec cli1 sh -c 'ls -lh'

echo "Signing the update"
docker exec cli1 sh -c 'peer channel signconfigtx -f final_update_in_envelope.pb'

echo "Initiate the Update command"
export CORE_PEER_LOCALMSPID="OrdererMSP"
export CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/users/Admin@example.com/msp/
export CORE_PEER_ADDRESS=orderer.example.com:7050
export ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt
export CHANNEL_NAME=channel1
# ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
docker exec -e ORDERER_CA=$ORDERER_CA -e CORE_PEER_LOCALMSPID=$CORE_PEER_LOCALMSPID  -e CORE_PEER_TLS_ROOTCERT_FILE=$CORE_PEER_TLS_ROOTCERT_FILE -e CORE_PEER_MSPCONFIGPATH=$CORE_PEER_MSPCONFIGPATH -e CORE_PEER_ADDRESS=$CORE_PEER_ADDRESS -e CHANNEL_NAME=channel1  cli1 bash -c 'peer channel update -f final_update_in_envelope.pb -c $CHANNEL_NAME -o orderer.example.com:7050 --tls --cafile $ORDERER_CA'

echo "Verification"
# ORDERER_CA=/opt/gopath/src/github.com/hyperledger/fabric/peer/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
# docker exec -e CHANNEL_NAME=channel1 -e ORDERER_CA=$ORDERER_CA cli1 bash -c 'peer channel fetch config config_block.pb -o orderer.example.com:7050 -c $CHANNEL_NAME --tls --cafile $ORDERER_CA'
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
peer channel fetch config config_block.pb -o orderer.example.com:7050 -c channel1 --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
docker cp config_block.pb cli1:/opt/gopath/src/github.com/hyperledger/fabric/peer/config_block.pb
docker exec cli1 sh -c 'configtxlator proto_decode --input config_block.pb --type common.Block | jq .data.data[0].payload.data.config > config.json'
docker exec -e MAXBATCHSIZEPATH=$MAXBATCHSIZEPATH cli1 sh -c 'jq "$MAXBATCHSIZEPATH" config.json'
