import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A staged restore replaces the data on the next launch, so the scheduler must stop making backups
// of the data that is about to go. Real code: the route, withErrorHandler and the hold. Stand-ins: auth,
// the native restore, the cloud staging, audit and the hooks withErrorHandler calls.
const h = vi.hoisted(() => ({ restoreBackup: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ actor: {} })),
  requireRecentReauthentication: vi.fn(async () => undefined),
}));
vi.mock("@/lib/backup", () => ({ restoreBackup: h.restoreBackup }));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({
  stageCloudBackupForNativeRestoreIfNeeded: vi.fn(async () => null),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: () => ({}) }));
vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { POST } from "@/app/api/backup/restore/route";
import {
  releaseScheduledBackups,
  scheduledBackupsHeld,
} from "@/lib/backup/scheduled-backup-busy";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/backup/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ backupId: "backup-1790000000000-0123456789abcdef", confirm: "RESTORE" }),
  });
}

beforeEach(() => {
  h.restoreBackup.mockReset();
  releaseScheduledBackups("restore-staged");
});
afterEach(() => releaseScheduledBackups("restore-staged"));

describe("POST /api/backup/restore and the scheduler", () => {
  it("holds scheduled backups once the restore is staged", async () => {
    h.restoreBackup.mockResolvedValue({
      backupId: "backup-1790000000000-0123456789abcdef",
      restoreId: "r1",
      sourceWorkspaceId: "w",
      sourceShopCount: 1,
      restartRequired: true,
    });
    expect(scheduledBackupsHeld()).toBe(false);
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(scheduledBackupsHeld()).toBe(true);
  });

  it("does not hold them when the restore was refused", async () => {
    h.restoreBackup.mockRejectedValue(new Error("refused"));
    const response = await POST(request());
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(scheduledBackupsHeld()).toBe(false);
  });
});
