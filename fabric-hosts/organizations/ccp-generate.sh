#!/bin/bash

function one_line_pem {
    echo "`awk 'NF {sub(/\\n/, ""); printf "%s\\\\\\\n",$0;}' $1`"
}

function json_ccp {
    local PP=$(one_line_pem $4)
    local CP=$(one_line_pem $5)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${PEERPORT}/$2/" \
        -e "s/\${CAPORT}/$3/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${CAPEM}#$CP#" \
        -e "s/\${CAPORT}/$3/" \
        -e "s#\${PEER}#$6#" \
        organizations/ccp-template.json
}

function yaml_ccp {
    local PP=$(one_line_pem $4)
    local CP=$(one_line_pem $5)
    sed -e "s/\${ORG}/$1/" \
        -e "s/\${PEERPORT}/$2/" \
        -e "s/\${CAPORT}/$3/" \
        -e "s#\${PEERPEM}#$PP#" \
        -e "s#\${PEER}#$6#" \
        organizations/ccp-template.yaml | sed -e $'s/\\\\n/\\\n          /g'
}


PEER0=0
PEER1=1
PEER2=2

ORG=1
P0PORT=7051
P1PORT=7151
P2PORT=7251

CAPORT=7054
PEERPEM=organizations/peerOrganizations/org1.example.com/tlsca/tlsca.org1.example.com-cert.pem
CAPEM=organizations/peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem

echo "$(json_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM $PEER0)" > organizations/peerOrganizations/org1.example.com/connection-org1-0.json
echo "$(yaml_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM $PEER0)" > organizations/peerOrganizations/org1.example.com/connection-org1-0.yaml

echo "$(json_ccp $ORG $P1PORT $CAPORT $PEERPEM $CAPEM $PEER1)" > organizations/peerOrganizations/org1.example.com/connection-org1-1.json
echo "$(yaml_ccp $ORG $P1PORT $CAPORT $PEERPEM $CAPEM $PEER1)" > organizations/peerOrganizations/org1.example.com/connection-org1-1.yaml

echo "$(json_ccp $ORG $P2PORT $CAPORT $PEERPEM $CAPEM $PEER2)" > organizations/peerOrganizations/org1.example.com/connection-org1-2.json
echo "$(yaml_ccp $ORG $P2PORT $CAPORT $PEERPEM $CAPEM $PEER2)" > organizations/peerOrganizations/org1.example.com/connection-org1-2.yaml

ORG=2
P0PORT=9051
P1PORT=9151
P2PORT=9251

CAPORT=8054
PEERPEM=organizations/peerOrganizations/org2.example.com/tlsca/tlsca.org2.example.com-cert.pem
CAPEM=organizations/peerOrganizations/org2.example.com/ca/ca.org2.example.com-cert.pem

echo "$(json_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM $PEER0)" > organizations/peerOrganizations/org2.example.com/connection-org2-0.json
echo "$(yaml_ccp $ORG $P0PORT $CAPORT $PEERPEM $CAPEM $PEER0)" > organizations/peerOrganizations/org2.example.com/connection-org2-0.yaml

echo "$(json_ccp $ORG $P1PORT $CAPORT $PEERPEM $CAPEM $PEER1)" > organizations/peerOrganizations/org2.example.com/connection-org2-1.json
echo "$(yaml_ccp $ORG $P1PORT $CAPORT $PEERPEM $CAPEM $PEER1)" > organizations/peerOrganizations/org2.example.com/connection-org2-1.yaml

echo "$(json_ccp $ORG $P2PORT $CAPORT $PEERPEM $CAPEM $PEER2)" > organizations/peerOrganizations/org2.example.com/connection-org2-2.json
echo "$(yaml_ccp $ORG $P2PORT $CAPORT $PEERPEM $CAPEM $PEER2)" > organizations/peerOrganizations/org2.example.com/connection-org2-2.yaml
