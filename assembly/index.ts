export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, Headers, HeaderPair, registerRootContext, FilterHeadersStatusValues, LogLevelValues, GrpcStatusValues, log, send_local_response, continue_request, stream_context, WasmResultValues } from "@solo-io/proxy-runtime";
import { decode } from "as-base64";

class AuthzFilterRoot extends RootContext {
  createContext(context_id: u32): Context {
    return ContextHelper.wrap(new AuthzFilter(context_id, this));
  }
}

class AuthzFilter extends Context {
  root_context: AuthzFilterRoot;
  authzContext: AuthzContext;
  allow: bool = false;

  constructor(context_id: u32, root_context: AuthzFilterRoot) {
    super(context_id, root_context);
    this.root_context = root_context;
    this.authzContext = new AuthzContext();
    this.authzContext.authzInfo = new AuthzInfo();
    this.authzContext.authnAddr = root_context.getConfiguration();
  }

  onRequestHeaders(_a: u32): FilterHeadersStatusValues {
    let authz_header = stream_context.headers.request.get("authorization");
    let priority_header = stream_context.headers.request.get("x-request-priority");

    log(LogLevelValues.info, "context_id: " + this.context_id.toString());
    log(LogLevelValues.info, "authz_header: " + authz_header);
    log(LogLevelValues.info, "priority_header: " + priority_header);

    if (priority_header != null && priority_header != "") {
      this.authzContext.authzInfo.requestPriority = u8(parseInt(priority_header));
    }

    if (authz_header == null || authz_header == "") {
      log(LogLevelValues.warn, "no authorization header");
      send_local_response(401, "authentication required", String.UTF8.encode("authentication required"), [], GrpcStatusValues.Unauthenticated);
      return FilterHeadersStatusValues.StopIteration;
    } else {
      let headerParts = authz_header.split(" ");
      if (headerParts.length == 2) {
        this.authzContext.authzInfo.authzType = headerParts[0];
        let credential = headerParts[1];
        log(LogLevelValues.info, "credential: " + credential);
        this.authenticate(credential);
      }
    }

    if (this.allow) {
      return FilterHeadersStatusValues.Continue;
    }

    return FilterHeadersStatusValues.StopIteration;
  }

  onResponseHeaders(_a: u32): FilterHeadersStatusValues {
    log(LogLevelValues.info, "authzContext: " + this.authzContext.toString());
    if (this.authzContext.authnAddr != null && this.authzContext.authnAddr != "") {
      stream_context.headers.response.add("x-authn-address", this.authzContext.authnAddr);
    }
    if (this.authzContext.authzInfo.clientId != null && this.authzContext.authzInfo.clientId != "") {
      stream_context.headers.response.add("x-client-id", this.authzContext.authzInfo.clientId);
    }
    return FilterHeadersStatusValues.Continue;
  }

  private authenticate(credential: string): void {
    let decoded = String.UTF8.decode(decode(credential).buffer);
    log(LogLevelValues.info, "decoded: " + decoded)
    let basicAuthzParts = decoded.split(":");

    let result = this.root_context.httpCall(this.authzContext.authnAddr, stream_context.headers.request.get_headers(), new ArrayBuffer(0), [], 1000, this, (origin_context: Context, headers: u32, body_size: usize, trailers: u32) => {
      log(LogLevelValues.info, "httpCall callback");
      let context = origin_context as AuthzFilter;
      let status = stream_context.headers.http_callback.get(":status");
      log(LogLevelValues.info, "http_callback status: " + status);
      log(LogLevelValues.info, "http_callback content-type: " + stream_context.headers.http_callback.get("content-type"));
      log(LogLevelValues.info, "headers: " + headers.toString() + ", body_size: " + body_size.toString() + ", trailers: " + trailers.toString());

      context.setEffectiveContext();
      if (status != "200") {
        log(LogLevelValues.info, "========================== httpCall return non 200 ==========================");
        send_local_response(403, "permision denied", String.UTF8.encode("permision denied"), [], GrpcStatusValues.PermissionDenied);
        return;
      }
      continue_request();
      context.allow = true;
    });
    log(LogLevelValues.info, "httpCall result: " + result.toString());

    if (result == WasmResultValues.Ok) {
      this.allow = true;
      this.authzContext.authzInfo.clientId = basicAuthzParts[0];
    }
  }

}

class AuthzInfo {
  clientId: string;
  authzType: string;
  requestPriority: u8;
  toString(): string {
    return "AuthzInfo[clientId=" + this.clientId + ", authzType=" + this.authzType + ", requestPriority=" + this.requestPriority.toString() + "]";
  }
}

class AuthzContext {
  authzInfo: AuthzInfo;
  authnAddr: string;

  toString(): string {
    return "AuthzContext[authnAddr=" + this.authnAddr + ", authzInfo=" + this.authzInfo.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return RootContextHelper.wrap(new AuthzFilterRoot(context_id)); }, "authz-filter");