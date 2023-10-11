cd docker/
docker-compose -f host1.yaml down  --volumes --remove-orphans
docker-compose -f host2.yaml down  --volumes --remove-orphans
cd ..
docker rm -f $(docker ps -aq)
docker volume prune -f