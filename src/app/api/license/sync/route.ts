import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  activateSignedEntitlement,
  requiresAuthenticatedEntitlementActivation,
} from "@/lib/license/license-authority";

export const POST = withErrorHandler(async (request: Request) => {
  const entitlement: unknown = await request.json();
  if (await requiresAuthenticatedEntitlementActivation(entitlement)) {
    await requireTrustedAction("license.manage");
    await requireRecentReauthentication();
  }

  const activated = await activateSignedEntitlement(entitlement);
  return NextResponse.json(activated, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/license/sync");
