export * from "@solo-io/proxy-runtime/proxy";
import { RootContext, Context, RootContextHelper, ContextHelper, registerRootContext, FilterHeadersStatusValues, stream_context } from "@solo-io/proxy-runtime";

class AuthzFilterRoot extends RootContext {
  configuration: string;

  onConfigure(): bool {
    let conf_buffer = super.getConfiguration();
    let result = String.UTF8.decode(conf_buffer);
    this.configuration = result;
    return true;
  }

  createContext(): Context {
    return ContextHelper.wrap(new AuthzFilter(this));
  }
}

class AuthzFilter extends Context {
  root_context: AuthzFilterRoot;
  constructor(root_context: AuthzFilterRoot) {
    super();
    this.root_context = root_context;
  }
  onRequestHeaders(a: u32): FilterHeadersStatusValues {
    const root_context = this.root_context;
    let authz_header = stream_context.headers.request.get("authorization")
    if (authz_header == null || authz_header == "") {
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

registerRootContext(() => { return RootContextHelper.wrap(new AuthzFilterRoot()); }, "authz-filter");