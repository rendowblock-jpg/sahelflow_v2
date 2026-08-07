import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { createBackup } from "@/lib/backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth("backups.create");
  const result = await createBackup();
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "backup.create",
      entity: "backup",
      entityId: result.backupId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        backupId: result.backupId,
        shopCount: result.shopCount,
        containerBytes: result.containerBytes,
        verifiedAtUnixMs: result.verifiedAtUnixMs,
        independentRecoveryReady: result.independentRecoveryReady,
      },
    },
  );
  return NextResponse.json(result, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/backup/create");
