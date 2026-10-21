import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// /api/delivery/credentials stores, reports on and removes the API secrets the seller's courier accounts need.
// What matters: only an authorised person with a recent PIN proof gets in (before the body is even read); the
// secrets are written under the canonical key names; unknown fields are refused BEFORE anything is written; no
// response and no audit entry ever holds a secret value; the retired "noest" name lands in the EcoTrack
// namespace; and every change invalidates the provider's certification and leaves an audit entry.
//
// Real code under test: the route, withErrorHandler (so the status and code of each refusal are the real ones),
// zod, SahelFlowError and the delivery key helpers (deliverySecretKeys, normalizeDeliveryProvider). Stand-ins:
// the identity layer (requireAuth, requireRecentReauthentication, trusted-actor identity), the audit writer, the
// database handle, the certification store, the logger/monitoring/licence hooks withErrorHandler calls, and the
// secret store itself, which is a Map so the tests read back what was really stored and removed.
const h = vi.hoisted(() => ({
  store: new Map<string, string>(),
  requireAuth: vi.fn(),
  requireRecent: vi.fn(),
  logAudit: vi.fn(),
  auditIdentity: vi.fn(),
  invalidate: vi.fn(),
  certStatus: vi.fn(),
  setSecret: vi.fn(),
  deleteSecret: vi.fn(),
  hasSecret: vi.fn(),
}));

vi.mock("@/lib/secrets", () => ({
  setSecret: h.setSecret,
  deleteSecret: h.deleteSecret,
  hasSecret: h.hasSecret,
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: h.requireAuth,
  requireRecentReauthentication: h.requireRecent,
}));
vi.mock("@/lib/audit", () => ({ logAudit: h.logAudit }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActorAuditIdentity: h.auditIdentity }));
vi.mock("@/lib/integrations/delivery/provider-capability", () => ({
  invalidateProviderCertifications: h.invalidate,
  providerCertificationStatus: h.certStatus,
}));
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

import * as route from "@/app/api/delivery/credentials/route";
import { db, shopContext } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

const { GET, POST, DELETE } = route;

const PERMISSION = "delivery.credentials.manage";
const ACTOR = { personId: "5".repeat(32), role: "owner" as const };
// The real trustedActorAuditIdentity returns a string such as person:<id>, and an audit entry's actor is a string.
const AUDIT_ACTOR = `person:${"5".repeat(32)}`;
const SECRET_ID = "SECRET-API-ID-0001";
const SECRET_TOKEN = "SECRET-API-TOKEN-0002";

const FIELDS = {
  yalidine: ["apiId", "apiToken"],
  maystro: ["apiToken"],
  zrexpress: ["apiId", "apiKey", "apiToken", "tenant"],
  ecotrack: ["carrierName", "apiToken", "userGuid", "createOrderUrl", "validateOrderUrl", "trackingsUrl", "feesUrl"],
} as const;

