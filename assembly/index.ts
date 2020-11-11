export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, Headers, HeaderPair, registerRootContext, FilterHeadersStatusValues, LogLevelValues, GrpcStatusValues, log, send_local_response, continue_request, stream_context, WasmResultValues } from "@solo-io/proxy-runtime";
class AuthFilterRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new AuthFilter(context_id, this);
  }
}

class AuthInfo {
  clientId: string = "";
  authenticated: bool = false;
  toString(): string {
    return "AuthInfo[clientId=" + this.clientId + ", authenticated=" + this.authenticated.toString() + "]";
  }
}

class AuthFilter extends Context {
  authInfo: AuthInfo;
  authCluster: string;

  constructor(context_id: u32, root_context: AuthFilterRoot) {
    super(context_id, root_context);
    this.authInfo = new AuthInfo();
    this.authCluster = root_context.getConfiguration();
  }

  onRequestHeaders(_a: u32, _nd_of_stream: bool): FilterHeadersStatusValues {
    this.authenticate();

    if (this.authInfo.authenticated) {
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
    if (this.authInfo.clientId != null && this.authInfo.clientId != "") {
      stream_context.headers.response.add("x-client-id", this.authInfo.clientId);
    }
    stream_context.headers.response.add("x-authorized", this.authInfo.authenticated.toString());
    return FilterHeadersStatusValues.Continue;
  }

  private authenticate(): void {
    let headers = this.buildAuthHeaders();

    let result = this.root_context.httpCall(this.authCluster, headers, new ArrayBuffer(0), [], 1000, this,
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
        for (let i = 0; i < callback_headers.length; i++) {
          let header = callback_headers[i];
          if (!String.UTF8.decode(header.key).startsWith("x-auth-")) {
            stream_context.headers.request.get_headers().push(header)
          }
        }

        context.authInfo.authenticated = true;
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
    for (let i = 0; i < request_headers.length; i++) {
      let header = request_headers[i];
      if (!String.UTF8.decode(header.key).startsWith(":")) {
        headers.push(header);
      }
    }

    return headers;
  }

  private newHeaderPair(key: string, value: string): HeaderPair {
    return new HeaderPair(String.UTF8.encode(key), String.UTF8.encode(value));
  }

  toString(): string {
    return "AuthFilter[contextId = " + this.context_id.toString() + ", authCluster = " + this.authCluster + ", authInfo = " + this.authInfo.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return new AuthFilterRoot(context_id); }, "auth-filter");