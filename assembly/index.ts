export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, Headers, HeaderPair, registerRootContext, FilterHeadersStatusValues, LogLevelValues, GrpcStatusValues, log, send_local_response, continue_request, stream_context, WasmResultValues } from "@solo-io/proxy-runtime";

class AuthFilterRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new AuthFilter(context_id, this);
  }
}

class AuthFilter extends Context {
  authPassed: bool;
  authCluster: string;

  constructor(context_id: u32, root_context: AuthFilterRoot) {
    super(context_id, root_context);
    this.authCluster = root_context.getConfiguration();
  }

  onRequestHeaders(_a: u32, _nd_of_stream: bool): FilterHeadersStatusValues {
    this.auth();

    if (this.authPassed) {
      log(LogLevelValues.info, "access allowed");
      return FilterHeadersStatusValues.Continue;
    }

    log(LogLevelValues.info, "access not allowed yet, hold on...");
    return FilterHeadersStatusValues.StopIteration;
  }

  onResponseHeaders(_a: u32, _nd_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.info, "authFilter: " + this.toString());
    if (this.authCluster != null && this.authCluster != "") {
      stream_context.headers.response.add("x-auth-cluster", this.authCluster);
    }
    return FilterHeadersStatusValues.Continue;
  }

  private auth(): void {
    let authHeaders = this.buildAuthHeaders();

    let result = this.root_context.httpCall(this.authCluster, authHeaders, new ArrayBuffer(0), [], 1000, this,
      (origin_context: Context, headers: u32, body_size: usize, trailers: u32) => {
        log(LogLevelValues.debug, "headers: " + headers.toString() + ", body_size: " + body_size.toString() + ", trailers: " + trailers.toString());

        let context = origin_context as AuthFilter;

        let status = stream_context.headers.http_callback.get(":status");
        log(LogLevelValues.debug, "http_callback status: " + status);

        if (status != "200") {
          log(LogLevelValues.warn, "auth cluster return " + status + ", access not allowed!");
          send_local_response(403, "permision denied", String.UTF8.encode("permision denied\n"), [], GrpcStatusValues.PermissionDenied);
          return;
        }

        let callback_headers = stream_context.headers.http_callback.get_headers();
        log(LogLevelValues.debug, "========== auth-service response header ==========")
        for (let i = 0; i < callback_headers.length; i++) {
          let header = callback_headers[i];
          let key = String.UTF8.decode(header.key)
          let value = String.UTF8.decode(header.value)
          log(LogLevelValues.debug, key + ": " + value)
          if (key.startsWith("x-auth-")) {
            stream_context.headers.request.add(key, value)
          }
        }
        log(LogLevelValues.debug, "========== auth-service response header ==========")

        context.authPassed = true;
        log(LogLevelValues.info, "access allowed, continue!");
        continue_request();
      });

    log(LogLevelValues.debug, "httpCall result: " + result.toString());

    if (result != WasmResultValues.Ok) {
      log(LogLevelValues.warn, "httpCall fail, result: " + result.toString());
      send_local_response(500, "internal server error", String.UTF8.encode("internal server error\n"), [], GrpcStatusValues.Internal);
    }
  }

  private buildAuthHeaders(): Headers {
    let headers: Headers = [];

    headers.push(this.newHeaderPair(":authority", "auth-service"));
    headers.push(this.newHeaderPair(":path", "/auth"));
    headers.push(this.newHeaderPair(":method", "POST"));

    let request_headers = stream_context.headers.request.get_headers();
    log(LogLevelValues.debug, "=============== request header ===============")
    for (let i = 0; i < request_headers.length; i++) {
      let header = request_headers[i];
      let key = String.UTF8.decode(header.key)
      let value = String.UTF8.decode(header.value)
      log(LogLevelValues.debug, key + ": " + value)
      if (!key.startsWith(":")) {
        headers.push(header);
      }
    }
    log(LogLevelValues.debug, "=============== request header ===============")

    return headers;
  }

  private newHeaderPair(key: string, value: string): HeaderPair {
    return new HeaderPair(String.UTF8.encode(key), String.UTF8.encode(value));
  }

  toString(): string {
    return "AuthFilter[contextId=" + this.context_id.toString() + ", authCluster=" + this.authCluster + ", authPassed=" + this.authPassed.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return new AuthFilterRoot(context_id); }, "auth-filter");