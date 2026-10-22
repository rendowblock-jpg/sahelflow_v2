import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/delivery/test-connection is the "check the connection" button for a courier account in Settings: it
// uses the saved API secrets to ask the courier, without creating anything, whether they work, and records the
// outcome. What matters: only an authorised person with a recent PIN proof gets in (before the body is even read);
// only the four known couriers are accepted; the reason code is validated; the outcome is audited under the right
// action name; and the audit entry never says `certified` (the route writes certified: false by itself; what the
// check writes into the certification store, where the connection IS marked certified, is NOT tested here: it is a
// stand-in).
// Not tested on purpose: a failing audit write. The real logAudit swallows its own errors, so a stand-in that
// rejects would pin something that cannot happen.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones),
// zod, SahelFlowError and the Phase 2 permission catalog and role table. Stand-ins: the identity layer (requireAuth,
// requireRecentReauthentication, trusted-actor identity), the audit writer, the database handle, the courier check
// itself (testAndCertifyProvider: it talks to the courier and writes the certification rows, so it is not run
// here) and the logger/monitoring hooks withErrorHandler calls (its shop-authority and licence hooks only run when
// NODE_ENV is production, so those two mocks are inert here and the production checks that run before requireAuth
// are NOT tested).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRecent: vi.fn(),
  auditIdentity: vi.fn(),
  logAudit: vi.fn(),
  testAndCertify: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: h.requireAuth,
  requireRecentReauthentication: h.requireRecent,
}));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/integrations/delivery/provider-capability", () => ({ testAndCertifyProvider: h.testAndCertify }));
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

import * as route from "@/app/api/delivery/test-connection/route";
import { db, shopContext } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { POST } = route;

const PERMISSION = "delivery.credentials.manage";
const ACTOR = { kind: "person" as const, personId: "5".repeat(32), role: "owner" as const };
// The real trustedActorAuditIdentity returns a string such as person:<id>.
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;
const DEFAULT_REASON = "settings_manual_certification";
const EXPIRES_AT = "2026-11-21T10:00:00.000Z";
const SECRET_IN_ERROR = "SECRET-API-TOKEN-0002";
const PROVIDERS = ["yalidine", "maystro", "zrexpress", "ecotrack"] as const;

const OK_RESULT = { ok: true, message: "Yalidine connection verified.", expiresAt: EXPIRES_AT };
const FAILED_RESULT = { ok: false, message: "Yalidine credentials are not configured." };

function post(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/delivery/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

function call(provider: unknown = "yalidine", extra: Record<string, unknown> = {}) {
  return POST(post({ provider, ...extra }));
}

function firstCall(spy: { mock: { calls: unknown[][] } }): unknown[] {
  const first = spy.mock.calls[0];
  if (!first) throw new Error("the stand-in was never called");
  return first;
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function auditEntry(): Record<string, unknown> {
  return firstCall(h.logAudit)[1] as Record<string, unknown>;
}

function expectNothingRanAfterTheGate(): void {
  expect(h.testAndCertify).not.toHaveBeenCalled();
  expect(h.logAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.requireAuth.mockReset().mockResolvedValue({ actor: ACTOR, shop: { shopId: "default" } });
  h.requireRecent.mockReset().mockResolvedValue(undefined);
  h.auditIdentity.mockReset().mockReturnValue(AUDIT_ACTOR);
  h.logAudit.mockReset().mockResolvedValue(undefined);
  h.testAndCertify.mockReset().mockResolvedValue({ ...OK_RESULT });
});

describe("POST /api/delivery/test-connection: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports POST and no other HTTP verb", () => {
    expect(typeof route.POST).toBe("function");
    for (const verb of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route, verb).not.toHaveProperty(verb);
    }
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can.
  it("demands a permission that really exists in the action catalog", () => {
    expect(PHASE2_ACTIONS as readonly string[]).toContain(PERMISSION);
  });

  it("demands the delivery-credentials permission and a recent PIN proof with the default window", async () => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(PERMISSION);
    expect(h.requireRecent).toHaveBeenCalledTimes(1);
    expect(h.requireRecent).toHaveBeenCalledWith();
  });

  it("is open, in the preset role table, to the owner only", () => {
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      hasPhase2Permission(getPhase2PresetPermissions(role), PERMISSION),
    );
    expect(holders).toEqual(["owner"]);
  });

  it("runs no check and writes no audit entry for a caller without the permission, and skips the PIN proof", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.requireRecent).not.toHaveBeenCalled();
    expectNothingRanAfterTheGate();
  });

  it("refuses without a recent PIN proof before it reads the body", async () => {
    h.requireRecent.mockRejectedValue(new SahelFlowError("Recent PIN verification is required", "REAUTHENTICATION_REQUIRED", 403));
    const response = await POST(post(null, "{not json"));
    // 403, not 400: the malformed body was never looked at.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expectNothingRanAfterTheGate();
  });

  it("checks who is asking, then the recent PIN, then the courier, then audits, in that order", async () => {
    await call();
    const order = [h.requireAuth, h.requireRecent, h.testAndCertify, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(4);
  });
});

