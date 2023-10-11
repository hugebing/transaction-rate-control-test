cd docker 
export IMAGE_TAG="latest"
docker-compose -f host1.yaml up -d
# docker-compose -f host2.yaml up -d
cd ..
docker ps -a
