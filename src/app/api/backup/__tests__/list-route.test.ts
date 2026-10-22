import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/backup/list is the list of backups the seller can restore from. It merges two sources: the backups on
// this computer (the recovery authority) and, for an enrolled shop, the verified backups held in the cloud.
// What matters: only an authorised caller gets in; a backup known to both sources appears once and the LOCAL entry
// wins; the newest backup is first; and when the cloud cannot be reached the local backups are still listed and the
// reply says so (`cloudState: "unavailable"`) instead of failing or pretending that nothing is there.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones),
// SahelFlowError and the Phase 2 permission catalog and role table. Stand-ins: the identity layer (requireAuth),
// the two backup sources (listBackups, listCloudBackupsIfEnrolled), the database handle and the logger/monitoring
// hooks withErrorHandler calls (its shop-authority and licence hooks only run when NODE_ENV is production, so
// those two mocks are inert here and the production checks that run before requireAuth are NOT tested).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listBackups: vi.fn(),
  listCloud: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/backup", () => ({ listBackups: h.listBackups }));
vi.mock("@/lib/connected-platform/cloud-backup", () => ({ listCloudBackupsIfEnrolled: h.listCloud }));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/backup/list/route";
import { db, shopContext } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { GET } = route;

const PERMISSION = "backups.read";
const SECRET_IN_ERROR = "SECRET-CLOUD-TOKEN-0001";

// The shape of a real BackupEntry (src/lib/backup/index.ts), built here so a test only states what it cares about.
function entry(backupId: string, createdAtUnixMs: number, location: "local" | "cloud", extra: Record<string, unknown> = {}) {
  return {
    backupId,
    createdAtUnixMs,
    verifiedAtUnixMs: createdAtUnixMs,
    retentionClass: "daily",
    pinned: false,
    workspaceId: "a".repeat(32),
    sourceInstallationId: location === "cloud" ? "cloud-encrypted" : "installation-1",
    shopCount: 1,
    plaintextBytes: location === "cloud" ? 0 : 4096,
    containerBytes: 2048,
    status: "verified" as const,
    location,
    requiresRecoveryKit: location === "cloud",
    independentRecoveryReady: false,
    filename: backupId,
    size: 2048,
    createdAt: new Date(createdAtUnixMs).toISOString(),
    shopId: "default",
    sha256: "f".repeat(64),
    ...extra,
  };
}

const LOCAL_OLD = entry("backup-1760000000000-0000000000000001", 1_760_000_000_000, "local");
const LOCAL_NEW = entry("backup-1760000300000-0000000000000002", 1_760_000_300_000, "local");
const CLOUD_MID = entry("backup-1760000100000-0000000000000003", 1_760_000_100_000, "cloud");
const CLOUD_NEWEST = entry("backup-1760000400000-0000000000000004", 1_760_000_400_000, "cloud");

function ids(body: { backups: Array<{ backupId: string }> }): string[] {
  return body.backups.map((backup) => backup.backupId);
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const call = spy.mock.calls[0];
  if (!call) throw new Error("the stand-in was never called");
  return call;
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

beforeEach(() => {
  h.requireAuth.mockReset().mockResolvedValue({ actor: { personId: "5".repeat(32), role: "owner" } });
  h.listBackups.mockReset().mockResolvedValue([]);
  h.listCloud.mockReset().mockResolvedValue([]);
});

describe("GET /api/backup/list: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports GET and no other HTTP verb", () => {
    expect(typeof route.GET).toBe("function");
    for (const verb of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route, verb).not.toHaveProperty(verb);
    }
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner.
  it("demands a permission that really exists in the action catalog", () => {
    expect(PHASE2_ACTIONS as readonly string[]).toContain(PERMISSION);
  });

  it("demands the backups.read permission, once, and nothing else", async () => {
    await GET();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(PERMISSION);
  });

  // OBSERVED: the manager preset can create backups (backups.create) but cannot read the list. Whether that is
  // intended is a product question; this test only records what the role table says today.
  it("is open, in the preset role table, to the owner only", () => {
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      hasPhase2Permission(getPhase2PresetPermissions(role), PERMISSION),
    );
    expect(holders).toEqual(["owner"]);
  });

  it("reads neither backup source for a caller without the permission, and passes the refusal on", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.listBackups).not.toHaveBeenCalled();
    expect(h.listCloud).not.toHaveBeenCalled();
  });

  it("checks who is asking before it reads either source", async () => {
    await GET();
    expect(firstOrder(h.requireAuth)).toBeLessThan(firstOrder(h.listBackups));
    expect(firstOrder(h.requireAuth)).toBeLessThan(firstOrder(h.listCloud));
  });
});

