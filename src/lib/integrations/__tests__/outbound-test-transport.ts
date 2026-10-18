import { __setOutboundTestHooks } from "../outbound-http";

/**
 * Adapter tests stub the global `fetch` with canned provider replies. The
 * production transport for seller-supplied URLs is the address-checking one in
 * outbound-http.ts, so those tests route its socket layer back to the stub.
 * The literal-address checks still run in front of it.
 */
export function routeOutboundThroughGlobalFetch(): void {
  __setOutboundTestHooks({ transport: (url, init) => globalThis.fetch(url, init) });
}

export function restoreOutboundDefaults(): void {
  __setOutboundTestHooks(null);
}
