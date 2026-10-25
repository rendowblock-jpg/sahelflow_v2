import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/extraction reads an order out of a pasted message. Only the metric row is pinned here: which model name the
// route hands to recordExtractionMetric. Real code: the route, withErrorHandler, readBoundedText and the request schema.
// Stand-ins: the authorization chain, settings, secret store, database handle, rate limiter, catalog read, extractOrder and
// recordExtractionMetric (the Gemini call and the metrics table are NOT run here).
const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  userKey: vi.fn(),
  allowed: vi.fn(),
  getBool: vi.fn(),
  getSetting: vi.fn(),
  getSecret: vi.fn(),
  rate: vi.fn(),
  catalog: vi.fn(),
  extract: vi.fn(),
  metric: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: h.requireAuth, getCurrentUserKey: h.userKey }));
vi.mock("@/lib/identity/authorization", () => ({ trustedActionAllowed: h.allowed }));
vi.mock("@/lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings")>()),
  getBool: h.getBool,
  getSetting: h.getSetting,
}));
vi.mock("@/lib/secrets", () => ({ getSecret: h.getSecret }));
vi.mock("@/lib/ai/rate-limit", () => ({ checkRateLimit: h.rate }));
vi.mock("@/lib/orders/canonical-named-items", () => ({ listExtractionCatalog: h.catalog }));
vi.mock("@/lib/ai/extraction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/extraction")>()),
  extractOrder: h.extract,
  recordExtractionMetric: h.metric,
}));
vi.mock("@/lib/db", () => ({
  db: { name: "the-prisma-client" },
  shopContext: { shopId: "shop-a", registryRevision: 4, workspaceId: "1".repeat(32) },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/monitoring/sentry", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/redact-pii", () => ({ redactError: (error: unknown) => error }));
vi.mock("@/lib/shops/authority", () => ({ assertProcessShopAuthority: vi.fn() }));
vi.mock("@/lib/license/license-authority", () => ({ requireLicenseEntitlement: vi.fn() }));

import { POST } from "@/app/api/extraction/route";

const RESULT = {
  order: { customerName: "Amine", phone: "0555123456", wilaya: "Alger", items: [{ productName: "Casque", quantity: 1 }] },
  method: "gemini",
  confidence: 0.9,
  isComplete: false,
  missingFields: ["address"],
  raw: { model: "gemini-test" },
};

function post() {
  return POST(
    new NextRequest("http://localhost/api/extraction", {
      method: "POST",
      body: JSON.stringify({ body: "Amine 0555123456 Alger un casque" }),
      headers: { "content-type": "application/json" },
    }),
  );
}

function metricArgs(): Record<string, unknown> {
  const first = h.metric.mock.calls[0];
  if (!first) throw new Error("the metric stand-in was never called");
  return first[1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuth.mockResolvedValue({ shop: { shopId: "shop-a" } });
  h.userKey.mockResolvedValue("session-key-1");
  h.allowed.mockReturnValue(true);
  h.getBool.mockResolvedValue(true);
  h.getSecret.mockResolvedValue("AIza-stored-key-0005");
  h.rate.mockReturnValue({ allowed: true });
  h.catalog.mockResolvedValue([]);
  h.extract.mockResolvedValue(RESULT);
  h.metric.mockResolvedValue(undefined);
});

describe("POST /api/extraction: the metric model", () => {
  it("records the model the result names when Gemini read the message", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(h.metric).toHaveBeenCalledTimes(1);
    expect(metricArgs()).toMatchObject({ method: "gemini", modelVersion: "gemini-test" });
  });

  // An older result, or one without a usable model name, keeps the fixed label rather than a blank.
  it.each([
    ["no raw part", undefined],
    ["a raw part without a model", { source: "text" }],
    ["a blank model", { model: "   " }],
    ["a model that is not text", { model: 3 }],
  ])("keeps the gemini label when the result has %s", async (_label, raw) => {
    h.extract.mockResolvedValue({ ...RESULT, raw });
    await post();
    expect(metricArgs().modelVersion).toBe("gemini");
  });

  it.each([
    ["regex", "regex"],
    ["none", "none"],
  ])("names no model when the method was %s", async (_label, method) => {
    h.extract.mockResolvedValue({ ...RESULT, method });
    await post();
    expect(metricArgs().method).toBe(method);
    expect(metricArgs().modelVersion).toBeUndefined();
  });
});

// The order card says when the AI limit ends, so the retry time must reach the client exactly as the engine gave it.
describe("POST /api/extraction: the AI failure reaches the client", () => {
  it("passes aiFailure and aiRetryAt through unchanged", async () => {
    const aiRetryAt = "2026-10-26T08:00:00.000Z";
    h.extract.mockResolvedValue({ ...RESULT, method: "regex", aiFailure: "GEMINI_QUOTA_EXHAUSTED", aiRetryAt });
    const body = (await (await post()).json()) as { result: Record<string, unknown> };
    expect(body.result.aiFailure).toBe("GEMINI_QUOTA_EXHAUSTED");
    expect(body.result.aiRetryAt).toBe(aiRetryAt);
  });

  it("has no aiRetryAt when the engine gave none", async () => {
    h.extract.mockResolvedValue({ ...RESULT, method: "regex", aiFailure: "GEMINI_KEY_INVALID" });
    const body = (await (await post()).json()) as { result: Record<string, unknown> };
    expect(body.result.aiFailure).toBe("GEMINI_KEY_INVALID");
    expect("aiRetryAt" in body.result).toBe(false);
  });
});

describe("POST /api/extraction: which AI is tried first", () => {
  const orderPassed = () => (h.extract.mock.calls[0][1] as { providerOrder: string[] }).providerOrder;

  it.each([
    ["no stored value", null, ["groq", "gemini"]],
    ["groq-first", "groq-first", ["groq", "gemini"]],
    ["gemini-first", "gemini-first", ["gemini", "groq"]],
    ["a junk value", "banana", ["groq", "gemini"]],
  ])("passes the order for %s", async (_label, stored, expected) => {
    h.getSetting.mockResolvedValue(stored);
    await post();
    expect(h.getSetting.mock.calls[0][1]).toBe("ai_provider_order");
    expect(orderPassed()).toEqual(expected);
  });

  it("falls back to Groq first when the setting cannot be read", async () => {
    h.getSetting.mockRejectedValue(new Error("db down"));
    expect((await post()).status).toBe(200);
    expect(orderPassed()).toEqual(["groq", "gemini"]);
  });
});
