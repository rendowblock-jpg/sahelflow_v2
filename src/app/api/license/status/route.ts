import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { getLicenseAuthorityProjection } from "@/lib/license/license-authority";

export const dynamic = "force-dynamic";

/**
 * GET /api/license/status — licensing projection for client feature gates.
 *
 * Guard parity with the trusted-actor mesh (audit 7-a F2): the proxy HMAC
 * cookie alone must not satisfy this route. Any authenticated durable member
 * may read the licensing projection (operator/viewer roles rely on it for
 * feature gating), so this asserts the DB-backed session without a Phase 2
 * action ceiling.
 */
export const GET = withErrorHandler(async () => {
  await requireTrustedActor();
  const projection = await getLicenseAuthorityProjection();
  return NextResponse.json(
    {
      ...projection,
      onlineTrialAvailable: Boolean(process.env.SF_LICENSE_SERVICE_URL?.trim()),
    },
    {
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}, "GET /api/license/status");