describe("GET /api/backup/list: merging the two sources", () => {
  it("answers 200 with no-store, an empty list, and the cloud marked available when both sources are empty", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ backups: [], cloudState: "available" });
  });

  it("asks the cloud source about this shop, with the route's own database handle and shop context", async () => {
    await GET();
    expect(h.listCloud).toHaveBeenCalledTimes(1);
    const [context] = firstCall(h.listCloud) as [{ prisma: unknown; shop: unknown }];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
  });

  it("lists the local backups as they are when the shop is not enrolled (the cloud source answers an empty list)", async () => {
    h.listBackups.mockResolvedValue([LOCAL_NEW, LOCAL_OLD]);
    const body = await (await GET()).json();
    expect(body).toEqual({ backups: [LOCAL_NEW, LOCAL_OLD], cloudState: "available" });
  });

  it("lists the cloud backups when there are no local ones", async () => {
    h.listCloud.mockResolvedValue([CLOUD_MID]);
    const body = await (await GET()).json();
    expect(body).toEqual({ backups: [CLOUD_MID], cloudState: "available" });
  });

  it("puts the newest backup first whichever source it came from", async () => {
    h.listBackups.mockResolvedValue([LOCAL_OLD, LOCAL_NEW]);
    h.listCloud.mockResolvedValue([CLOUD_MID, CLOUD_NEWEST]);
    const body = await (await GET()).json();
    expect(ids(body)).toEqual([CLOUD_NEWEST.backupId, LOCAL_NEW.backupId, CLOUD_MID.backupId, LOCAL_OLD.backupId]);
  });

  it("sorts by the creation time as a NUMBER, not as text (a shorter number is older even if it starts with a bigger digit)", async () => {
    const nine = entry("backup-9000000000000-0000000000000009", 9_000_000_000_000, "local");
    const ten = entry("backup-10000000000000-000000000000000a", 10_000_000_000_000, "local");
    h.listBackups.mockResolvedValue([nine, ten]);
    const body = await (await GET()).json();
    expect(ids(body)).toEqual([ten.backupId, nine.backupId]);
  });

  it("shows a backup that both sources know once, and the LOCAL entry is the one kept", async () => {
    const local = entry(CLOUD_MID.backupId, CLOUD_MID.createdAtUnixMs, "local", { retentionClass: "pinned", pinned: true });
    h.listBackups.mockResolvedValue([local, LOCAL_OLD]);
    h.listCloud.mockResolvedValue([CLOUD_MID, CLOUD_NEWEST]);
    const body = await (await GET()).json();
    expect(ids(body)).toEqual([CLOUD_NEWEST.backupId, CLOUD_MID.backupId, LOCAL_OLD.backupId]);
    const kept = body.backups.find((backup: { backupId: string }) => backup.backupId === CLOUD_MID.backupId);
    expect(kept).toEqual(local);
    expect(kept.location).toBe("local");
    expect(kept.pinned).toBe(true);
  });

  it("drops every cloud entry whose id is already local, and keeps the ones that are not", async () => {
    h.listBackups.mockResolvedValue([LOCAL_NEW, LOCAL_OLD]);
    h.listCloud.mockResolvedValue([
      entry(LOCAL_NEW.backupId, LOCAL_NEW.createdAtUnixMs, "cloud"),
      entry(LOCAL_OLD.backupId, LOCAL_OLD.createdAtUnixMs, "cloud"),
      CLOUD_MID,
    ]);
    const body = await (await GET()).json();
    expect(body.backups).toHaveLength(3);
    expect(body.backups.filter((backup: { location: string }) => backup.location === "cloud").map((backup: { backupId: string }) => backup.backupId))
      .toEqual([CLOUD_MID.backupId]);
  });

  it("compares ids exactly: an id that differs only by case or by a trailing character is a different backup", async () => {
    h.listBackups.mockResolvedValue([LOCAL_OLD]);
    const upper = entry(LOCAL_OLD.backupId.toUpperCase(), LOCAL_OLD.createdAtUnixMs, "cloud");
    const longer = entry(`${LOCAL_OLD.backupId}0`, LOCAL_OLD.createdAtUnixMs, "cloud");
    h.listCloud.mockResolvedValue([upper, longer]);
    const body = await (await GET()).json();
    expect(body.backups).toHaveLength(3);
  });

  it("keeps the local entry first when a local and a cloud backup were created at the same instant", async () => {
    const cloudSameTime = entry("backup-1760000000000-00000000000000ff", LOCAL_OLD.createdAtUnixMs, "cloud");
    h.listBackups.mockResolvedValue([LOCAL_OLD]);
    h.listCloud.mockResolvedValue([cloudSameTime]);
    const body = await (await GET()).json();
    expect(ids(body)).toEqual([LOCAL_OLD.backupId, cloudSameTime.backupId]);
  });

  // The cloud source really returns a frozen array (Object.freeze) and the local one may too: the route must build
  // its own list instead of sorting what it was given.
  it("does not modify the lists the two sources returned", async () => {
    const local = Object.freeze([LOCAL_OLD, LOCAL_NEW]);
    const cloud = Object.freeze([CLOUD_NEWEST, CLOUD_MID]);
    h.listBackups.mockResolvedValue(local);
    h.listCloud.mockResolvedValue(cloud);
    // Sorting a frozen array throws, so a 200 is the proof that the route sorted its own copy.
    const response = await GET();
    expect(response.status).toBe(200);
    expect(ids(await response.json())).toEqual([CLOUD_NEWEST.backupId, LOCAL_NEW.backupId, CLOUD_MID.backupId, LOCAL_OLD.backupId]);
  });
});

