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
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { restoreBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({
  filename: z.string().min(1).max(255),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = restoreSchema.parse(body);
  const result = await restoreBackup(input.filename);
  return NextResponse.json(result);
}, "POST /api/backup/restore");
