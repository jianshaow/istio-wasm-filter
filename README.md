# istio-wasm-filter

~~~ shell
# install WebAssembly Hub CLI
curl -sL https://run.solo.io/wasme/install | sh
export PATH=$HOME/.wasme/bin:$PATH

# checkout source code
cd /tmp  && git clone https://github.com/jianshaow/istio-wasm-filter.git && cd istio-wasm-filter

# build locally with wasme
wasme build assemblyscript -t webassemblyhub.io/jianshao/authz-filter:v0.0.2 .

# run on a local envoy with wasme
wasme deploy envoy webassemblyhub.io/jianshao/authz-filter:v0.0.2 --bootstrap=bootstrap-tmpl.yaml --config=authn-service

# build locally with asbuild
npm run asbuild

# run on istio proxy with docker
docker run -ti --rm -p 8080:8080 --entrypoint=envoy -v $PWD/bootstrap.yaml:$PWD/bootstrap.yaml:ro -v $PWD/build:$PWD/build:ro -w $PWD istio/proxyv2:1.5.4 -c $PWD/bootstrap.yaml

# test success
curl -v -H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" -H "X-Request-Priority:50" localhost:8080/anything

# test failure
curl -v -H "Authorization:Basic dGVzdENsaWVudDpzZWNyZXQ=" -H "X-Request-Priority:50" localhost:8080/anything/failure

# push to remote repository
wasme push webassemblyhub.io/jianshao/authz-filter:v0.0.2

# create wasme crds and operator
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme.io_v1_crds.yaml
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme-default.yaml

# create foo ns and deploy a httpbin on it
kubectl create ns foo
kubectl label ns foo istio-injection=enabled
kubectl apply -f https://raw.githubusercontent.com/istio/istio/1.5.4/samples/httpbin/httpbin.yaml -n foo

# declarative deployment
cat <<EOF | kubectl apply -f -
apiVersion: wasme.io/v1
kind: FilterDeployment
metadata:
  name: authz-filter
  namespace: foo
spec:
  deployment:
    istio:
      kind: Deployment
  filter:
    config: authn-service
    image: webassemblyhub.io/jianshao/authz-filter:v0.0.2
EOF

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