function post(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/delivery/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

function del(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/delivery/credentials${query}`, { method: "DELETE" });
}

function stored(): Record<string, string> {
  return Object.fromEntries(h.store);
}

function refusal(message: string, code: string, status: number): SahelFlowError {
  return new SahelFlowError(message, code, status);
}

function firstOrder(spy: { mock: { invocationCallOrder: number[] } }): number {
  const first = spy.mock.invocationCallOrder[0];
  if (first === undefined) throw new Error("the stand-in was never called");
  return first;
}

function auditEntry(): Record<string, unknown> {
  const call = h.logAudit.mock.calls[0];
  if (!call) throw new Error("no audit entry was written");
  return call[1] as Record<string, unknown>;
}

beforeEach(() => {
  h.store.clear();
  h.requireAuth.mockReset().mockResolvedValue({ actor: ACTOR, shop: { shopId: "default" } });
  h.requireRecent.mockReset().mockResolvedValue(undefined);
  h.logAudit.mockReset().mockResolvedValue(undefined);
  h.auditIdentity.mockReset().mockReturnValue(AUDIT_ACTOR);
  h.invalidate.mockReset().mockResolvedValue(undefined);
  h.certStatus.mockReset().mockResolvedValue({ yalidine: { status: "certified" } });
  h.setSecret.mockReset().mockImplementation(async (_context: unknown, key: string, value: string) => {
    h.store.set(key, value);
  });
  h.deleteSecret.mockReset().mockImplementation(async (_context: unknown, key: string) => {
    h.store.delete(key);
  });
  h.hasSecret.mockReset().mockImplementation(async (_context: unknown, key: string) => h.store.has(key));
});

describe("/api/delivery/credentials: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(post({ provider: "yalidine", credentials: { apiToken: SECRET_TOKEN } }))],
    ["DELETE", () => DELETE(del("?provider=yalidine"))],
  ])("%s demands the delivery-credentials permission and a recent PIN proof", async (_method, call) => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    expect(h.requireAuth).toHaveBeenCalledWith(PERMISSION);
    expect(h.requireRecent).toHaveBeenCalledTimes(1);
    expect(h.requireRecent).toHaveBeenCalledWith();
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(post({ provider: "yalidine", credentials: { apiToken: SECRET_TOKEN } }))],
    ["DELETE", () => DELETE(del("?provider=yalidine"))],
  ])("%s touches no secret, no certification and no audit log for a caller without the permission", async (_method, call) => {
    h.store.set("delivery_yalidine_apiToken", SECRET_TOKEN);
    h.requireAuth.mockRejectedValue(refusal("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(h.requireRecent).not.toHaveBeenCalled();
    expect(h.hasSecret).not.toHaveBeenCalled();
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.deleteSecret).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(stored()).toEqual({ delivery_yalidine_apiToken: SECRET_TOKEN });
  });

  it.each([
    ["GET", () => GET()],
    ["POST", () => POST(post(null, "{not json"))],
    ["DELETE", () => DELETE(del(""))],
  ])("%s refuses without a recent PIN proof before it reads the body or the query", async (_method, call) => {
    h.requireRecent.mockRejectedValue(refusal("Recent PIN verification is required", "REAUTHENTICATION_REQUIRED", 403));
    const response = await call();
    // 403, not 400: the malformed body / missing provider was never looked at.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });
    expect(h.hasSecret).not.toHaveBeenCalled();
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.deleteSecret).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe("GET: which credentials are configured (never the values)", () => {
  it("lists every provider and field as not configured on an empty store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    const expected = Object.fromEntries(
      Object.entries(FIELDS).map(([provider, fields]) => [provider, Object.fromEntries(fields.map((field) => [field, false]))]),
    );
    expect(body.providers).toEqual(expected);
  });

  it("marks a field configured when its canonical key holds a secret, and only that field", async () => {
    h.store.set("delivery_yalidine_apiId", SECRET_ID);
    h.store.set("delivery_zrexpress_tenant", "tenant-123");
    const body = await (await GET()).json();
    expect(body.providers.yalidine).toEqual({ apiId: true, apiToken: false });
    expect(body.providers.zrexpress).toEqual({ apiId: false, apiKey: false, apiToken: false, tenant: true });
    expect(body.providers.maystro).toEqual({ apiToken: false });
  });

  it("never puts a secret value in the response", async () => {
    h.store.set("delivery_yalidine_apiId", SECRET_ID);
    h.store.set("delivery_yalidine_apiToken", SECRET_TOKEN);
    const response = await GET();
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain(SECRET_ID);
    expect(text).not.toContain(SECRET_TOKEN);
    expect(response.headers.get("X-SahelFlow-Shop-Id")).toBe("default");
  });

  it("counts a secret still stored under the old noest name as configured for EcoTrack", async () => {
    h.store.set("delivery_noest_apiToken", SECRET_TOKEN);
    const body = await (await GET()).json();
    expect(body.providers.ecotrack.apiToken).toBe(true);
    expect(body.providers.ecotrack.userGuid).toBe(false);
  });

  it("passes the certification status through", async () => {
    h.certStatus.mockResolvedValue({ ecotrack: { status: "source_reviewed" } });
    const body = await (await GET()).json();
    expect(body.certifications).toEqual({ ecotrack: { status: "source_reviewed" } });
  });
});

describe("POST: saving credentials", () => {
  it("stores each field under its canonical key, invalidates the certification, audits, and answers ok", async () => {
    const response = await POST(post({ provider: "yalidine", credentials: { apiId: SECRET_ID, apiToken: SECRET_TOKEN } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(stored()).toEqual({ delivery_yalidine_apiId: SECRET_ID, delivery_yalidine_apiToken: SECRET_TOKEN });
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(h.invalidate.mock.calls[0]?.[1]).toBe("yalidine");
    expect(h.invalidate.mock.calls[0]?.[2]).toBe("credentials_updated");
  });

  it("writes an audit entry with the field NAMES only, never a value, and says nothing secret in the reply", async () => {
    const response = await POST(post({ provider: "yalidine", credentials: { apiId: SECRET_ID, apiToken: SECRET_TOKEN } }));
    const context = h.logAudit.mock.calls[0]?.[0] as { prisma: unknown; shop: unknown };
    expect(context.prisma).toBe(db);
    expect(context.shop).toBe(shopContext);
    expect(h.auditIdentity).toHaveBeenCalledWith(ACTOR);
    expect(auditEntry()).toEqual({
      action: "delivery.credentials.updated",
      entity: "delivery_credentials",
      entityId: "yalidine",
      actor: AUDIT_ACTOR,
      metadata: { provider: "yalidine", fields: ["apiId", "apiToken"] },
    });
    const everything = JSON.stringify([h.logAudit.mock.calls, await response.json()]);
    expect(everything).not.toContain(SECRET_ID);
    expect(everything).not.toContain(SECRET_TOKEN);
  });

  it("goes in this order: who, PIN proof, store, invalidate certification, audit", async () => {
    await POST(post({ provider: "maystro", credentials: { apiToken: SECRET_TOKEN } }));
    const order = [h.requireAuth, h.requireRecent, h.setSecret, h.invalidate, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(5);
  });

  it("files the retired noest name under EcoTrack and creates no noest secret", async () => {
    const response = await POST(post({ provider: "noest", credentials: { apiToken: SECRET_TOKEN, userGuid: "guid-1" } }));
    expect(response.status).toBe(200);
    expect(stored()).toEqual({ delivery_ecotrack_apiToken: SECRET_TOKEN, delivery_ecotrack_userGuid: "guid-1" });
    expect([...h.store.keys()].some((key) => key.startsWith("delivery_noest_"))).toBe(false);
    expect(h.invalidate.mock.calls[0]?.[1]).toBe("ecotrack");
    expect(auditEntry()).toMatchObject({ entityId: "ecotrack", metadata: { provider: "ecotrack" } });
  });

  it("refuses a field the provider does not have, naming it and not its value, and writes nothing at all", async () => {
    const response = await POST(
      post({ provider: "yalidine", credentials: { apiId: SECRET_ID, bogusField: SECRET_TOKEN } }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ code: "DELIVERY_CREDENTIAL_FIELDS_INVALID" });
    expect(body.error).toContain("bogusField");
    expect(JSON.stringify(body)).not.toContain(SECRET_TOKEN);
    // The valid apiId in the same request must not have been saved either.
    expect(stored()).toEqual({});
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it("refuses a field that belongs to another provider", async () => {
    // apiKey is a ZR Express field, not a Yalidine one.
    const response = await POST(post({ provider: "yalidine", credentials: { apiKey: SECRET_TOKEN } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "DELIVERY_CREDENTIAL_FIELDS_INVALID" });
    expect(stored()).toEqual({});
  });

  it.each([
    ["a retired provider", { provider: "dhd", credentials: { apiToken: SECRET_TOKEN } }],
    ["no provider", { credentials: { apiToken: SECRET_TOKEN } }],
    ["no credentials", { provider: "yalidine" }],
    ["credentials that are a list", { provider: "yalidine", credentials: [SECRET_TOKEN] }],
    ["an empty secret value", { provider: "yalidine", credentials: { apiToken: "" } }],
    ["a secret value that is a number", { provider: "yalidine", credentials: { apiToken: 12345 } }],
  ])("answers 400 REQUEST_VALIDATION_FAILED for %s and writes nothing", async (_label, body) => {
    const response = await POST(post(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expect(h.setSecret).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it("answers 400 INVALID_REQUEST_JSON for a body that is not JSON", async () => {
    const response = await POST(post(null, "{not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST_JSON" });
    expect(h.setSecret).not.toHaveBeenCalled();
  });

  // OBSERVED, not endorsed: the two tests below pin what the route does today in situations where the result
  // is arguably wrong. If the route is changed on purpose, update them.
  // Deliberately NOT tested: a failing audit write. The real logAudit never throws (src/lib/audit.ts: audit is a
  // signal, not a gate), so that situation cannot occur in production; a stand-in that rejects would pin fiction.
  it("OBSERVED: an empty credentials object is accepted, saves nothing, yet still invalidates the certification and audits", async () => {
    const response = await POST(post({ provider: "yalidine", credentials: {} }));
    expect(response.status).toBe(200);
    expect(stored()).toEqual({});
    expect(h.invalidate).toHaveBeenCalledTimes(1);
    expect(auditEntry()).toMatchObject({ metadata: { provider: "yalidine", fields: [] } });
  });

  it("OBSERVED: if the second secret cannot be saved, the first stays saved and the certification is NOT invalidated", async () => {
    h.setSecret.mockImplementation(async (_context: unknown, key: string, value: string) => {
      if (key === "delivery_yalidine_apiToken") throw new Error("secret store unavailable");
      h.store.set(key, value);
    });
    const response = await POST(post({ provider: "yalidine", credentials: { apiId: SECRET_ID, apiToken: SECRET_TOKEN } }));
    expect(response.status).toBe(500);
    expect(stored()).toEqual({ delivery_yalidine_apiId: SECRET_ID });
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe("DELETE: removing a provider's credentials", () => {
  function seedYalidine(): void {
    h.store.set("delivery_yalidine_apiId", SECRET_ID);
    h.store.set("delivery_yalidine_apiToken", SECRET_TOKEN);
    h.store.set("delivery_maystro_apiToken", "maystro-secret");
  }

  it("removes every credential of that provider and leaves the other providers alone", async () => {
    seedYalidine();
    const response = await DELETE(del("?provider=yalidine"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(stored()).toEqual({ delivery_maystro_apiToken: "maystro-secret" });
    expect(h.invalidate.mock.calls[0]?.[1]).toBe("yalidine");
    expect(h.invalidate.mock.calls[0]?.[2]).toBe("credentials_deleted");
  });

  it("audits which keys were really present before, as true/false, with no value", async () => {
    h.store.set("delivery_yalidine_apiId", SECRET_ID);
    const response = await DELETE(del("?provider=yalidine"));
    expect(auditEntry()).toEqual({
      action: "delivery.credentials.deleted",
      entity: "delivery_credentials",
      entityId: "yalidine",
      actor: AUDIT_ACTOR,
      before: { delivery_yalidine_apiId: true, delivery_yalidine_apiToken: false },
      metadata: { provider: "yalidine", keys: ["delivery_yalidine_apiId", "delivery_yalidine_apiToken"] },
    });
    const everything = JSON.stringify([h.logAudit.mock.calls, await response.json()]);
    expect(everything).not.toContain(SECRET_ID);
  });

  it("goes in this order: who, PIN proof, remove, invalidate certification, audit", async () => {
    seedYalidine();
    await DELETE(del("?provider=yalidine"));
    const order = [h.requireAuth, h.requireRecent, h.deleteSecret, h.invalidate, h.logAudit].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(5);
  });

  it("removes EcoTrack's old noest-named secrets together with the canonical ones", async () => {
    h.store.set("delivery_ecotrack_apiToken", SECRET_TOKEN);
    h.store.set("delivery_noest_apiToken", "old-secret");
    h.store.set("delivery_noest_userGuid", "old-guid");
    h.store.set("delivery_yalidine_apiToken", "keep-me");
    const response = await DELETE(del("?provider=ecotrack"));
    expect(response.status).toBe(200);
    expect(stored()).toEqual({ delivery_yalidine_apiToken: "keep-me" });
    const before = auditEntry().before as Record<string, boolean>;
    expect(before.delivery_ecotrack_apiToken).toBe(true);
    expect(before.delivery_noest_apiToken).toBe(true);
    expect(before.delivery_noest_userGuid).toBe(true);
    expect(before.delivery_noest_feesUrl).toBe(false);
  });

  it("treats the retired noest name as EcoTrack", async () => {
    h.store.set("delivery_ecotrack_apiToken", SECRET_TOKEN);
    h.store.set("delivery_noest_apiToken", "old-secret");
    const response = await DELETE(del("?provider=noest"));
    expect(response.status).toBe(200);
    expect(stored()).toEqual({});
    expect(h.invalidate.mock.calls[0]?.[1]).toBe("ecotrack");
    expect(auditEntry()).toMatchObject({ entityId: "ecotrack" });
  });

  it.each([
    ["no provider", ""],
    ["a retired provider", "?provider=dhd"],
    ["an empty provider", "?provider="],
  ])("answers 400 REQUEST_VALIDATION_FAILED for %s and removes nothing", async (_label, query) => {
    seedYalidine();
    const response = await DELETE(del(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expect(h.deleteSecret).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.logAudit).not.toHaveBeenCalled();
    expect(h.store.size).toBe(3);
  });
});
