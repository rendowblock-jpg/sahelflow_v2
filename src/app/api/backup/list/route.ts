import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { listBackups } from "@/lib/backup";
import { listCloudBackupsIfEnrolled } from "@/lib/connected-platform/cloud-backup";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAuth("backups.read");
  let cloudState: "available" | "unavailable" = "available";
  const [localBackups, cloudBackups] = await Promise.all([
    listBackups(),
    listCloudBackupsIfEnrolled({ prisma: db, shop: shopContext }).catch(() => {
      // Local recovery authority must remain visible during a connected-platform
      // outage. The response still exposes the degraded cloud state explicitly.
      cloudState = "unavailable";
      return [];
    }),
  ]);
  const localIds = new Set(localBackups.map((backup) => backup.backupId));
  const backups = [
    ...localBackups,
    ...cloudBackups.filter((backup) => !localIds.has(backup.backupId)),
  ].sort((left, right) => right.createdAtUnixMs - left.createdAtUnixMs);
  return NextResponse.json(
    { backups, cloudState },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/backup/list");
