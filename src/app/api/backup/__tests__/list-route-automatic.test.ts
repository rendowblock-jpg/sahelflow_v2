import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/backup/list also tells the panel when the scheduler last made a backup that is still on this
// computer. Real code: the route and withErrorHandler. Stand-ins: auth, the two backup sources, the scheduler's
// state file, the database handle and the hooks withErrorHandler calls.
const h = vi.hoisted(() => ({
  listBackups: vi.fn(),
  readState: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(async () => ({})) }));
vi.mock("@/lib/backup", () => ({ listBackups: h.listBackups }));
vi.mock("@/lib/backup/scheduled-backup-state", () => ({ readScheduledBackupState: h.readState }));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({ listCloudBackupsIfEnrolled: vi.fn(async () => []) }));
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

import { GET } from "@/app/api/backup/list/route";

function entry(backupId: string, createdAtUnixMs: number, status = "verified") {
  return {
    backupId,
    createdAtUnixMs,
    verifiedAtUnixMs: createdAtUnixMs,
    retentionClass: "manual",
    pinned: false,
    workspaceId: "a".repeat(32),
    sourceInstallationId: "installation-1",
    shopCount: 1,
    plaintextBytes: 4096,
    containerBytes: 2048,
    status,
    location: "local",
    requiresRecoveryKit: false,
    independentRecoveryReady: true,
  };
}

async function automatic(): Promise<number | null> {
  const body = (await (await GET()).json()) as { automatic: { lastBackupAtUnixMs: number | null } };
  return body.automatic.lastBackupAtUnixMs;
}

beforeEach(() => {
  h.listBackups.mockReset();
  h.readState.mockReset();
  h.readState.mockResolvedValue({ automaticIds: [] });
});

describe("GET /api/backup/list: the last automatic backup", () => {
  it("is the newest listed backup the scheduler made, not a newer manual one", async () => {
    h.readState.mockResolvedValue({ automaticIds: ["auto-old", "auto-new"] });
    h.listBackups.mockResolvedValue([entry("manual-newest", 9000), entry("auto-new", 5000), entry("auto-old", 1000)]);
    expect(await automatic()).toBe(5000);
  });

  it("is null when nothing the scheduler made is still listed", async () => {
    h.readState.mockResolvedValue({ automaticIds: ["deleted-by-hand"] });
    h.listBackups.mockResolvedValue([entry("manual-1", 9000)]);
    expect(await automatic()).toBeNull();
  });

  it("does not count a corrupt automatic backup as protection", async () => {
    h.readState.mockResolvedValue({ automaticIds: ["auto-bad", "auto-good"] });
    h.listBackups.mockResolvedValue([entry("auto-bad", 9000, "corrupt"), entry("auto-good", 4000)]);
    expect(await automatic()).toBe(4000);
  });
});
