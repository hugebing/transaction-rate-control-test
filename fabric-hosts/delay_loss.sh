docker exec peer0.org1.example.com apk add iproute2
docker exec -it peer0.org1.example.com tc qdisc add dev eth0 root netem delay 0ms
docker exec -it peer0.org1.example.com tc qdisc change dev eth0 root netem delay 100ms loss 0%

docker exec peer1.org1.example.com apk add iproute2
docker exec -it peer1.org1.example.com tc qdisc add dev eth0 root netem delay 0ms
docker exec -it peer1.org1.example.com tc qdisc change dev eth0 root netem delay 100ms loss 0%

docker exec peer2.org1.example.com apk add iproute2
docker exec -it peer2.org1.example.com tc qdisc add dev eth0 root netem delay 0ms
docker exec -it peer2.org1.example.com tc qdisc change dev eth0 root netem delay 100ms loss 0%


docker exec orderer.example.com apk add iproute2
docker exec -it orderer.example.com tc qdisc add dev eth0 root netem delay 0ms
docker exec -it orderer.example.com tc qdisc change dev eth0 root netem delay 100ms loss 0%
