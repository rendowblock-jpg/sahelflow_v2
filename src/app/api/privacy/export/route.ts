import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { createShopPrivacyExport } from "@/lib/privacy/lifecycle";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("settings.manage");
  assertTrustedAction(actorContext, "approvals.approve");
  await requireRecentReauthentication();

  const payload = await createShopPrivacyExport();
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      entity: "system",
      entityId: shopContext.shopId,
      action: "privacy.export.completed",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        formatVersion: 1,
        byteLength: payload.length,
        excludesSecrets: true,
      },
    },
  );

  return new NextResponse(new Uint8Array(payload), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sahelflow-privacy-export-${shopContext.shopId}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "POST /api/privacy/export");
