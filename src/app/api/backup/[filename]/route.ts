/**
 * DELETE /api/backup/[filename]
 *
 * Permanently deletes a backup file from data/backups/.
 * The filename is validated against the strict naming convention
 * (sahelflow-backup-<timestamp>.db) to prevent path traversal.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { deleteBackup } from "@/lib/backup";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ filename: string }> };

export const DELETE = withErrorHandler(
  async (_req: NextRequest, { params }: RouteContext) => {
    await requireAuth();
    const { filename } = await params;
    const decoded = decodeURIComponent(filename);
    const result = await deleteBackup(decoded);
    // W2-5: audit backup file deletion (destructive — file is permanently removed).
    void logAudit({
      action: "backup.deleted",
      entity: "backup",
      entityId: decoded,
      actor: "user",
      metadata: { filename: decoded, result },
    });
    return NextResponse.json(result);
  },
  "DELETE /api/backup/[filename]",
);
