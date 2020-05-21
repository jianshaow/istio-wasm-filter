export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, registerRootContext, FilterHeadersStatusValues, LogLevelValues, GrpcStatusValues, log, send_local_response, stream_context } from "@solo-io/proxy-runtime";
import { decode } from "as-base64";

class AuthzFilterRoot extends RootContext {
  createContext(context_id: u32): Context {
    return ContextHelper.wrap(new AuthzFilter(context_id, this));
  }
}

class AuthzFilter extends Context {
  root_context: AuthzFilterRoot;
  authzContext: AuthzContext;
  constructor(context_id: u32, root_context: AuthzFilterRoot) {
    super(context_id, root_context);
    this.root_context = root_context;
    this.authzContext = new AuthzContext();
    this.authzContext.authzInfo = new AuthzInfo();
    this.authzContext.config = root_context.getConfiguration();
  }

  onRequestHeaders(a: u32): FilterHeadersStatusValues {
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
      send_local_response(403, "not authorized", String.UTF8.encode("not authorized"), [], GrpcStatusValues.Unauthenticated);
      return FilterHeadersStatusValues.StopIteration;
    } else {
      let headerParts = authz_header.split(" ");
      if (headerParts.length == 2) {
        this.authzContext.authzInfo.authzType = headerParts[0];
        let authzContent = headerParts[1];
        log(LogLevelValues.info, "authzContent: " + authzContent);
        this.authzContext.authzInfo.clientID = this.authenticate(authzContent);
      }
    }
    return FilterHeadersStatusValues.Continue;
  }

  onResponseHeaders(a: u32): FilterHeadersStatusValues {
    log(LogLevelValues.info, "authzContext: " + this.authzContext.toString());
    if (this.authzContext.config != null && this.authzContext.config != "") {
      stream_context.headers.response.add("x-filter-config", this.authzContext.config);
    }
    if (this.authzContext.authzInfo.clientID != null && this.authzContext.authzInfo.clientID != "") {
      stream_context.headers.response.add("x-client-id", this.authzContext.authzInfo.clientID);
    }
    return FilterHeadersStatusValues.Continue;
  }

  private authenticate(credential: string): string {
    let decoded = String.UTF8.decode(decode(credential).buffer);
    log(LogLevelValues.info, "decoded: " + decoded)
    let basicAuthzParts = decoded.split(":");
    // TODO: invoke authentication-service
    // this.root_context.httpCall("authenticaton-service", [], new ArrayBuffer(0), [], 100, new HttpCallback("ctx"), (c: Context) => { });

    return basicAuthzParts[0]
  }
}

class AuthzInfo {
  clientID: string;
  authzType: string;
  requestPriority: u8;
  toString(): string {
    return "AuthzInfo[clientID=" + this.clientID + ", authzType=" + this.authzType + ", requestPriority=" + this.requestPriority.toString() + "]";
  }
}

class AuthzContext {
  authzInfo: AuthzInfo;
  config: string;

  toString(): string {
    return "AuthzContext[config=" + this.config + ", authzInfo=" + this.authzInfo.toString() + "]";
  }
}

registerRootContext((context_id: u32) => { return RootContextHelper.wrap(new AuthzFilterRoot(context_id)); }, "authz-filter");