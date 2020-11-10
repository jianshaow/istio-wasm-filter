# istio-wasm-filter

Based on Istio 1.5.x

~~~ shell
# install WebAssembly Hub CLI
curl -sL https://run.solo.io/wasme/install | sh
export PATH=$HOME/.wasme/bin:$PATH

# checkout source code
cd /tmp  && git clone https://github.com/jianshaow/istio-wasm-filter.git && cd istio-wasm-filter

# Istio version
export ISTIO_VERSION=1.5.10

# filter version
export FILTER_VERSION=v0.0.2

# prepair python environment according to authn-service/README.md
# run authn-service on another console
python authn-service/app.py
~~~

* Build with npm and run with docker

~~~ shell
# build locally with asbuild, tested on npm 6.14.4 @ node 13.14.0
npm install
npm run asbuild

# docker host address
export AUTHN_SERVICE_HOST=$(ip route|awk '/docker0/ { print $9 }')

# run on istio proxy with docker
docker run -ti --rm -p 8080:8080 --entrypoint=envoy --add-host authn-service:$AUTHN_SERVICE_HOST -v $PWD/config/bootstrap.yaml:/etc/envoy/bootstrap.yaml:ro -v $PWD/build:/var/lib/wasme:ro -w /var/lib/wasme istio/proxyv2:$ISTIO_VERSION -c /etc/envoy/bootstrap.yaml
~~~

* Build and run on envoy with wasme

~~~ shell
# build locally with wasme
wasme build assemblyscript -t webassemblyhub.io/jianshao/authz-filter:$FILTER_VERSION .

# run on a local envoy with wasme
wasme deploy envoy webassemblyhub.io/jianshao/authz-filter:$FILTER_VERSION --bootstrap config/bootstrap-tmpl.yaml --config authn-service --envoy-image istio/proxyv2:$ISTIO_VERSION
~~~

* Run on istio with wasme

~~~ shell
# create authn-service ServiceEntry
sed "s/{AUTHN-SERVICE-HOST}/${AUTHN_SERVICE_HOST}/g" template/authn-service.yaml > manifest/authn-service.yaml
kubectl apply -f manifest/authn-service.yaml

# run on istio with wasme
wasme deploy istio webassemblyhub.io/jianshao/authz-filter:$FILTER_VERSION -n foo --id anthz-filter --config "outbound|5000||authn-service"
~~~

* Declarative deployment on Istio

~~~ shell
# push to remote repository
wasme push webassemblyhub.io/jianshao/authz-filter:$FILTER_VERSION

# create wasme crds and operator
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme.io_v1_crds.yaml
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme-default.yaml

# declarative deployment
sed "s/{FILTER_VERSION}/${FILTER_VERSION}/g" template/filter-deploy.yaml > manifest/filter-deploy.yaml
kubectl apply -f manifest/filter-deploy.yaml
~~~

* Test on local

~~~ shell
# test success
curl -v -H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" -H "X-Request-Priority:50" localhost:8000/anything

# test failure
curl -v -H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" -H "X-Request-Priority:50" localhost:8000/anything/failure
~~~

* Test on Istio

~~~ shell
# create foo ns and deploy a httpbin on it
kubectl create ns foo
kubectl label ns foo istio-injection=enabled
kubectl apply -f https://raw.githubusercontent.com/istio/istio/$ISTIO_VERSION/samples/httpbin/httpbin.yaml -n foo

# run on minikube environment
export SECURED_HTTPBIN=$(kubectl get service httpbin -n foo -o go-template='{{.spec.clusterIP}}')

# access httpbin service success
curl -i -X POST \
-H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" \
-H "Content-Type:application/json" \
-H "X-Request-Priority:50" \
-d \
'{
  "message":"hello world!"
}' \
"http://$SECURED_HTTPBIN:8000/anything"

# access httpbin service failure
curl -i -X POST \
-H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" \
-H "Content-Type:application/json" \
-H "X-Request-Priority:50" \
-d \
'{
  "message":"hello world!"
}' \
"http://$SECURED_HTTPBIN:8000/anything/failure"
~~~