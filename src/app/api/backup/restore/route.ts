/**
 * POST /api/backup/restore
 *
 * Body: { filename: string }
 *
 * Destructively overwrites the active shop's SQLite file with the named
 * backup. All data created after the backup will be lost. The route
 * disconnects Prisma clients first so no stale file handle remains.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { restoreBackup } from "@/lib/backup";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  filename: z.string().min(1).max(255),
  // Session 30 (AUDIT-2 A7): require explicit confirm — single-click
  // destructive restore was too easy.
  confirm: z.literal("RESTORE"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth(["backups.restore", "approvals.approve"]);
  await requireRecentReauthentication();
  const body = await req.json();
  const input = restoreSchema.parse(body);
  const result = await restoreBackup(input.filename);
  await logAudit({ prisma: db, shop: shopContext }, { action: "backup.restore", entity: "system", entityId: "backup", actor: trustedActorAuditIdentity(actorContext.actor), after: { filename: input.filename } });
  return NextResponse.json(result);
}, "POST /api/backup/restore");
