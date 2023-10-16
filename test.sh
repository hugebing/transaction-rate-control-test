# !/bin/bash

function restartFabric() {
    cd fabric-hosts/
    bash hostdown.sh
    sleep 3
    bash host1up.sh
    bash host2up.sh
    bash smallbank.sh
    cd ../
    export numAccount=10000
    export folderName="$(date +"%Y-%m-%d-%H:%M:%S")_createAccount_numAccount=$numAccount"
    cd data
    mkdir $folderName
    cd ..
    node smallbank-createAccount.js
    sleep 3
}

restartFabric

export skew=2
export probOfFunc=50
export type='retransmissionWithDelay'
export totalDuration=5000
export BatchSize=100
export numAccount=10000
export startTime=$((`date '+%s'`*1000+8000))
export hotAccount='all'
export functionType='all'
export readType='ksQueue'
export writeType='ksQueue'
export rps=400
export folderName="$(date +"%Y-%m-%d-%H:%M:%S")_smallbank_skew=$skew-probOfFunc=$probOfFunc-BatchSize=$BatchSize-numAccount=$numAccount-hotAccount=$hotAccount-functionType=$functionType-readType=$readType-writeType=$writeType-type=$type-rps=$rps"

cd fabric-hosts/
bash updateBatchSize.sh $BatchSize
cd ../
cd data
mkdir $folderName
cd ..
node smallbank-app.js 1 & node smallbank-app.js 2 & node smallbank-app.js 3 & node smallbank-app.js 4
