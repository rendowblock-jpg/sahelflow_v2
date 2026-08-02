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
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth("backups.create");
  const result = await createBackup();
  await logAudit({ prisma: db, shop: shopContext }, { action: "backup.create", entity: "system", entityId: "backup", actor: trustedActorAuditIdentity(actorContext.actor), after: result as unknown as Record<string, unknown> });
  return NextResponse.json(result, { status: 201 });
}, "POST /api/backup/create");
