export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, Headers, HeaderPair, registerRootContext, FilterHeadersStatusValues, LogLevelValues, GrpcStatusValues, log, send_local_response, continue_request, stream_context, WasmResultValues } from "@solo-io/proxy-runtime";
import { decode } from "as-base64";

class AuthzFilterRoot extends RootContext {
  createContext(context_id: u32): Context {
    return ContextHelper.wrap(new AuthzFilter(context_id, this));
  }
}

class AuthzInfo {
  clientId: string;
  authzType: string;
  requestPriority: u8;
  authenticated: bool = false;
  toString(): string {
    return "AuthzInfo[clientId = " + this.clientId + ", authzType = " + this.authzType + ", requestPriority = " + this.requestPriority.toString() + "]";
  }
}

class AuthzFilter extends Context {
  root_context: AuthzFilterRoot;
  authzInfo: AuthzInfo;
  authnCluster: string;

  constructor(context_id: u32, root_context: AuthzFilterRoot) {
    super(context_id, root_context);
    this.root_context = root_context;
    this.authzInfo = new AuthzInfo();
    this.authnCluster = root_context.getConfiguration();
  }

  onRequestHeaders(_a: u32): FilterHeadersStatusValues {
    if (stream_context.headers.request.get("x-auth-internal") == "true") {
      log(LogLevelValues.info, "internal invocation, skip it");
      return FilterHeadersStatusValues.Continue;
    }

    let authz_header = stream_context.headers.request.get("authorization");
    let priority_header = stream_context.headers.request.get("x-request-priority");

    log(LogLevelValues.info, "authz_header: " + authz_header);
    log(LogLevelValues.info, "priority_header: " + priority_header);

    if (priority_header != null && priority_header != "") {
      this.authzInfo.requestPriority = u8(parseInt(priority_header));
    }

    if (authz_header == null || authz_header == "") {
      log(LogLevelValues.warn, "no authorization header");
      send_local_response(401, "authentication required", String.UTF8.encode("authentication required\n"), [], GrpcStatusValues.Unauthenticated);
      return FilterHeadersStatusValues.StopIteration;
    } else {
      let headerParts = authz_header.split(" ");
      if (headerParts.length == 2) {
        this.authzInfo.authzType = headerParts[0];
        let credential = headerParts[1];
        log(LogLevelValues.info, "credential: " + credential);
        this.authenticate(credential);
      }
    }

    if (this.authzInfo.authenticated) {
      log(LogLevelValues.info, "access allowed");
      return FilterHeadersStatusValues.Continue;
    }

    log(LogLevelValues.info, "access not allowed yet, hold on...");
    return FilterHeadersStatusValues.StopIteration;
  }

  onResponseHeaders(_a: u32): FilterHeadersStatusValues {
    log(LogLevelValues.info, "authzFilter: " + this.toString());
    if (this.authnCluster != null && this.authnCluster != "") {
      stream_context.headers.response.add("x-authn-cluster", this.authnCluster);
    }
    if (this.authzInfo.authenticated) {
      stream_context.headers.response.add("x-client-id", this.authzInfo.clientId);
    }
    return FilterHeadersStatusValues.Continue;
  }

  private authenticate(credential: string): void {
    let decoded = String.UTF8.decode(decode(credential).buffer);
    log(LogLevelValues.info, "decoded: " + decoded)
    let basicAuthzParts = decoded.split(":");
    this.authzInfo.clientId = basicAuthzParts[0];

    let headers = stream_context.headers.request.get_headers();
    // headers.push({ key: str2ab("x-auth-internal"), value:str2ab("true") } as HeaderPair);
    // let trailers = [{ key: String.UTF8.encode("x-auth-internal", true), value: String.UTF8.encode("true", true) } as HeaderPair]

    let result = this.root_context.httpCall(this.authnCluster, headers, new ArrayBuffer(0), [], 1000, this, (origin_context: Context, headers: u32, body_size: usize, trailers: u32) => {
      log(LogLevelValues.debug, "headers: " + headers.toString() + ", body_size: " + body_size.toString() + ", trailers: " + trailers.toString());

      let status = stream_context.headers.http_callback.get(":status");
      log(LogLevelValues.debug, "http_callback status: " + status);

      let context = origin_context as AuthzFilter;

      context.setEffectiveContext();
      if (status != "200") {
        log(LogLevelValues.warn, "authn cluster return " + status + ", access not allowed!");
        send_local_response(403, "permision denied", String.UTF8.encode("permision denied\n"), [], GrpcStatusValues.PermissionDenied);
        return;
      }
      context.authzInfo.authenticated = true;
      log(LogLevelValues.info, "access allowed, continue!");
      continue_request();
    });
    log(LogLevelValues.debug, "httpCall result: " + result.toString());

    if (result != WasmResultValues.Ok) {
      log(LogLevelValues.warn, "httpCall fail, result: " + result.toString());
      send_local_response(500, "internal server error", String.UTF8.encode("internal server error\n"), [], GrpcStatusValues.Internal);
    }
  }

  toString(): string {
    return "AuthzFilter[contextId = " + this.context_id.toString() + ", authnCluster = " + this.authnCluster + ", authzInfo = " + this.authzInfo.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return RootContextHelper.wrap(new AuthzFilterRoot(context_id)); }, "authz-filter");

function str2ab(str: string): ArrayBuffer {
  var buf = new ArrayBuffer(str.length * 2);
  var bufView = Uint16Array.wrap(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}