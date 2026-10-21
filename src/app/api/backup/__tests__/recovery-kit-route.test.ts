import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/backup/recovery-kit hands the seller the recovery code that can unlock a restored backup. What
// matters here is the ORDER (who may ask, proof of a recent PIN, only then the key material), what is written
// to the audit log (never the code or the file path), and what happens when a step fails (no code is returned).
// The collaborators are stand-ins, in the style of src/app/api/auth/__tests__/reauthenticate-route.test.ts:
// the native key ceremony and the identity layer have their own tests; this file pins the route's own contract.
const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRecentReauthentication: vi.fn(),
  createRecoveryKit: vi.fn(),
  logAudit: vi.fn(),
  auditIdentity: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: harness.requireAuth,
  requireRecentReauthentication: harness.requireRecentReauthentication,
}));

vi.mock("@/lib/backup", () => ({
  createRecoveryKit: harness.createRecoveryKit,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: harness.logAudit,
}));

vi.mock("@/lib/identity/authorization", () => ({
  trustedActorAuditIdentity: harness.auditIdentity,
}));

vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "default", registryRevision: 1, workspaceId: "1".repeat(32) },
}));

// withErrorHandler is the REAL one (so the status and body of each refusal are the real ones); only the hooks it
// calls are stand-ins.
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import * as route from "@/app/api/backup/recovery-kit/route";
import { db, shopContext } from "@/lib/db";
import { PHASE2_ACTIONS } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { POST } = route;

const KIT = {
  kitId: "kit-0123456789abcdef",
  path: "C:\\Users\\Seller\\SahelFlow\\recovery\\kit-0123456789abcdef.sfrk",
  recoveryCode: "QZ7K-M2XD-9PWR-4TNB-H8VC-6LYE",
  workspaceId: "a".repeat(32),
  brkId: "brk-fedcba9876543210",
  createdAtUnixMs: 1_760_000_000_000,
};
const ACTOR = { personId: "5".repeat(32), role: "owner" as const };
// The real trustedActorAuditIdentity returns a string such as person:<id>, and an audit entry's actor is a string.
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;

// The route takes no request: it reads everything it needs from the session.
function call(): Promise<Response> {
  return POST();
}

type Spy = { mock: { calls: unknown[][]; invocationCallOrder: number[] } };

function firstCall(spy: Spy): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function firstOrder(spy: Spy): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function rejection(message: string, code: string, statusCode: number): SahelFlowError {
  return new SahelFlowError(message, code, statusCode);
}

beforeEach(() => {
  harness.requireAuth.mockReset().mockResolvedValue({ actor: ACTOR, shop: { shopId: "default" } });
  harness.requireRecentReauthentication.mockReset().mockResolvedValue(undefined);
  harness.createRecoveryKit.mockReset().mockResolvedValue({ ...KIT });
  harness.logAudit.mockReset().mockResolvedValue(undefined);
  harness.auditIdentity.mockReset().mockReturnValue(AUDIT_ACTOR);
});

describe("POST /api/backup/recovery-kit: the happy path", () => {
  it("answers 201 with the kit, uncached, and never lets the response be cached by a proxy", async () => {
    const response = await call();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(KIT);
  });

  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports nothing but POST (a later GET would hand out the code) and the dynamic flag", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic"]);
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner, and no other test in this file would show it.
  it("demands permissions that really exist in the action catalog", () => {
    for (const action of ["backups.restore", "approvals.approve"]) {
      expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
    }
  });

  it("demands both the restore and the approval permission, nothing less", async () => {
    await call();
    expect(harness.requireAuth).toHaveBeenCalledTimes(1);
    const [actions] = firstCall(harness.requireAuth);
    expect([...(actions as string[])].sort()).toEqual(["approvals.approve", "backups.restore"]);
  });

  it("asks for a recent PIN proof with the default window", async () => {
    await call();
    expect(harness.requireRecentReauthentication).toHaveBeenCalledTimes(1);
    expect(harness.requireRecentReauthentication).toHaveBeenCalledWith();
  });

  it("checks who is asking, then the recent PIN, then makes the kit, then audits it, in that order", async () => {
    await call();
    const order = [
      harness.requireAuth,
      harness.requireRecentReauthentication,
      harness.createRecoveryKit,
      harness.logAudit,
    ].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(4);
  });
});

describe("POST /api/backup/recovery-kit: what is written to the audit log", () => {
  it("records who made which kit, in the system scope, with the trusted identity of the actor", async () => {
    await call();
    expect(harness.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(harness.logAudit).toHaveBeenCalledTimes(1);
    const [context, entry] = firstCall(harness.logAudit) as [{ prisma: unknown; shop: unknown }, unknown];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(entry).toEqual({
      action: "backup.recovery-kit.created",
      entity: "system",
      entityId: KIT.kitId,
      actor: AUDIT_ACTOR,
      after: {
        kitId: KIT.kitId,
        workspaceId: KIT.workspaceId,
        brkId: KIT.brkId,
        createdAtUnixMs: KIT.createdAtUnixMs,
      },
    });
  });

  it("never writes the recovery code or the file path into the audit log", async () => {
    await call();
    const written = JSON.stringify(harness.logAudit.mock.calls);
    expect(written).not.toContain(KIT.recoveryCode);
    expect(written).not.toContain("recoveryCode");
    // JSON escapes the backslashes of a Windows path, so compare with the escaped form.
    expect(written).not.toContain(JSON.stringify(KIT.path).slice(1, -1));
    expect(written).not.toContain("SahelFlow\\\\recovery");
  });
});

describe("POST /api/backup/recovery-kit: refusals leave no key material behind", () => {
  it("makes no kit and writes no audit entry for a caller without the permissions", async () => {
    harness.requireAuth.mockRejectedValue(rejection("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(harness.requireRecentReauthentication).not.toHaveBeenCalled();
    expect(harness.createRecoveryKit).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("makes no kit and writes no audit entry without a recent PIN proof", async () => {
    harness.requireRecentReauthentication.mockRejectedValue(
      rejection("Recent PIN verification is required", "REAUTHENTICATION_REQUIRED", 403),
    );
    const response = await call();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expect(harness.createRecoveryKit).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("writes no audit entry and returns no code when the kit could not be made", async () => {
    harness.createRecoveryKit.mockRejectedValue(new Error("native key ceremony failed"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(KIT.recoveryCode);
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  // Deliberately NOT tested: "no recovery code is returned when the audit write fails". The real logAudit never
  // throws (src/lib/audit.ts: audit is a signal, not a gate), so in production a failed audit write still returns
  // the kit. Whether that is acceptable for a recovery code is a product decision for the route, not for a test.
});
