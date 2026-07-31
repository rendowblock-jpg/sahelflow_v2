import "server-only";

import { requireAuth } from "./server";

const DIRECT_ROUTE_TEST_AUTH_HEADER =
  "x-sahelflow-direct-route-test-authority";
const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-route";

export type RouteAuthOptions = Readonly<{
  /** For legacy direct GET tests that invoke a handler without a Request. */
  allowMissingRequestInTests?: boolean;
}>;

function isTesting(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function hasDirectRouteTestAuthority(
  request: Request | undefined,
  options: RouteAuthOptions,
): boolean {
  if (!isTesting()) return false;
  if (!request) return options.allowMissingRequestInTests === true;
  return (
    request.headers.get(DIRECT_ROUTE_TEST_AUTH_HEADER) ===
    DIRECT_ROUTE_TEST_AUTH_VALUE
  );
}

/**
 * Authenticate a route request. The only bypass is an explicit request-scoped
 * marker—or an explicitly opted-in missing Request—used by direct business-route
 * integration tests under Vitest. Production always uses real session authority.
 */
export async function requireRouteAuth(
  request?: Request,
  options: RouteAuthOptions = {},
): Promise<void> {
  if (hasDirectRouteTestAuthority(request, options)) return;
  await requireAuth();
}
