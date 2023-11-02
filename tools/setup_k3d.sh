#!/bin/bash

# Start a k3d cluster with kuma, grafana stack and an example app. This is useful for testing.

echo "Starting k3d cluster"
curl -s https://raw.githubusercontent.com/kumahq/kuma-tools/master/k3d-helm-standalone.sh | sh

docker run --rm kumahq/kumactl:1.3.1 kumactl install metrics | kubectl apply -f -
echo "Waiting for grafana stack to be up"
kubectl wait -n kuma-metrics --timeout=30s --for condition=Ready --all pods

curl -s https://gist.githubusercontent.com/lahabana/b0181c680fb7ed63f9f6341992265725/raw/1385aae235a2b0bc4964c21efe23af6108e91adb/services.yaml | kubectl apply -f -
echo "Waiting to example apps to get started"
kubectl wait -n kuma-test --timeout=30s --for condition=Ready --all pods

docker run  -p 3000:3000 -d  --network k3d-kuma-demo -e GF_DEFAULT_APP_MODE=development -v /Users/cmolter/code/kuma-datasource/dist:/var/lib/grafana/plugins --name=grafana grafana/grafana:9.5.13


echo "grafana is exposed on port 3000, control-plane on 5681 and prometheus-server on 9090 interrupt to close these port-forward"
wait
