import "server-only";

import { isAuthSetup, requireAuth } from "./server";
import type { Phase2Action } from "@/lib/identity/permissions";

const DIRECT_ROUTE_TEST_AUTH_HEADER =
  "x-sahelflow-direct-route-test-authority";
const DIRECT_ROUTE_TEST_AUTH_VALUE = "vitest-business-route";

export type RouteAuthOptions = Readonly<{
  /** For legacy direct GET tests that invoke a handler without a Request. */
  allowMissingRequestInTests?: boolean;
  /** Exact operational actions required after authentication. */
  actions?: Phase2Action | readonly Phase2Action[];
}>;

function isTesting(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

function hasDirectRouteTestMarker(
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
 * Authenticate a route request.
 *
 * Direct business-route tests may bypass authentication only while the
 * disposable database is genuinely unconfigured. Once an AuthSecret exists,
 * even a marked Vitest request must exercise the real session authority. Any
 * failure to determine setup state also falls through to fail-closed auth.
 */
export async function requireRouteAuth(
  request?: Request,
  options: RouteAuthOptions = {},
): Promise<void> {
  if (hasDirectRouteTestMarker(request, options)) {
    try {
      if (!(await isAuthSetup())) return;
    } catch {
      // Fall through to the real authority boundary.
    }
  }
  await requireAuth(options.actions);
}
