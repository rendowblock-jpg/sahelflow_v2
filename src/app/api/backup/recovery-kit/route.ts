import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { createRecoveryKit } from "@/lib/backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth([
    "backups.restore",
    "approvals.approve",
  ]);
  await requireRecentReauthentication();
  const result = await createRecoveryKit();
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "backup.recovery-kit.created",
      entity: "system",
      entityId: result.kitId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        kitId: result.kitId,
        workspaceId: result.workspaceId,
        brkId: result.brkId,
        createdAtUnixMs: result.createdAtUnixMs,
      },
    },
  );
  return NextResponse.json(result, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/backup/recovery-kit");
