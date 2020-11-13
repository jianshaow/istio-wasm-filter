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
    log(LogLevelValues.debug, "authFilter: " + this.toString());
    if (this.authCluster != null && this.authCluster != "") {
      stream_context.headers.response.add("x-auth-cluster", this.authCluster);
    }
    return FilterHeadersStatusValues.Continue;
  }

  private auth(): void {
    let result = this.root_context.httpCall(this.authCluster, stream_context.headers.request.get_headers(), new ArrayBuffer(0), [], 1000, this,
      (origin_context: Context, headers: u32, body_size: usize, trailers: u32) => {
        log(LogLevelValues.debug, "headers: " + headers.toString() + ", body_size: " + body_size.toString() + ", trailers: " + trailers.toString());

        let context = origin_context as AuthFilter;

        let status = stream_context.headers.http_callback.get(":status");
        log(LogLevelValues.debug, "http_callback status: " + status);

        if (status != "200") {
          log(LogLevelValues.warn, "auth cluster return " + status + ", access not allowed!");
          let grpc_status = GrpcStatusValues.PermissionDenied;
          let body = String.UTF8.encode("access not allowed!\n")
          if (status == '401') {
            grpc_status = GrpcStatusValues.Unauthenticated;
            body = String.UTF8.encode("authentication fail!\n")
          }
          let response_code = u32(parseInt(status))
          send_local_response(response_code, "not allowed", body, [], grpc_status);
          return;
        }

        let callback_headers = stream_context.headers.http_callback.get_headers();
        context.handleHeaders(callback_headers, (_header: HeaderPair, key: string, value: string) => {
          if (key.startsWith("x-auth-")) {
            stream_context.headers.request.add(key, value)
          }
        });

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

  private handleHeaders(headers: Headers, handler: (header: HeaderPair, key: string, value: string) => void): void {
    log(LogLevelValues.debug, "*************** handle headers ***************")
    for (let i = 0; i < headers.length; i++) {
      let header = headers[i];
      let key = String.UTF8.decode(header.key)
      let value = String.UTF8.decode(header.value)
      log(LogLevelValues.debug, "* " + key + ": " + value)
      handler(header, key, value);
    }
    log(LogLevelValues.debug, "*************** handle headers ***************")
  }

  toString(): string {
    return "AuthFilter[contextId=" + this.context_id.toString() + ", authCluster=" + this.authCluster + ", authPassed=" + this.authPassed.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return new AuthFilterRoot(context_id); }, "auth-filter");