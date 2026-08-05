import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { executeShopErase } from "@/lib/privacy/lifecycle";

export const dynamic = "force-dynamic";

const resetSchema = z.object({ confirm: z.literal("RESET") }).strict();

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("settings.manage");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();
  resetSchema.parse(await req.json());

  const receipt = await executeShopErase("business-reset");
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      entity: "system",
      entityId: shopContext.shopId,
      action: "privacy.business-reset.completed",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: receipt,
    },
  );

  return NextResponse.json(
    {
      ok: true,
      receipt,
      message: "Business data, operational configuration and credentials were erased.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "POST /api/settings/reset");
