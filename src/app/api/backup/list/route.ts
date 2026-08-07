import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { listBackups } from "@/lib/backup";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAuth("backups.read");
  const backups = await listBackups();
  return NextResponse.json(
    { backups },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/backup/list");
