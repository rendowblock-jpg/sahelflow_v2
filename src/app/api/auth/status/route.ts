import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { isAuthSetup, isAuthenticated } from "@/lib/auth/server";
import { SahelFlowError } from "@/types/errors";

/**
 * GET /api/auth/status — setup/auth probe for the login and setup pages.
 *
 * A database outage must never degrade into `{ setup: false }`: that payload
 * tells a reachable UI that authentication is not configured and redirects
 * users into the setup ceremony. DB failures therefore surface as a coded 503
 * (fail closed) while a genuine "not set up" state stays a 200 with
 * setup:false.
 */
export const GET = withErrorHandler(async () => {
  try {
    const setup = await isAuthSetup();
    const authenticated = setup ? await isAuthenticated() : false;
    return NextResponse.json({ setup, authenticated });
  } catch {
    // Covers BOTH authority reads: a DB outage between setup detection and
    // session validation must not degrade into a generic 500 (or, worse, a
    // false setup:false) — it fails closed as the same coded 503.
    throw new SahelFlowError(
      "Authentication status is temporarily unavailable",
      "AUTH_STATUS_UNAVAILABLE",
      503,
    );
  }
}, "GET /api/auth/status");