describe("POST /api/delivery/test-connection: what is accepted", () => {
  it.each(PROVIDERS)("checks %s with the shop's own context, the trusted actor, and the default reason code", async (provider) => {
    const response = await call(provider);
    expect(response.status).toBe(200);
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(h.testAndCertify).toHaveBeenCalledTimes(1);
    const [context, askedProvider, actor, reason] = firstCall(h.testAndCertify) as [
      { prisma: unknown; shop: unknown },
      string,
      string,
      string,
    ];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(askedProvider).toBe(provider);
    expect(actor).toBe(AUDIT_ACTOR);
    expect(reason).toBe(DEFAULT_REASON);
  });

  it.each([
    ["an unknown courier", "dhl"],
    ["the retired noest name", "noest"],
    ["another letter case", "Yalidine"],
    ["a trailing space", "yalidine "],
    ["an empty text", ""],
    ["a number", 5],
    ["null", null],
    ["a path", "../yalidine"],
    ["the text __proto__", "__proto__"],
  ])("answers 400 REQUEST_VALIDATION_FAILED and checks nothing for %s as the provider", async (_label, provider) => {
    const response = await call(provider);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingRanAfterTheGate();
  });

  it("answers 400 and checks nothing when the provider is missing", async () => {
    const response = await POST(post({}));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingRanAfterTheGate();
  });

  it.each([
    ["null", "null"],
    ["a list", "[]"],
    ["a text", '"yalidine"'],
    ["a number", "7"],
  ])("answers 400 REQUEST_VALIDATION_FAILED and checks nothing when the body is %s", async (_label, raw) => {
    const response = await POST(post(null, raw));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingRanAfterTheGate();
  });

  it("answers 400 INVALID_REQUEST_JSON and checks nothing when the body is not JSON", async () => {
    const response = await POST(post(null, "{not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST_JSON" });
    expectNothingRanAfterTheGate();
  });
});

describe("POST /api/delivery/test-connection: the reason code", () => {
  it.each([
    ["two characters, the shortest", "ab"],
    ["eighty characters, the longest", "a".repeat(80)],
    ["a leading digit", "9x"],
    ["capital letters", "Manual-CHECK"],
    ["dots, dashes and underscores inside", "manual.check-1_b"],
  ])("accepts %s and passes it unchanged to the check and to the audit entry", async (_label, reasonCode) => {
    const response = await call("yalidine", { reasonCode });
    expect(response.status).toBe(200);
    expect(firstCall(h.testAndCertify)[3]).toBe(reasonCode);
    expect((auditEntry().metadata as { reasonCode: string }).reasonCode).toBe(reasonCode);
  });

  it("trims surrounding spaces before it checks and records the reason code", async () => {
    await call("yalidine", { reasonCode: "  manual.check-1  " });
    expect(firstCall(h.testAndCertify)[3]).toBe("manual.check-1");
    expect((auditEntry().metadata as { reasonCode: string }).reasonCode).toBe("manual.check-1");
  });

  it.each([
    ["an empty text (only a MISSING reason gets the default)", ""],
    ["only spaces", "   "],
    ["one character", "a"],
    ["one character between spaces", "  a  "],
    ["eighty-one characters", "a".repeat(81)],
    ["a leading dash", "-abc"],
    ["a leading dot", ".abc"],
    ["a leading underscore", "_abc"],
    ["a space inside", "has space"],
    ["a semicolon", "semi;colon"],
    ["a slash", "slash/x"],
    ["a non-ASCII letter", "caf\u00e9"],
    ["a number", 123],
    ["null", null],
  ])("answers 400 REQUEST_VALIDATION_FAILED and checks nothing for %s", async (_label, reasonCode) => {
    const response = await call("yalidine", { reasonCode });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingRanAfterTheGate();
  });
});

