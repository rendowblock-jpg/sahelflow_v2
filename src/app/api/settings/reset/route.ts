import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { getShop } from "@/lib/shops";
import { SahelFlowError } from "@/types/errors";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { executeShopEraseWithMedia } from "@/lib/privacy/erase-with-media";

export const dynamic = "force-dynamic";

const resetSchema = z
  .object({ confirm: z.string().min(1).max(160) })
  .strict();

/**
 * The catastrophic-reset type-to-confirm token is locale-neutral seller data:
 * the shop's own name (typeable on an Arabic keyboard), with the legacy
 * Latin "RESET" kept as an accepted alias for scripts and the unnamed default
 * shop. Matching happens against the live shop record so an arbitrary string
 * never passes. (Campaign UI batch F19 moved the client gate to the shop
 * name; this is the matching server-side authority.)
 */
async function confirmTokenMatches(confirm: string): Promise<boolean> {
  const trimmed = confirm.trim();
  if (trimmed === "RESET") return true;
  const shopName = getShop(shopContext.shopId)?.name?.trim();
  return Boolean(shopName && trimmed === shopName);
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("settings.manage");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();
  const { confirm } = resetSchema.parse(await req.json());
  if (!(await confirmTokenMatches(confirm))) {
    throw new SahelFlowError(
      "Reset confirmation token does not match",
      "RESET_CONFIRMATION_MISMATCH",
      400,
    );
  }

  const receipt = await executeShopEraseWithMedia("business-reset");
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      entity: "system",
      entityId: shopContext.shopId,
      action: "privacy.business-reset.completed",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { ...receipt },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      receipt,
      message:
        "Business data, operational configuration and credentials were erased.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "POST /api/settings/reset");
