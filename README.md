# istio-wasm-filter

~~~ shell
# install WebAssembly Hub CLI
curl -sL https://run.solo.io/wasme/install | sh
export PATH=$HOME/.wasme/bin:$PATH

# checkout source code
cd /tmp  && git clone https://github.com/jianshaow/istio-wasm-filter.git && cd istio-wasm-filter

# build on local docker enviroment
wasme build assemblyscript -t webassemblyhub.io/jianshao/authz-filter:v0.0.1 .
wasme push webassemblyhub.io/jianshao/add-header:v0.0.1

# create wasme crds and operator
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme.io_v1_crds.yaml
kubectl apply -f https://github.com/solo-io/wasme/releases/latest/download/wasme-default.yaml

# create foo ns and deploy a httpbin on it
kubectl create ns foo
kubectl label ns foo istio-injection=enabled
kubectl apply -f https://raw.githubusercontent.com/istio/istio/1.5.2/samples/httpbin/httpbin.yaml -n foo

# declarative deployment
cat <<EOF | kubectl apply -f -
apiVersion: wasme.io/v1
kind: FilterDeployment
metadata:
  name: httpbin-custom-filter
  namespace: foo
spec:
  deployment:
    istio:
      kind: Deployment
  filter:
    config: world
    image: webassemblyhub.io/jianshao/add-header:v0.0.1
EOF
~~~