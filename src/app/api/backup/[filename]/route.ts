import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { deleteBackup } from "@/lib/backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ filename: string }> };

const backupIdSchema = z.string().regex(/^backup-[0-9]{10,17}-[0-9a-f]{16}$/);

export const DELETE = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireAuth([
      "backups.restore",
      "approvals.approve",
    ]);
    await requireRecentReauthentication();
    const { filename } = await params;
    const backupId = backupIdSchema.parse(decodeURIComponent(filename));
    const result = await deleteBackup(backupId);
    await logAudit(
      { prisma: db, shop: shopContext },
      {
        action: "backup.deleted",
        entity: "backup",
        entityId: backupId,
        actor: trustedActorAuditIdentity(actorContext.actor),
        after: { backupId, deleted: result.deleted },
      },
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  "DELETE /api/backup/[filename]",
);
