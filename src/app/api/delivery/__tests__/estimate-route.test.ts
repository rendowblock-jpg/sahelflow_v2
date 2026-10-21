import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/delivery/estimate asks a courier what a parcel would cost to ship. It needs the seller's saved API
// credentials and makes a call to the courier, so the questions that matter are: who may ask (the route demands three
// permissions at once), what is accepted as input, that the courier's fees
// capability is checked BEFORE the credentials are loaded or the courier is called, and that the courier gets only
// the four quote fields, never anything else from the request.
//
// Real code under test: the route, withErrorHandler (so the status and body of each refusal are the real ones),
// zod, SahelFlowError and the Phase 2 permission catalog and role table. Stand-ins: the identity layer (requireAuth),
// the capability check (assertProviderCapability), the courier adapter and its credential loader, the database
// handle and the logger/monitoring hooks withErrorHandler calls (its shop-authority and licence hooks only run when
// NODE_ENV is production, so those two mocks are inert here and the production checks that run before requireAuth
// are NOT tested).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  assertCapability: vi.fn(),
  getAdapter: vi.fn(),
  loadCredentials: vi.fn(),
  estimateCost: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth }));
vi.mock("@/lib/integrations/delivery/provider-capability", () => ({ assertProviderCapability: h.assertCapability }));
vi.mock("@/lib/integrations/delivery", () => ({
  getDeliveryAdapter: h.getAdapter,
  loadDeliveryCredentials: h.loadCredentials,
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

import * as route from "@/app/api/delivery/estimate/route";
import { db, shopContext } from "@/lib/db";
import {
  PHASE2_ACTIONS,
  getPhase2PresetPermissions,
  hasPhase2Permission,
  type Phase2Action,
} from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

const { POST } = route;

const PERMISSIONS = ["deliveries.manage", "customers.contact.read", "orders.financials.read"];
const SECRET_TOKEN = "SECRET-API-TOKEN-0002";
const CREDENTIALS = { apiId: "SECRET-API-ID-0001", apiToken: SECRET_TOKEN };
const ESTIMATE = { provider: "yalidine", cost: 650, estimatedDays: "2-3", available: true };
const PROVIDERS = ["yalidine", "maystro", "zrexpress", "ecotrack"] as const;
const VALID = { provider: "yalidine", wilaya: "16", commune: "Bab El Oued", weight: 2.5, codAmount: 4500 };

function post(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/delivery/estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

function call(overrides: Record<string, unknown> = {}) {
  return POST(post({ ...VALID, ...overrides }));
}

function without(key: keyof typeof VALID) {
  const copy: Record<string, unknown> = { ...VALID };
  delete copy[key];
  return POST(post(copy));
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

function expectNothingWasAsked(): void {
  expect(h.assertCapability).not.toHaveBeenCalled();
  expect(h.getAdapter).not.toHaveBeenCalled();
  expect(h.loadCredentials).not.toHaveBeenCalled();
  expect(h.estimateCost).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.requireAuth.mockReset().mockResolvedValue({ actor: { personId: "5".repeat(32), role: "owner" } });
  h.assertCapability.mockReset().mockResolvedValue(undefined);
  h.estimateCost.mockReset().mockResolvedValue({ ...ESTIMATE });
  h.getAdapter.mockReset().mockReturnValue({ name: "Yalidine", estimateCost: h.estimateCost });
  h.loadCredentials.mockReset().mockResolvedValue({ ...CREDENTIALS });
});

describe("POST /api/delivery/estimate: who may use it", () => {
  it("is never statically rendered or cached by the framework", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("exports POST and no other HTTP verb", () => {
    expect(typeof route.POST).toBe("function");
    for (const verb of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route, verb).not.toHaveProperty(verb);
    }
  });

  // requireAuth is a stand-in here, so it cannot notice a misspelt permission. The real catalog can: a name that is
  // not in it would fail closed for everybody, including the owner.
  it("demands permissions that really exist in the action catalog", () => {
    for (const action of PERMISSIONS) {
      expect(PHASE2_ACTIONS as readonly string[], action).toContain(action);
    }
  });

  it("demands all three permissions in one call, nothing less", async () => {
    await call();
    expect(h.requireAuth).toHaveBeenCalledTimes(1);
    const [actions] = firstCall(h.requireAuth);
    expect([...(actions as string[])].sort()).toEqual([...PERMISSIONS].sort());
  });

  // The argument the route REALLY passed is run through the real role table: a misspelt or dropped name leaves
  // nobody qualifying, and a change to the presets changes the list. (requireAuth itself is a stand-in.)
  it("asks for a set of permissions that only the owner and the manager hold in full", async () => {
    await call();
    const demanded = firstCall(h.requireAuth)[0] as Phase2Action[];
    const holders = (["owner", "manager", "operator", "viewer"] as const).filter((role) =>
      demanded.every((action) => hasPhase2Permission(getPhase2PresetPermissions(role), action)),
    );
    expect(holders).toEqual(["owner", "manager"]);
  });

  it("asks the courier nothing, loads no credentials, for a caller without the permissions", async () => {
    h.requireAuth.mockRejectedValue(new SahelFlowError("Forbidden", "ACTION_FORBIDDEN", 403));
    const response = await POST(post(null, "{not json"));
    // 403, not 400: the malformed body was never looked at.
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACTION_FORBIDDEN" });
    expectNothingWasAsked();
  });
});

describe("POST /api/delivery/estimate: what is accepted", () => {
  it.each(PROVIDERS)("quotes with %s: the capability, the adapter and the credentials are all for that courier", async (provider) => {
    const response = await call({ provider });
    expect(response.status).toBe(200);
    expect(firstCall(h.assertCapability)[1]).toBe(provider);
    expect(firstCall(h.getAdapter)[0]).toBe(provider);
    expect(firstCall(h.loadCredentials)[1]).toBe(provider);
  });

  it("answers 200 with the courier's quote unchanged", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ESTIMATE);
  });

  it("answers a quote the courier could not price (available false, with its error) as 200, unchanged", async () => {
    const unavailable = { provider: "yalidine", cost: 0, available: false, error: "No tariff for this commune" };
    h.estimateCost.mockResolvedValue(unavailable);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(unavailable);
  });

  it("gives the courier exactly the four quote fields and the loaded credentials", async () => {
    await call();
    expect(h.estimateCost).toHaveBeenCalledTimes(1);
    const [params, credentials] = firstCall(h.estimateCost);
    expect(params).toEqual({ wilaya: "16", commune: "Bab El Oued", weight: 2.5, codAmount: 4500 });
    expect(Object.keys(params as object).sort()).toEqual(["codAmount", "commune", "weight", "wilaya"]);
    expect(credentials).toEqual(CREDENTIALS);
  });

  it("quotes without a commune, and the courier then gets none", async () => {
    const response = await without("commune");
    expect(response.status).toBe(200);
    const [params] = firstCall(h.estimateCost);
    expect((params as { commune?: string }).commune).toBeUndefined();
  });

  it("uses the credentials saved for the shop, never credentials or other fields sent in the body", async () => {
    await call({
      credentials: { apiToken: "ATTACKER-TOKEN" },
      apiToken: "ATTACKER-TOKEN",
      url: "https://attacker.example/fees",
      extra: 1,
    });
    expect(h.estimateCost).toHaveBeenCalledTimes(1);
    const [params, credentials] = firstCall(h.estimateCost);
    expect(credentials).toEqual(CREDENTIALS);
    expect(JSON.stringify(h.estimateCost.mock.calls)).not.toContain("ATTACKER");
    expect(Object.keys(params as object).sort()).toEqual(["codAmount", "commune", "weight", "wilaya"]);
  });

  it("loads the credentials and checks the capability with the shop's own context", async () => {
    await call();
    for (const spy of [h.assertCapability, h.loadCredentials]) {
      const [context] = firstCall(spy) as [{ prisma: unknown; shop: unknown }];
      expect(context.prisma).toBe(db);
      expect(context.shop).toBe(shopContext);
    }
  });

  it("never puts the credentials in the reply", async () => {
    const text = JSON.stringify(await (await call()).json());
    expect(text).not.toContain(SECRET_TOKEN);
    expect(text).not.toContain(CREDENTIALS.apiId);
  });

  it.each([
    ["the smallest weight above zero", { weight: 0.001 }],
    ["the heaviest allowed weight, 50", { weight: 50 }],
    ["a zero cash-on-delivery amount", { codAmount: 0 }],
  ])("accepts %s", async (_label, overrides) => {
    const response = await call(overrides);
    expect(response.status).toBe(200);
    expect(h.estimateCost).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an unknown courier", { provider: "dhl" }],
    ["the retired noest name", { provider: "noest" }],
    ["another letter case", { provider: "Yalidine" }],
    ["a number as provider", { provider: 5 }],
    ["an empty wilaya", { wilaya: "" }],
    ["a number as wilaya", { wilaya: 16 }],
    ["null as wilaya", { wilaya: null }],
    ["a number as commune", { commune: 5 }],
    ["null as commune", { commune: null }],
    ["a weight of zero", { weight: 0 }],
    ["a negative weight", { weight: -1 }],
    ["a weight just above 50", { weight: 50.0001 }],
    ["a weight of 51", { weight: 51 }],
    ["a weight sent as text", { weight: "5" }],
    ["a null weight", { weight: null }],
    ["a negative cash-on-delivery amount", { codAmount: -0.01 }],
    ["a cash-on-delivery amount sent as text", { codAmount: "1000" }],
    ["a null cash-on-delivery amount", { codAmount: null }],
  ])("answers 400 REQUEST_VALIDATION_FAILED and asks nothing for %s", async (_label, overrides) => {
    const response = await call(overrides);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasAsked();
  });

  it.each(["provider", "wilaya", "weight", "codAmount"] as const)("answers 400 and asks nothing when %s is missing", async (key) => {
    const response = await without(key);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasAsked();
  });

  // JSON.parse turns 1e999 into Infinity. For the weight this is refused by .max(50) whatever zod does with Infinity;
  // the codAmount case further down is the one that depends on zod 4 refusing Infinity.
  it("answers 400 REQUEST_VALIDATION_FAILED and asks nothing when the weight is a number too large for JSON to hold (1e999)", async () => {
    const response = await POST(post(null, '{"provider":"yalidine","wilaya":"16","weight":1e999,"codAmount":0}'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasAsked();
  });

  it.each([
    ["null", "null"],
    ["a list", "[]"],
    ["a text", '"yalidine"'],
  ])("answers 400 REQUEST_VALIDATION_FAILED and asks nothing when the body is %s", async (_label, raw) => {
    const response = await POST(post(null, raw));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasAsked();
  });

  it("answers 400 INVALID_REQUEST_JSON and asks nothing when the body is not JSON", async () => {
    const response = await POST(post(null, "{not json"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST_JSON" });
    expectNothingWasAsked();
  });

  // OBSERVED, not endorsed: these inputs pass today and reach the courier. Update the test if the schema is
  // tightened on purpose.
  it("OBSERVED: lets a blank (spaces only) wilaya and an empty commune through to the courier", async () => {
    const response = await call({ wilaya: "   ", commune: "" });
    expect(response.status).toBe(200);
    const [params] = firstCall(h.estimateCost);
    expect(params).toEqual({ wilaya: "   ", commune: "", weight: 2.5, codAmount: 4500 });
  });

  // zod 4 refuses Infinity for z.number(); JSON.parse turns 1e999 into Infinity. The amount has no .max, so this is
  // the case that depends on zod itself.
  it("answers 400 REQUEST_VALIDATION_FAILED and asks nothing when the cash-on-delivery amount is a number too large for JSON to hold (1e999)", async () => {
    const response = await POST(post(null, '{"provider":"yalidine","wilaya":"16","weight":1,"codAmount":1e999}'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "REQUEST_VALIDATION_FAILED" });
    expectNothingWasAsked();
  });

  // OBSERVED, not endorsed: the amount is only checked to be a finite number of at least 0. There is no upper limit and
  // no whole-number rule, so a fractional or a huge amount reaches the courier as it is.
  it.each([
    ["a fractional amount", 0.5],
    ["a huge finite amount", 1e308],
  ])("OBSERVED: lets %s through to the courier unchanged", async (_label, codAmount) => {
    const response = await call({ codAmount });
    expect(response.status).toBe(200);
    const [params] = firstCall(h.estimateCost);
    expect((params as { codAmount: number }).codAmount).toBe(codAmount);
  });
});

describe("POST /api/delivery/estimate: the capability gate and the order of the steps", () => {
  it("checks the fees capability of that courier, once", async () => {
    await call({ provider: "maystro" });
    expect(h.assertCapability).toHaveBeenCalledTimes(1);
    const [context, provider, capability] = firstCall(h.assertCapability);
    expect(context).toEqual({ prisma: db, shop: shopContext });
    expect(provider).toBe("maystro");
    expect(capability).toBe("fees");
  });

  it("checks who is asking, then the capability, then loads the credentials, then calls the courier", async () => {
    await call();
    const order = [h.requireAuth, h.assertCapability, h.loadCredentials, h.estimateCost].map(firstOrder);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(4);
  });

  it("neither loads the credentials nor calls the courier when the fees capability is not usable, and passes the refusal on", async () => {
    h.assertCapability.mockRejectedValue(
      new SahelFlowError("yalidine fees are not certified", "PROVIDER_CAPABILITY_UNCERTIFIED", 409),
    );
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_CAPABILITY_UNCERTIFIED" });
    expect(h.loadCredentials).not.toHaveBeenCalled();
    expect(h.estimateCost).not.toHaveBeenCalled();
  });

  it("answers a generic 500 that holds no secret when the courier call throws", async () => {
    h.estimateCost.mockRejectedValue(new Error(`courier answered 401 for token ${SECRET_TOKEN}`));
    const response = await call();
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Internal server error");
    expect(text).not.toContain(SECRET_TOKEN);
  });

  it("passes a coded refusal from the credential loader on with its own status", async () => {
    // TEST_CODED_REFUSAL is a made-up code: the real withErrorHandler passes on any SahelFlowError with its own status.
    h.loadCredentials.mockRejectedValue(new SahelFlowError("The loader refused", "TEST_CODED_REFUSAL", 409));
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TEST_CODED_REFUSAL" });
    expect(h.estimateCost).not.toHaveBeenCalled();
  });
});
