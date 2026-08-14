import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { createBackup } from "@/lib/backup";
import { uploadNativeBackupToCloudIfEnrolled } from "@/lib/connected-platform/cloud-backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { requireLicenseEntitlement } from "@/lib/license/license-authority";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth("backups.create");
  const entitlement = await requireLicenseEntitlement("sahelflow.backup", shopContext);
  const result = await createBackup();
  const context = { prisma: db, shop: shopContext };
  let cloudBackup: Awaited<ReturnType<typeof uploadNativeBackupToCloudIfEnrolled>> = null;
  let cloudState: "verified" | "not_enrolled" | "unavailable" = "not_enrolled";
  try {
    cloudBackup = await uploadNativeBackupToCloudIfEnrolled(
      context,
      result,
      entitlement.type ?? "trial",
    );
    if (cloudBackup) cloudState = "verified";
  } catch {
    // The native encrypted backup is already durable. Report cloud degradation
    // explicitly without turning a successful local backup into a failed request
    // that encourages duplicate retries.
    cloudState = "unavailable";
  }
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "backup.create",
      entity: "backup",
      entityId: result.backupId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: {
        backupId: result.backupId,
        shopCount: result.shopCount,
        containerBytes: result.containerBytes,
        verifiedAtUnixMs: result.verifiedAtUnixMs,
        independentRecoveryReady: result.independentRecoveryReady,
        cloudState,
      },
    },
  );
  return NextResponse.json({ ...result, cloudBackup, cloudState }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/backup/create");
