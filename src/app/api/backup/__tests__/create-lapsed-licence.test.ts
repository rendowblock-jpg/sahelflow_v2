/**
 * IDN-03: POST /api/backup/create makes the LOCAL backup whatever the licence
 * says; only the cloud upload needs the licensed `sahelflow.backup` feature.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";

const h = vi.hoisted(() => ({
  licence: vi.fn(),
  requireAuth: vi.fn(),
  createBackup: vi.fn(),
  upload: vi.fn(),
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
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (_context: unknown, entry: Record<string, unknown>) => {
    h.audit.push(entry);
  }),
}));
vi.mock("@/lib/backup", () => ({ createBackup: h.createBackup }));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({
  uploadNativeBackupToCloudIfEnrolled: h.upload,
}));

import { POST as createBackupRoute } from "../create/route";

const ENTRY = {
  backupId: "backup-1700000000000-0123456789abcdef",
  shopCount: 1,
  containerBytes: 2048,
  verifiedAtUnixMs: 1,
  independentRecoveryReady: true,
};

async function call() {
  const response = (await (createBackupRoute as unknown as () => Promise<Response>)()) as Response;
  return { response, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  h.licence.mockReset();
  h.requireAuth.mockReset();
  h.requireAuth.mockResolvedValue({ actor: { kind: "owner" } });
  h.createBackup.mockReset();
  h.createBackup.mockResolvedValue(ENTRY);
  h.upload.mockReset();
  h.upload.mockResolvedValue(null);
  h.audit.length = 0;
});

describe("POST /api/backup/create with a licence that does not allow it", () => {
  it.each([
    ["LICENSE_EXPIRED", 403],
    ["LICENSE_MISSING", 403],
    ["LICENSE_REVOKED", 403],
    ["LICENSE_FEATURE_DENIED", 403],
    ["LICENSE_AUTHORITY_UNAVAILABLE", 503],
  ])("%s: the local backup is made and no cloud upload is tried", async (code, status) => {
    h.licence.mockRejectedValue(new SahelFlowError("no licence", code, status));
    const { response, body } = await call();
    expect(response.status).toBe(201);
    expect(h.createBackup).toHaveBeenCalledTimes(1);
    expect(h.upload).not.toHaveBeenCalled();
    expect(body).toMatchObject({ backupId: ENTRY.backupId, cloudBackup: null, cloudState: "license_required" });
    expect(h.audit[0]).toMatchObject({ action: "backup.create", after: { cloudState: "license_required" } });
  });

  it("a person who may not create backups is still refused before anything is made", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("forbidden", "FORBIDDEN", 403));
    h.licence.mockRejectedValue(new SahelFlowError("no licence", "LICENSE_EXPIRED", 403));
    await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.createBackup).not.toHaveBeenCalled();
  });

  it("an error that is not a licence refusal still fails the request", async () => {
    h.licence.mockRejectedValue(new Error("disk on fire"));
    await expect(call()).rejects.toThrow("disk on fire");
    expect(h.createBackup).not.toHaveBeenCalled();
  });
});

describe("POST /api/backup/create with a valid licence", () => {
  it("asks for the backup feature and uploads with the licence type", async () => {
    h.licence.mockResolvedValue({ type: "permanent" });
    h.upload.mockResolvedValue({ backupId: ENTRY.backupId, state: "verified", receiptDigest: null });
    const { response, body } = await call();
    expect(h.licence).toHaveBeenCalledWith("sahelflow.backup", expect.anything());
    expect(h.upload).toHaveBeenCalledWith(expect.anything(), ENTRY, "permanent");
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ cloudState: "verified" });
  });

  it("not enrolled in the cloud stays not_enrolled", async () => {
    h.licence.mockResolvedValue({ type: "trial" });
    const { body } = await call();
    expect(body).toMatchObject({ cloudBackup: null, cloudState: "not_enrolled" });
  });

  it("a cloud failure after a good local backup is reported, not thrown", async () => {
    h.licence.mockResolvedValue({ type: "trial" });
    h.upload.mockRejectedValue(new Error("network"));
    const { response, body } = await call();
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ cloudState: "unavailable" });
  });
});