describe("POST /api/delivery/test-connection: the outcome and the audit entry", () => {
  it("answers the check's own result unchanged, and audits a working connection as checked and NOT certified", async () => {
    const response = await call("yalidine");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OK_RESULT);
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    const [context] = firstCall(h.logAudit) as [{ prisma: unknown; shop: unknown }];
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(auditEntry()).toStrictEqual({
      action: "delivery.provider.connection_checked",
      entity: "delivery_provider",
      entityId: "yalidine",
      actor: AUDIT_ACTOR,
      metadata: {
        provider: "yalidine",
        reasonCode: DEFAULT_REASON,
        connectionChecked: true,
        certified: false,
        expiresAt: EXPIRES_AT,
      },
    });
  });

  it("audits a failed check under the failure action, with no expiry, and still answers the result with status 200", async () => {
    h.testAndCertify.mockResolvedValue({ ...FAILED_RESULT });
    const response = await call("maystro", { reasonCode: "after-key-rotation" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(FAILED_RESULT);
    expect(auditEntry()).toStrictEqual({
      action: "delivery.provider.certification_failed",
      entity: "delivery_provider",
      entityId: "maystro",
      actor: AUDIT_ACTOR,
      metadata: {
        provider: "maystro",
        reasonCode: "after-key-rotation",
        connectionChecked: false,
        certified: false,
        expiresAt: null,
      },
    });
  });

  it("records a working connection without an expiry as expiresAt null, not as a missing key", async () => {
    h.testAndCertify.mockResolvedValue({ ok: true, message: "Connection verified." });
    await call("zrexpress");
    const metadata = auditEntry().metadata as Record<string, unknown>;
    expect(metadata).toHaveProperty("expiresAt", null);
    expect(metadata.connectionChecked).toBe(true);
  });

  it.each(PROVIDERS)("names %s in the audit entry as both the entity id and the provider", async (provider) => {
    await call(provider);
    const entry = auditEntry();
    expect(entry.entityId).toBe(provider);
    expect((entry.metadata as { provider: string }).provider).toBe(provider);
  });

  it("never writes certified: true into the audit entry, whatever the outcome", async () => {
    for (const result of [{ ...OK_RESULT }, { ...FAILED_RESULT }]) {
      h.logAudit.mockClear();
      h.testAndCertify.mockResolvedValue(result);
      await call("ecotrack");
      expect((auditEntry().metadata as { certified: boolean }).certified).toBe(false);
    }
  });

  it("does not copy the courier's message into the audit entry", async () => {
    h.testAndCertify.mockResolvedValue({ ok: false, message: `Courier said: bad token ${SECRET_IN_ERROR}` });
    const response = await call("yalidine");
    expect(response.status).toBe(200);
    // The audit entry must exist, otherwise the check below would pass on an empty list.
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain(SECRET_IN_ERROR);
  });

  it("takes the actor and the outcome from the server, not from fields the caller added to the body", async () => {
    h.testAndCertify.mockResolvedValue({ ...FAILED_RESULT });
    await call("yalidine", {
      actor: "person:someone-else",
      certified: true,
      ok: true,
      connectionChecked: true,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(firstCall(h.testAndCertify)[2]).toBe(AUDIT_ACTOR);
    expect(auditEntry()).toStrictEqual({
      action: "delivery.provider.certification_failed",
      entity: "delivery_provider",
      entityId: "yalidine",
      actor: AUDIT_ACTOR,
      metadata: {
        provider: "yalidine",
        reasonCode: DEFAULT_REASON,
        connectionChecked: false,
        certified: false,
        expiresAt: null,
      },
    });
  });
});

describe("POST /api/delivery/test-connection: when the check itself breaks", () => {
  // TEST_CODED_REFUSAL is a made-up code: the real withErrorHandler passes on any SahelFlowError with its own status.
  it("OBSERVED: passes a coded refusal from the check on with its own status, and writes no audit entry", async () => {
    h.testAndCertify.mockRejectedValue(new SahelFlowError("The check refused", "TEST_CODED_REFUSAL", 409));
    const response = await call("yalidine");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TEST_CODED_REFUSAL" });
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it("answers a generic 500 that holds no secret, and writes no audit entry, when the check throws something unexpected", async () => {
    h.testAndCertify.mockRejectedValue(new Error(`courier answered 401 for token ${SECRET_IN_ERROR}`));
    const response = await call("yalidine");
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_IN_ERROR);
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});
