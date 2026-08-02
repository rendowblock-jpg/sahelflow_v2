/**
 * DELETE /api/backup/[filename]
 *
 * Permanently deletes a backup file from data/backups/.
 * The filename is validated against the strict naming convention
 * (sahelflow-backup-<timestamp>.db) to prevent path traversal.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { deleteBackup } from "@/lib/backup";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ filename: string }> };

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireAuth(["backups.restore", "approvals.approve"]);
    await requireRecentReauthentication();
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);
    const result = await deleteBackup(decoded);
    // W2-5: audit backup file deletion (destructive — file is permanently removed).
    await logAudit({ prisma: db, shop: shopContext }, {
      action: "backup.deleted",
      entity: "backup",
      entityId: decoded,
      actor: trustedActorAuditIdentity(actorContext.actor),
      metadata: { filename: decoded, result },
    });
    return NextResponse.json(result);
  },
  "DELETE /api/backup/[filename]",
);
