import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { shopContext } from "@/lib/db";
import {
  activateSignedEntitlement,
  getLicenseAuthorityProjection,
} from "@/lib/license/license-authority";
import { requestOnlineTrial } from "@/lib/license/trial-client";

export const POST = withErrorHandler(async () => {
  const nativeAuthorityNeedsOnlineInitialization =
    process.env.NODE_ENV === "production" &&
    process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS === "missing";
  if (!nativeAuthorityNeedsOnlineInitialization) {
    const current = await getLicenseAuthorityProjection();
    if (current.status === "valid") {
      return NextResponse.json(current, { headers: { "Cache-Control": "no-store" } });
    }
  }
  const entitlement = await requestOnlineTrial(shopContext);
  const activated = await activateSignedEntitlement(entitlement, shopContext, new Date(), {
    allowOnlineTrialInitialization: true,
  });
  return NextResponse.json(activated, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/license/trial");
