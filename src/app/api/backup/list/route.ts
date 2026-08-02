/**
 * GET /api/backup/list
 *
 * Returns all backup files in data/backups/, newest first.
 * Each entry: { filename, size, createdAt }.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { listBackups } from "@/lib/backup";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAuth("backups.read");
  const backups = await listBackups();
  return NextResponse.json({ backups });
}, "GET /api/backup/list");
