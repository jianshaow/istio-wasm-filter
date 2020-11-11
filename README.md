# istio-wasm-filter

* Prepair source and auth-service

~~~ shell
# install WebAssembly Hub CLI
curl -sL https://run.solo.io/wasme/install | sh
export PATH=$HOME/.wasme/bin:$PATH

# checkout source code
cd /tmp  && git clone https://github.com/jianshaow/istio-wasm-filter.git && cd istio-wasm-filter

# Istio version
export ISTIO_VERSION=1.7.4

# filter version
export FILTER_VERSION=v0.1.0

# prepair python environment according to auth-service/README.md
# run auth-service on another console
python auth-service/app.py
~~~

* Build with npm and run with docker

~~~ shell
# build locally with asbuild, tested on npm 6.14.4 @ node 13.14.0
npm install
npm run asbuild

# docker host address
export AUTH_SERVICE_HOST=$(ip route|awk '/docker0/ { print $9 }')

# run on istio proxy with docker
docker run -ti --rm -p 8080:8080 --entrypoint=envoy --add-host auth-service:$AUTH_SERVICE_HOST -v $PWD/config/bootstrap.yaml:/etc/envoy/bootstrap.yaml:ro -v $PWD/build:/var/lib/wasme:ro -w /var/lib/wasme istio/proxyv2:$ISTIO_VERSION -c /etc/envoy/bootstrap.yaml
~~~

* Build and run on envoy with wasme

~~~ shell
# build locally with wasme
wasme build assemblyscript -t webassemblyhub.io/jianshao/auth-filter:$FILTER_VERSION .

# push to remote repository
wasme push webassemblyhub.io/jianshao/auth-filter:$FILTER_VERSION

# run on a local envoy with wasme
wasme deploy envoy webassemblyhub.io/jianshao/auth-filter:$FILTER_VERSION --bootstrap config/bootstrap-tmpl.yaml --config auth-service --envoy-image istio/proxyv2:$ISTIO_VERSION
~~~

* Run on istio with wasme

~~~ shell
# create auth-service ServiceEntry
sed "s/{AUTH-SERVICE-HOST}/${AUTH_SERVICE_HOST}/g" template/auth-service.yaml > manifest/auth-service.yaml
kubectl apply -f manifest/auth-service.yaml

# run on istio with wasme
wasme deploy istio webassemblyhub.io/jianshao/auth-filter:$FILTER_VERSION -n foo --id anthz-filter --config "outbound|5000||auth-service" --ignore-version-check
~~~

* Declarative deployment on Istio

~~~ shell
# create wasme crds and operator
kubectl apply -f manifest/wasme.io_v1_crds.yaml
kubectl apply -f manifest/wasme-default.yaml

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