export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, registerRootContext, FilterHeadersStatusValues, log, LogLevelValues, stream_context } from "@solo-io/proxy-runtime";
// import { log } from "@solo-io/proxy-runtime/assembly/runtime";

class AuthzFilterRoot extends RootContext {
  configuration: string;

  createContext(context_id: u32): Context {
    return ContextHelper.wrap(new AuthzFilter(context_id, this));
  }
}

class AuthzFilter extends Context {
  root_context: AuthzFilterRoot;
  constructor(context_id: u32, root_context: AuthzFilterRoot) {
    super(context_id, root_context);
    this.root_context = root_context;
  }
  onRequestHeaders(a: u32): FilterHeadersStatusValues {
    const root_context = this.root_context;
    let authz_header = stream_context.headers.request.get("authorization")
    if (authz_header == null) {
      log(LogLevelValues.info, "no authorization header");
      FilterHeadersStatusValues.StopIteration
    }
    return FilterHeadersStatusValues.Continue;
  }
  onResponseHeaders(a: u32): FilterHeadersStatusValues {
    const root_context = this.root_context;
    if (root_context.configuration == "") {
      stream_context.headers.response.add("hello", "world!");
    } else {
      stream_context.headers.response.add("hello", root_context.configuration);
    }
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => { return RootContextHelper.wrap(new AuthzFilterRoot(context_id)); }, "authz-filter");