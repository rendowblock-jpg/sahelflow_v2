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

const eraseSchema = z
  .object({
    confirm: z.literal("ERASE"),
    confirmationShopId: z.string().min(1).max(64),
  })
  .strict();

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("settings.manage");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();
  const input = eraseSchema.parse(await req.json());
  if (input.confirmationShopId !== shopContext.shopId) {
    return NextResponse.json(
      { error: "Erase confirmation does not match the active shop." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const receipt = await executeShopErase("privacy-erase");
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      entity: "system",
      entityId: shopContext.shopId,
      action: "privacy.erase.completed",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { ...receipt },
    },
  );

  return NextResponse.json(
    { ok: true, receipt },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "POST /api/privacy/erase");
