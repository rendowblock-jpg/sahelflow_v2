import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { restoreBackup } from "@/lib/backup";
import { stageCloudBackupForNativeRestoreIfNeeded } from "@/lib/connected-platform/cloud-backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  backupId: z
    .string()
    .regex(/^backup-[0-9]{10,17}-[0-9a-f]{16}$/),
  recoveryCode: z.string().trim().min(1).max(256).optional(),
  confirm: z.literal("RESTORE"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "backups.restore",
    "approvals.approve",
  ]);
  await requireRecentReauthentication();
  const input = restoreSchema.parse(await req.json());
  const cloudStage = await stageCloudBackupForNativeRestoreIfNeeded(
    { prisma: db, shop: shopContext },
    input.backupId,
  );
  const result = await restoreBackup(input.backupId, input.recoveryCode);

  // Recovery codes and filesystem paths are deliberately excluded from audit.
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "backup.restore.staged",
      entity: "system",
      entityId: input.backupId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        backupId: result.backupId,
        restoreId: result.restoreId,
        sourceWorkspaceId: result.sourceWorkspaceId,
        sourceShopCount: result.sourceShopCount,
        restartRequired: result.restartRequired,
        cloudStaged: cloudStage?.staged ?? false,
      },
    },
  );

  return NextResponse.json(result, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/backup/restore");
