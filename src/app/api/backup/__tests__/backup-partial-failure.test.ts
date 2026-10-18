/**
 * S01b-07: a partial failure of the backup delete route must never leave the
 * seller with neither copy, and a degraded cloud step must leave a trace.
 *
 *  - delete: the LOCAL copy goes first. If it cannot be removed the cloud copy
 *    is untouched. If only the cloud step fails afterwards the request reports
 *    a partial result (the local copy is already gone, the retry must still be
 *    able to remove the cloud copy).
 *  - create: a swallowed cloud-upload failure writes a code-only log line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "backup-1700000000000-0123456789abcdef";
const MARKER = "sf-test-marker-5b1d";

const h = vi.hoisted(() => ({
  calls: [] as string[],
  localDeleteError: null as unknown,
  localListed: [] as string[],
  localListError: null as unknown,
  cloudDeleteResult: true as boolean,
  cloudDeleteError: null as unknown,
  cloudUploadError: null as unknown,
  audit: [] as Array<Record<string, unknown>>,
  warn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ actor: { kind: "owner" } })),
  requireRecentReauthentication: vi.fn(async () => undefined),
}));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: () => "actor-1",
}));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { workspaceId: "w" } }));
vi.mock("@/lib/license/license-authority", () => ({
  requireLicenseEntitlement: vi.fn(async () => ({ type: "trial" })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: h.warn, error: vi.fn() },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (_context: unknown, entry: Record<string, unknown>) => {
    h.audit.push(entry);
  }),
}));
vi.mock("@/lib/backup", () => ({
  deleteBackup: vi.fn(async (backupId: string) => {
    h.calls.push("local.delete");
    if (h.localDeleteError) throw h.localDeleteError;
    h.localListed = h.localListed.filter((entry) => entry !== backupId);
    return { deleted: true, success: true };
  }),
  listBackups: vi.fn(async () => {
    if (h.localListError) throw h.localListError;
    return h.localListed.map((backupId) => ({ backupId }));
  }),
  createBackup: vi.fn(async () => ({
    backupId: ID,
    shopCount: 1,
    containerBytes: 10,
    verifiedAtUnixMs: 1,
    independentRecoveryReady: true,
  })),
}));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({
  deleteCloudBackupIfEnrolled: vi.fn(async () => {
    h.calls.push("cloud.delete");
    if (h.cloudDeleteError) throw h.cloudDeleteError;
    return h.cloudDeleteResult;
  }),
  uploadNativeBackupToCloudIfEnrolled: vi.fn(async () => {
    if (h.cloudUploadError) throw h.cloudUploadError;
    return null;
  }),
}));

import { POST as createBackupRoute } from "../create/route";
import { DELETE as deleteBackupRoute } from "../[filename]/route";

async function callDelete() {
  const response = (await deleteBackupRoute(
    {} as never,
    { params: Promise.resolve({ filename: ID }) } as never,
  )) as Response;
  return { response, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  h.calls.length = 0;
  h.audit.length = 0;
  h.warn.mockClear();
  h.localDeleteError = null;
  h.localListed = [ID];
  h.localListError = null;
  h.cloudDeleteResult = true;
  h.cloudDeleteError = null;
  h.cloudUploadError = null;
});

describe("DELETE /api/backup/[filename] ordering (S01b-07)", () => {
  it("removes the local copy before it touches the cloud copy", async () => {
    const { response, body } = await callDelete();
    expect(h.calls).toEqual(["local.delete", "cloud.delete"]);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ deleted: true, cloudDeleted: true });
  });

  it("leaves the cloud copy untouched when the local delete fails", async () => {
    h.localDeleteError = new Error("backup is referenced by a pending restore");
    await expect(callDelete()).rejects.toThrow("pending restore");
    expect(h.calls).toEqual(["local.delete"]);
    expect(h.audit).toEqual([]);
  });

  it("leaves the cloud copy untouched when the local listing cannot confirm the copy is gone", async () => {
    h.localDeleteError = new Error("local delete failed");
    h.localListError = new Error("list failed");
    await expect(callDelete()).rejects.toThrow("local delete failed");
    expect(h.calls).toEqual(["local.delete"]);
  });

  it("reports a partial result, not an error, when only the cloud step fails", async () => {
    h.cloudDeleteError = Object.assign(new Error(`upstream said ${MARKER}`), {
      code: "ECONNRESET",
    });
    const { response, body } = await callDelete();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      deleted: true,
      cloudDeleted: false,
      cloudState: "unavailable",
    });
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      action: "backup.deleted",
      after: { backupId: ID, deleted: true, cloudDeleted: false, cloudState: "unavailable" },
    });
    const logged = JSON.stringify(h.warn.mock.calls);
    expect(logged).toContain("ECONNRESET");
    expect(logged).not.toContain(MARKER);
  });

  it("lets a retry remove the cloud copy after the local copy is already gone", async () => {
    h.localListed = [];
    h.localDeleteError = new Error("backup is unavailable");
    const { body } = await callDelete();
    expect(h.calls).toEqual(["local.delete", "cloud.delete"]);
    expect(body).toMatchObject({ deleted: true, cloudDeleted: true });
  });

  it("keeps the original error when the backup exists neither locally nor in the cloud", async () => {
    h.localListed = [];
    h.localDeleteError = new Error("backup is unavailable");
    h.cloudDeleteResult = false;
    await expect(callDelete()).rejects.toThrow("backup is unavailable");
  });

  it("surfaces the cloud error when the local copy is already gone and the cloud step fails", async () => {
    h.localListed = [];
    h.localDeleteError = new Error("backup is unavailable");
    h.cloudDeleteError = new Error("cloud unreachable");
    await expect(callDelete()).rejects.toThrow("cloud unreachable");
  });
});

describe("POST /api/backup/create cloud degradation (S01b-07)", () => {
  it("logs a code-only line when the cloud upload fails and still answers 201", async () => {
    h.cloudUploadError = Object.assign(new Error(`token ${MARKER} rejected`), {
      code: "ECONNRESET",
    });
    const response = (await createBackupRoute()) as Response;
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ cloudState: "unavailable" });
    expect(h.warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(h.warn.mock.calls);
    expect(logged).toContain("backup.cloud_upload_failed");
    expect(logged).toContain("ECONNRESET");
    expect(logged).not.toContain(MARKER);
  });

  it("stays silent when the cloud upload is simply not enrolled", async () => {
    const response = (await createBackupRoute()) as Response;
    expect(response.status).toBe(201);
    expect(h.warn).not.toHaveBeenCalled();
  });
});
