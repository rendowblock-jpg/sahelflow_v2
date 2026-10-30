import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { createBackup } from "@/lib/backup";
import { backupFailureCode } from "@/lib/backup/failure-code";
import { uploadNativeBackupToCloudIfEnrolled } from "@/lib/connected-platform/cloud-backup";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import {
  requireLicenseEntitlement,
  type LicenseAuthorityProjection,
} from "@/lib/license/license-authority";
import { logger } from "@/lib/logger";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/**
 * The licence that allows the cloud copy, or null when there is none (lapsed,
 * missing, revoked, unreadable, or without the backup feature). Only licence
 * refusals are turned into null; every other failure still fails the request.
 */
async function cloudBackupEntitlement(): Promise<LicenseAuthorityProjection | null> {
  try {
    return await requireLicenseEntitlement("sahelflow.backup", shopContext);
  } catch (error) {
    if (error instanceof SahelFlowError && error.code.startsWith("LICENSE_")) return null;
    throw error;
  }
}

export const POST = withErrorHandler(async () => {
  const actorContext = await requireAuth("backups.create");
  // IDN-03: the LOCAL backup never needs a licence, so a seller whose licence
  // lapsed can still keep a safe copy. Only the cloud upload is a licensed feature.
  const entitlement = await cloudBackupEntitlement();
  const result = await createBackup();
  const context = { prisma: db, shop: shopContext };
  let cloudBackup: Awaited<ReturnType<typeof uploadNativeBackupToCloudIfEnrolled>> = null;
  let cloudState: "verified" | "not_enrolled" | "unavailable" | "license_required" =
    entitlement ? "not_enrolled" : "license_required";
  try {
    if (entitlement) {
      cloudBackup = await uploadNativeBackupToCloudIfEnrolled(
        context,
        result,
        entitlement.type ?? "trial",
      );
      if (cloudBackup) cloudState = "verified";
    }
  } catch (error) {
    // The native encrypted backup is already durable. Report cloud degradation
    // explicitly without turning a successful local backup into a failed request
    // that encourages duplicate retries. Leave a code-only trace (never the
    // message, which can carry URLs or tokens).
    logger.warn("backup.cloud_upload_failed", {
      backupId: result.backupId,
      code: backupFailureCode(error),
    });
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
