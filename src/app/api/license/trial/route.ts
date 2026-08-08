import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { shopContext } from "@/lib/db";
import {
  activateSignedEntitlement,
  getLicenseAuthorityProjection,
} from "@/lib/license/license-authority";
import { requestOnlineTrial } from "@/lib/license/trial-client";
import { SahelFlowError } from "@/types/errors";

function isRestoreEvidenceIssuer(): boolean {
  const serviceUrl = process.env.SF_LICENSE_SERVICE_URL;
  if (!serviceUrl) return false;
  try {
    const parsed = new URL(serviceUrl);
    return (
      parsed.protocol === "http:" &&
      parsed.hostname === "127.0.0.1" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

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
  let activated;
  try {
    activated = await activateSignedEntitlement(entitlement, shopContext, new Date(), {
      allowOnlineTrialInitialization: true,
    });
  } catch (error) {
    if (isRestoreEvidenceIssuer() && !(error instanceof SahelFlowError)) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new SahelFlowError(
        `Restore-evidence trial activation failed internally: ${detail}`,
        "LICENSE_RESTORE_EVIDENCE_ACTIVATION_INTERNAL",
        500,
      );
    }
    throw error;
  }
  return NextResponse.json(activated, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/license/trial");
