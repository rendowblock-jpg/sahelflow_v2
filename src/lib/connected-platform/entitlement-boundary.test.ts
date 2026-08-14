import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("connected entitlement and quota boundaries", () => {
  it("persists expiry and signed connected limits and enforces them at session boundaries", () => {
    const schema = source("control-plane/connected/schema.sql");
    const worker = source("control-plane/connected/worker.ts");
    expect(schema).toContain("entitlement_expires_at TEXT");
    expect(schema).toContain("shop_slots INTEGER NOT NULL");
    expect(schema).toContain("member_limit INTEGER NOT NULL");
    expect(schema).toContain("device_limit INTEGER NOT NULL");
    expect(schema).toContain("features_json TEXT NOT NULL");
    expect(worker).toContain("datetime(entitlement_expires_at) > CURRENT_TIMESTAMP");
    expect(worker).toContain("workspace.device_limit");
    expect(worker).toContain("workspace.member_limit");
    expect(worker).toContain("STOREFRONT_FEATURE");
  });

  it("guards storefront slots and backup quota inside their D1 mutation boundaries", () => {
    const storefront = source("control-plane/storefront/create-storefront.ts");
    const backupSchema = source("control-plane/backup/schema.sql");
    const backupInitiate = source("control-plane/backup/initiate.ts");
    expect(storefront).toContain("SELECT COUNT(*) FROM storefront WHERE workspace_id = ?2");
    expect(storefront).toContain("authority.shopSlots");
    expect(backupSchema).toContain("CREATE TRIGGER IF NOT EXISTS cloud_backup_entitlement_guard");
    expect(backupSchema).toContain("RAISE(ABORT, 'backup_quota_exceeded')");
    expect(backupSchema).toContain("RAISE(ABORT, 'trial_backup_already_exists')");
    expect(backupInitiate).not.toContain("SELECT COALESCE(SUM(total_bytes)");
  });

  it("refreshes signed entitlement authority without allowing identity or expiry rollback", () => {
    const connected = source("control-plane/connected/worker.ts");
    const backup = source("control-plane/backup/auth.ts");
    for (const worker of [connected, backup]) {
      expect(worker).toContain("entitlement_refresh_rejected");
      expect(worker).toContain("claims.revocationEpoch < existing.entitlement_revocation_epoch");
      expect(worker).toContain("currentExpiry === null && nextExpiry !== null");
      expect(worker).toContain("desktop_signing_public_key");
    }
  });

  it("requires an unexpired desktop-issued shop and action policy before enqueue", () => {
    const schema = source("control-plane/connected/schema.sql");
    const worker = source("control-plane/connected/worker.ts");
    const projection = source("src/lib/connected-platform/desktop-projection.ts");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS connected_command_policy");
    expect(worker).toContain("command_not_authorized");
    expect(worker).toContain("command === envelope.messageType");
    expect(projection).toContain("remoteCommandTypesForPermissions");
    expect(projection).toContain("putCommandPolicy");
  });

  it("renews connected and backup tokens after local signed activation", () => {
    const runtime = source("src/lib/connected-platform/runtime.ts");
    const syncRoute = source("src/app/api/license/sync/route.ts");
    const trialRoute = source("src/app/api/license/trial/route.ts");
    expect(runtime).toContain("bootstrapConnected");
    expect(runtime).toContain("bootstrapBackup");
    expect(runtime).toContain("setSecret(context, CONNECTED_CONTROL_TOKEN_SECRET");
    expect(runtime).toContain("setSecret(context, CONNECTED_BACKUP_TOKEN_SECRET");
    expect(syncRoute).toContain("refreshConnectedEnrollmentIfConfigured");
    expect(trialRoute).toContain("refreshConnectedEnrollmentIfConfigured");
  });

  it("connects the complete zero-knowledge backup lifecycle to production routes", () => {
    const client = source("src/lib/connected-platform/client.ts");
    const cloud = source("src/lib/connected-platform/cloud-backup.ts");
    const createRoute = source("src/app/api/backup/create/route.ts");
    const listRoute = source("src/app/api/backup/list/route.ts");
    const restoreRoute = source("src/app/api/backup/restore/route.ts");
    const deleteRoute = source("src/app/api/backup/[filename]/route.ts");
    for (const method of [
      "uploadBackupManifest",
      "uploadBackupChunk",
      "verifyBackup",
      "getBackupRestorePlan",
      "downloadBackupManifest",
      "downloadBackupChunk",
      "deleteRemoteBackup",
    ]) expect(client).toContain(method);
    expect(client).toContain("X-SahelFlow-SHA256");
    expect(cloud).toContain("canonicalBackupVerificationBytes");
    expect(createRoute).toContain("uploadNativeBackupToCloudIfEnrolled");
    expect(createRoute).toContain('cloudState = "unavailable"');
    expect(listRoute).toContain('cloudState = "unavailable"');
    expect(listRoute).toContain("listCloudBackupsIfEnrolled");
    expect(restoreRoute).toContain("stageCloudBackupForNativeRestoreIfNeeded");
    expect(deleteRoute).toContain("deleteCloudBackupIfEnrolled");
  });
});
