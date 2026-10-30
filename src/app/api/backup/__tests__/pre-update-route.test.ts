/**
 * POST /api/backup/pre-update: a LOCAL backup right before an update installs.
 * Owner or the local desktop principal only; no licence needed; never uploads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  licence: vi.fn(),
  upload: vi.fn(),
  createBackup: vi.fn(),
  listBackups: vi.fn(),
  readState: vi.fn(),
  writeState: vi.fn(),
  warn: vi.fn(),
  audit: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: () => "actor-1" }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { workspaceId: "w" } }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: h.licence }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: h.warn, error: vi.fn() },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (_context: unknown, entry: Record<string, unknown>) => {
    h.audit.push(entry);
  }),
}));
vi.mock("@/lib/backup", () => ({ createBackup: h.createBackup, listBackups: h.listBackups }));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({
  uploadNativeBackupToCloudIfEnrolled: h.upload,
}));
vi.mock("@/lib/backup/scheduled-backup-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backup/scheduled-backup-state")>()),
  readScheduledBackupState: h.readState,
  writeScheduledBackupState: h.writeState,
}));

import { emptyScheduledBackupState } from "@/lib/backup/scheduled-backup-state";
import { releaseScheduledBackups, scheduledBackupsHeld } from "@/lib/backup/scheduled-backup-busy";

import { POST } from "../pre-update/route";

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const MINUTE = 60_000;
const ENTRY = {
  backupId: "backup-1700000000000-0123456789abcdef",
  shopCount: 1,
  containerBytes: 2048,
  verifiedAtUnixMs: 1,
  independentRecoveryReady: true,
};

function listed(backupId: string, ageMs: number, status = "verified") {
  return { backupId, createdAtUnixMs: NOW - ageMs, pinned: false, status };
}

async function call() {
  const response = await (POST as unknown as () => Promise<Response>)();
  return { response, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const mock of Object.values(h)) if (typeof mock === "function") mock.mockReset();
  h.audit.length = 0;
  h.requireAuth.mockResolvedValue({ actor: { kind: "compatibility_local_owner" } });
  h.licence.mockRejectedValue(new SahelFlowError("lapsed", "LICENSE_EXPIRED", 403));
  h.createBackup.mockResolvedValue(ENTRY);
  h.listBackups.mockResolvedValue([]);
  h.readState.mockResolvedValue(emptyScheduledBackupState());
  h.writeState.mockResolvedValue(undefined);
  h.upload.mockResolvedValue(null);
});
afterEach(() => {
  releaseScheduledBackups("update");
  vi.useRealTimers();
});

describe("who may call it", () => {
  it("asks for the backup permission", async () => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledWith("backups.create");
  });

  it.each([
    ["the local desktop principal", { kind: "compatibility_local_owner" }],
    ["a person with the owner role", { kind: "person", role: "owner" }],
  ])("%s may", async (_label, actor) => {
    h.requireAuth.mockResolvedValue({ actor });
    const { response } = await call();
    expect(response.status).toBe(201);
  });

  it.each([
    ["a manager", { kind: "person", role: "manager" }],
    ["a cashier", { kind: "person", role: "cashier" }],
    ["a device", { kind: "device" }],
  ])("%s gets 403 and nothing is made", async (_label, actor) => {
    h.requireAuth.mockResolvedValue({ actor });
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.listBackups).not.toHaveBeenCalled();
    expect(h.createBackup).not.toHaveBeenCalled();
    expect(scheduledBackupsHeld()).toBe(false);
  });

  it("a person without the permission is refused before anything is made", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("no", "FORBIDDEN", 403));
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.createBackup).not.toHaveBeenCalled();
  });
});

describe("when a backup is made", () => {
  it("makes one, answers ok with id and duration, records it for retention", async () => {
    h.createBackup.mockImplementation(async () => {
      vi.setSystemTime(NOW + 4200);
      return ENTRY;
    });
    const { response, body } = await call();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ ok: true, backupId: ENTRY.backupId, durationMs: 4200 });
    expect(h.createBackup).toHaveBeenCalledTimes(1);
    expect(h.writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        automaticIds: [ENTRY.backupId],
        preUpdateIds: [ENTRY.backupId],
        lastSuccessAtMs: NOW + 4200,
      }),
    );
    expect(h.audit[0]).toMatchObject({ action: "backup.pre_update", entityId: ENTRY.backupId });
  });

  it("holds the scheduled worker while it runs and releases after", async () => {
    let heldDuring: boolean | null = null;
    h.createBackup.mockImplementation(async () => {
      heldDuring = scheduledBackupsHeld();
      return ENTRY;
    });
    await call();
    expect(heldDuring).toBe(true);
    expect(scheduledBackupsHeld()).toBe(false);
  });

  it("a lapsed licence does not matter, and nothing goes to the cloud", async () => {
    const { response } = await call();
    expect(response.status).toBe(201);
    expect(h.licence).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it("a backup list that cannot be read still leads to a backup", async () => {
    h.listBackups.mockRejectedValue(new Error("list broke"));
    const { response } = await call();
    expect(response.status).toBe(201);
    expect(h.createBackup).toHaveBeenCalledTimes(1);
  });

  it("a state file that cannot be written does not turn a good backup into a failure", async () => {
    h.writeState.mockRejectedValue(new Error("disk"));
    const { response, body } = await call();
    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(h.warn).toHaveBeenCalled();
  });

  it("two calls at once make ONE backup", async () => {
    let finish!: () => void;
    h.createBackup.mockImplementation(
      () => new Promise((resolve) => { finish = () => resolve(ENTRY); }),
    );
    const first = call();
    const second = call();
    await vi.advanceTimersByTimeAsync(0);
    finish();
    const [a, b] = await Promise.all([first, second]);
    expect(h.createBackup).toHaveBeenCalledTimes(1);
    expect(a.body.backupId).toBe(b.body.backupId);
  });
});

describe("the 60 minute rule, from the newest backup of any kind", () => {
  it("59 minutes old: skipped, fresh, with the age", async () => {
    h.listBackups.mockResolvedValue([listed("manual-1", 59 * MINUTE)]);
    const { response, body } = await call();
    expect(response.status).toBe(200);
    expect(body).toEqual({ skipped: "fresh", ageMinutes: 59 });
    expect(h.createBackup).not.toHaveBeenCalled();
    expect(h.writeState).not.toHaveBeenCalled();
  });

  it("61 minutes old: a new one is made", async () => {
    h.listBackups.mockResolvedValue([listed("manual-1", 61 * MINUTE)]);
    const { body } = await call();
    expect(body.ok).toBe(true);
    expect(h.createBackup).toHaveBeenCalledTimes(1);
  });

  it("the newest of several decides, whoever made it", async () => {
    h.listBackups.mockResolvedValue([listed("old", 300 * MINUTE), listed("new", 10 * MINUTE)]);
    const { body } = await call();
    expect(body).toEqual({ skipped: "fresh", ageMinutes: 10 });
  });

  it("a corrupt backup does not count as fresh", async () => {
    h.listBackups.mockResolvedValue([
      listed("bad", 5 * MINUTE, "corrupt"),
      listed("good", 90 * MINUTE),
    ]);
    const { body } = await call();
    expect(body.ok).toBe(true);
    expect(h.createBackup).toHaveBeenCalledTimes(1);
  });

  it("a backup dated in the future does not count", async () => {
    h.listBackups.mockResolvedValue([listed("future", -10 * MINUTE)]);
    const { body } = await call();
    expect(body.ok).toBe(true);
  });
});

describe("when the backup fails", () => {
  it("answers a typed failure with no message, releases the hold, records nothing", async () => {
    h.createBackup.mockRejectedValue(new Error("disk on fire at C:\\Users\\shop"));
    const { response, body } = await call();
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.code).toEqual(expect.stringMatching(/^[A-Za-z0-9_]{1,40}$/));
    expect(JSON.stringify(body)).not.toContain("disk on fire");
    expect(scheduledBackupsHeld()).toBe(false);
    expect(h.writeState).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalledWith("backup.pre_update.failed", expect.anything());
  });

  it("a later call after a failure tries again", async () => {
    h.createBackup.mockRejectedValueOnce(new Error("x"));
    await call();
    const { body } = await call();
    expect(body.ok).toBe(true);
    expect(h.createBackup).toHaveBeenCalledTimes(2);
  });
});
