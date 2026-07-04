/**
 * POST /api/backup/create
 *
 * Copies the active shop's SQLite .db file to data/backups/sahelflow-backup-<timestamp>.db
 * after forcing a WAL checkpoint. Returns the new filename + size in bytes.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { createBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  await requireAuth();
  void logAudit({ action: "backup.create", entity: "system", entityId: "backup", actor: "user" });
  const result = await createBackup();
  return NextResponse.json(result, { status: 201 });
}, "POST /api/backup/create");