describe("GET /api/backup/list: when a source fails", () => {
  it("still lists the local backups, and says the cloud is unavailable, when the cloud source fails", async () => {
    h.listBackups.mockResolvedValue([LOCAL_NEW, LOCAL_OLD]);
    h.listCloud.mockRejectedValue(new Error("connected platform is down"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ backups: [LOCAL_NEW, LOCAL_OLD], cloudState: "unavailable" });
  });

  it("answers an empty list and `unavailable` when the cloud fails and there is nothing local", async () => {
    h.listCloud.mockRejectedValue(new Error("connected platform is down"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ backups: [], cloudState: "unavailable" });
  });

  it("treats a refusal from the cloud (a SahelFlowError) like any other cloud failure, not as the caller's refusal", async () => {
    h.listBackups.mockResolvedValue([LOCAL_OLD]);
    h.listCloud.mockRejectedValue(new SahelFlowError("Not entitled", "LICENSE_REQUIRED", 402));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ backups: [LOCAL_OLD], cloudState: "unavailable" });
  });

  it("never shows the text of the cloud failure to the browser", async () => {
    h.listCloud.mockRejectedValue(new Error(`401 from the platform for token ${SECRET_IN_ERROR}`));
    const response = await GET();
    expect(JSON.stringify(await response.json())).not.toContain(SECRET_IN_ERROR);
  });

  it("does not hide a failure of the LOCAL source: the cloud entries are not shown in its place", async () => {
    h.listBackups.mockRejectedValue(new Error(`native list failed: ${SECRET_IN_ERROR}`));
    h.listCloud.mockResolvedValue([CLOUD_MID]);
    const response = await GET();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(text).not.toContain(CLOUD_MID.backupId);
  });
});
