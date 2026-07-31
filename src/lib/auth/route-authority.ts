import "server-only";

import { requireAuth } from "./server";

const DIRECT_ROUTE_TEST_AUTH_HEADER =
  "x-sahelflow-direct-route-test-authority";
const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-route";

function hasDirectRouteTestAuthority(request: Request): boolean {
  const testing =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  return (
    testing &&
    request.headers.get(DIRECT_ROUTE_TEST_AUTH_HEADER) ===
      DIRECT_ROUTE_TEST_AUTH_VALUE
  );
}

/**
 * Authenticate a route request. The only bypass is an explicit request-scoped
 * marker used by direct business-route integration tests under Vitest.
 */
export async function requireRouteAuth(request: Request): Promise<void> {
  if (hasDirectRouteTestAuthority(request)) return;
  await requireAuth();
}
