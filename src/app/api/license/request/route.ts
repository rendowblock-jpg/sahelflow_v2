import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { shopContext } from "@/lib/db";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  getLicenseAuthorityProjection,
  licenseRequestEpochs,
} from "@/lib/license/license-authority";
import { encodeLicenseRequest } from "@/lib/license/request-code";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/license/request — the owner's licence request code, sent to the
 * Founder after payment so a permanent entitlement can be signed for exactly
 * this installation. Read-only; license.manage is reserved to the owner.
 */
export const GET = withErrorHandler(async () => {
  await requireTrustedAction("license.manage");
  const deviceBinding = process.env.SF_DEVICE_BINDING;
  const productMajor = Number.parseInt(/^(\d+)\./.exec(process.env.APP_VERSION ?? "")?.[1] ?? "", 10);
  if (!deviceBinding || !/^sfdb1_[0-9a-f]{64}$/.test(deviceBinding) || !Number.isSafeInteger(productMajor)) {
    throw new SahelFlowError(
      "Licence request codes are available in the installed app only",
      "LICENSE_REQUEST_UNAVAILABLE",
      503,
    );
  }
  const projection = await getLicenseAuthorityProjection();
  const code = encodeLicenseRequest({
    workspaceId: shopContext.workspaceId,
    installationId: shopContext.installationId,
    deviceBinding,
    productMajor,
    ...licenseRequestEpochs(),
    currentLicenseId: projection.licenseId,
  });
  return NextResponse.json({ code }, { headers: { "Cache-Control": "no-store, private" } });
}, "GET /api/license/request");
