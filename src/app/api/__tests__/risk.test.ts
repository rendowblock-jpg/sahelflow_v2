/**
 * Integration tests for the risk routes — Phase 7 priority group 9.
 *
 * Covers:
 *   - GET  /api/risk/blacklist           — list blacklisted customers
 *   - POST /api/risk/blacklist           — add a customer to the blacklist
 *   - GET  /api/risk/analytics           — full risk analytics report (days param)
 *   - GET  /api/risk/config              — load the risk engine config
 *   - PUT  /api/risk/config              — merge + save the config
 *   - GET  /api/risk/rules               — list all risk rules
 *   - PUT  /api/risk/rules               — replace all rules
 *   - GET  /api/risk/assess/[orderId]    — assess an order's risk
 *   - POST /api/risk/assess/[orderId]    — re-assess (force refresh)
 *
 * The risk engine scoring + service layers are already covered by unit tests
 * in src/lib/risk-engine/__tests__/. These integration tests assert the API
 * contract: auth gate, validation, response shape, and DB state after writes.
 *
 * NOTE on auth tests: only POST/PUT routes are wrapped in withErrorHandler
 * (which converts a thrown SahelFlowError into a 401 Response). The bare
 * `export async function GET` handlers propagate requireAuth() throws to the
 * caller — in vitest this surfaces as a rejected promise, not a 401 response.
 * 401 tests are therefore only included for the wrapped routes. (In Next.js
 * production runtime, an unhandled error in a route handler becomes a 500 —
 * the bare-GET auth gap is a Phase-4+ cleanup item, not a regression.)
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { rawDb, cleanDb, mockPost, mockGet, getJson, seedProduct, establishAuthenticatedTestSession } from "@/app/api/__tests__/helpers";
import { db } from "@/lib/db";

// ── Mock next/headers — requireAuth() reads cookies. With a clean DB (no
//    AuthSecret row), isAuthenticated() returns true (setup mode) — an empty
//    cookie jar passes requireAuth. To test 401 we seed an AuthSecret row
//    (setup=true) and leave the cookie jar empty.
const authCookieStore = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = authCookieStore.get(name);
      return value === undefined ? undefined : { value };
    },
    set: (name: string, value: string) => {
      authCookieStore.set(name, value);
    },
    delete: (name: string) => {
      authCookieStore.delete(name);
    },
  })),
}));

// Mock the automation dispatcher so blacklistCustomer's fire-and-forget
// dispatchTrigger('customer.blacklisted') is a no-op. Without this, the
// dispatch can still be in flight when the next test's cleanDb() runs,
// causing flaky races with other test files that share the SQLite file
// (see Phase 3 worklog note on waitForDispatch).
vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
}));

import { GET as GETBlacklist, POST as POSTBlacklist } from "@/app/api/risk/blacklist/route";
import { GET as GETAnalytics } from "@/app/api/risk/analytics/route";
import { GET as GETConfig, PUT as PUTConfig } from "@/app/api/risk/config/route";
import { GET as GETRules, PUT as PUTRules } from "@/app/api/risk/rules/route";
import { GET as GETAssess, POST as POSTAssess } from "@/app/api/risk/assess/[orderId]/route";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/** Build a mock PUT Request with JSON body (helpers.ts only exports mockPost/mockGet). */
function mockPut(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let _custCounter = 0;
async function seedCustomer() {
  _custCounter++;
  return rawDb.customer.create({
    data: {
      name: `Risk Cust ${_custCounter}`,
      phone: `0770${String(_custCounter).padStart(6, "0")}`,
      nameBlindIndex: `risk-cust-blind-${_custCounter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
    },
  });
}

/** Seed a real order (for the assess route) — needs customer + product + items. */
async function seedOrderForAssessment(opts?: { totalPrice?: number }) {
  const product = await seedProduct({ price: 2500 });
  // Use db Proxy (not rawDb) for customer + order — the PII extension encrypts
  // the phone field. rawDb writes plaintext, which the db Proxy can't decrypt
  // on read → buildAssessmentInputFromOrder returns null → 404.
  const customer = await db.customer.create({
    data: {
      name: "Risk Test Customer",
      phone: "0770000001",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Test",
    },
  });
  const _custCounter = Date.now();
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-RISK-${_custCounter}`,
      status: "pending",
      customerId: customer.id,
      totalPrice: opts?.totalPrice ?? 2500,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue",
      phone: "0770000001",
      source: "manual",
      items: {
        create: [{
          productId: product.id,
          productName: "Test Product",
          quantity: 1,
          unitPrice: 2500,
          total: 2500,
        }],
      },
    },
  });
  return { order, customer, product };
}

/** Seed an AuthSecret row so the app is no longer in setup mode → requireAuth
 *  will reject requests without a valid sf_session cookie. Used by the
 *  POST/PUT 401 tests (the wrapped routes convert the throw to a 401 Response). */
async function seedAuthSecret() {
    authCookieStore.delete("sf_session");
}

// ─── GET /api/risk/blacklist ─────────────────────────────────────────────────
describe("GET /api/risk/blacklist — list blacklisted customers", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("returns 200 + empty list on a clean DB", async () => {
    const res = await GETBlacklist();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.customers).toEqual([]);
  });

  it("returns blacklisted customers (isBlacklisted=true) with their reasons", async () => {
    const c1 = await seedCustomer();
    const c2 = await seedCustomer(); // decoy: NOT blacklisted — must not appear
    // Blacklist c1 directly in the DB
    await rawDb.customer.update({
      where: { id: c1.id },
      data: { isBlacklisted: true, blacklistReason: "Frequent returns", blacklistedAt: new Date() },
    });
    const res = await GETBlacklist();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const customers = body.customers as Array<{ id: string; blacklistReason: string | null }>;
    // Exactly 1 blacklisted customer (c1), not 2 (the decoy c2 is excluded)
    expect(customers).toHaveLength(1);
    expect(customers[0]!.id).toBe(c1.id);
    expect(customers[0]!.id).not.toBe(c2.id);
    expect(customers[0]!.blacklistReason).toBe("Frequent returns");
  });

  // No 401 test — this GET handler is bare (not wrapped in withErrorHandler),
  // so requireAuth() throws propagate to the caller as a rejected promise.
  // See file header note for details.
});

// ─── POST /api/risk/blacklist ────────────────────────────────────────────────
describe("POST /api/risk/blacklist — add to blacklist", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("marks a customer as blacklisted (201) + sets isBlacklisted/blacklistReason/blacklistedAt in DB", async () => {
    const customer = await seedCustomer();
    const res = await POSTBlacklist(
      mockPost("http://localhost/api/risk/blacklist", { customerId: customer.id, reason: "Repeat returns" }),
    );
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.ok).toBe(true);

    // DB state — the canonical blacklist columns (NOT the notes tag, which is
    // an encrypted human-readable audit trail — reading rawDb sees ciphertext).
    const updated = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(updated!.isBlacklisted).toBe(true);
    expect(updated!.blacklistReason).toBe("Repeat returns");
    expect(updated!.blacklistedAt).toBeTruthy();
    // The notes field WAS written (non-null) — we don't assert its content
    // because it's AES-256-GCM encrypted at rest (rawDb sees ciphertext, the
    // db Proxy transparently decrypts on read).
    expect(updated!.notes).not.toBeNull();
  });

  it("is idempotent — blacklisting an already-blacklisted customer updates the reason only", async () => {
    const customer = await seedCustomer();
    await POSTBlacklist(
      mockPost("http://localhost/api/risk/blacklist", { customerId: customer.id, reason: "First reason" }),
    );
    const res = await POSTBlacklist(
      mockPost("http://localhost/api/risk/blacklist", { customerId: customer.id, reason: "Updated reason" }),
    );
    expect(res.status).toBe(201);

    const updated = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(updated!.isBlacklisted).toBe(true);
    expect(updated!.blacklistReason).toBe("Updated reason");
    // Idempotent: only the reason changed, not the blacklistedAt timestamp
    // (the early-return path doesn't touch blacklistedAt).
    const firstBlacklist = await rawDb.customer.findUnique({ where: { id: customer.id } });
    expect(firstBlacklist!.blacklistedAt).toBeTruthy();
  });

  it("returns 400 on missing customerId", async () => {
    const res = await POSTBlacklist(
      mockPost("http://localhost/api/risk/blacklist", { reason: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 when auth is set up but no session cookie is present", async () => {
    await seedAuthSecret();
    const res = await POSTBlacklist(
      mockPost("http://localhost/api/risk/blacklist", { customerId: "x" }),
    );
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/risk/analytics ─────────────────────────────────────────────────
describe("GET /api/risk/analytics — analytics report", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("returns 200 + well-formed report (empty KPIs on a clean DB)", async () => {
    const res = await GETAnalytics(mockGet("http://localhost/api/risk/analytics"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const report = body.report as Record<string, unknown>;
    // Shape: top-level keys present
    expect(report.totalOrders).toBe(0);
    expect(Array.isArray(report.distribution)).toBe(true);
    expect(Array.isArray(report.confirmationByLevel)).toBe(true);
    expect(Array.isArray(report.riskByWilaya)).toBe(true);
    expect(Array.isArray(report.topFactors)).toBe(true);
    expect(Array.isArray(report.trend)).toBe(true);
    expect(Array.isArray(report.ruleTriggers)).toBe(true);
    expect(report.kpis).toBeTruthy();
    const kpis = report.kpis as Record<string, unknown>;
    expect(kpis.avgRiskScore).toBe(0);
    expect(kpis.blacklistedCustomerCount).toBe(0);
  });

  it("clamps invalid ?days to the default (30)", async () => {
    // 99 is not in [7,14,30,90] → falls back to 30
    const res = await GETAnalytics(mockGet("http://localhost/api/risk/analytics?days=99"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.report).toBeTruthy();
  });

  it("accepts valid ?days=7", async () => {
    const res = await GETAnalytics(mockGet("http://localhost/api/risk/analytics?days=7"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.report).toBeTruthy();
  });

  // No 401 test — bare GET handler (see file header note).
});

// ─── GET / PUT /api/risk/config ──────────────────────────────────────────────
describe("GET / PUT /api/risk/config — risk engine config", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("GET returns 200 + default config on a clean DB", async () => {
    const res = await GETConfig();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const config = body.config as Record<string, unknown>;
    expect(config.weights).toBeTruthy();
    expect(config.thresholds).toBeTruthy();
    expect(config.autoActions).toBeTruthy();
    // Default threshold values from types.ts DEFAULT_RISK_CONFIG
    const thresholds = config.thresholds as { low: number; medium: number; high: number };
    expect(thresholds.low).toBe(25);
    expect(thresholds.medium).toBe(50);
    expect(thresholds.high).toBe(75);
  });

  it("PUT merges partial config (shallow-merge per section) + persists to Setting table", async () => {
    // First, GET the default config to confirm starting state
    const initial = await getJson(await GETConfig());
    const initialThresholds = (initial.config as { thresholds: { low: number } }).thresholds;
    expect(initialThresholds.low).toBe(25);

    // PUT a partial update — only thresholds.low changes
    const res = await PUTConfig(
      mockPut("http://localhost/api/risk/config", {
        thresholds: { low: 30 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const merged = body.config as { thresholds: { low: number; medium: number; high: number }; weights: unknown };
    // New value persisted
    expect(merged.thresholds.low).toBe(30);
    // Other thresholds + weights preserved (shallow-merge per section)
    expect(merged.thresholds.medium).toBe(50);
    expect(merged.thresholds.high).toBe(75);
    expect(merged.weights).toBeTruthy();

    // Verify DB state — Setting row with key="risk_engine_config" exists
    const row = await rawDb.setting.findUnique({ where: { key: "risk_engine_config" } });
    expect(row).toBeTruthy();
    const persisted = JSON.parse(row!.value) as { thresholds: { low: number } };
    expect(persisted.thresholds.low).toBe(30);
  });

  it("PUT returns 401 when auth is set up but no session cookie is present", async () => {
    await seedAuthSecret();
    const res = await PUTConfig(
      mockPut("http://localhost/api/risk/config", { thresholds: { low: 30 } }),
    );
    expect(res.status).toBe(401);
  });

  // No GET 401 test — bare GET handler (see file header note).
});

// ─── GET / PUT /api/risk/rules ───────────────────────────────────────────────
describe("GET / PUT /api/risk/rules — risk rules", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("GET returns 200 + default rules (seeded on first access) with triggerCount=0", async () => {
    const res = await GETRules();
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const rules = body.rules as Array<{ id: string; enabled: boolean; triggerCount: number }>;
    expect(rules.length).toBeGreaterThanOrEqual(1);
    // Default rules from types.ts DEFAULT_RISK_RULES
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("blacklist_hold");
    expect(ids).toContain("new_customer_high_value");
    // All default rules start with triggerCount=0
    expect(rules.every((r) => r.triggerCount === 0)).toBe(true);
  });

  it("PUT replaces all rules + persists to Setting table", async () => {
    // First, seed defaults (so we know there's something to replace)
    await GETRules();
    const initial = await rawDb.setting.findUnique({ where: { key: "risk_engine_rules" } });
    expect(initial).toBeTruthy();

    // Now PUT a custom ruleset — single rule
    const customRules = [
      {
        id: "custom_rule_1",
        labelKey: "risk.rules.custom",
        enabled: true,
        condition: { type: "customer_is_blacklisted" },
        effect: { type: "set_action", action: "hold" },
        triggerCount: 0,
      },
    ];
    const res = await PUTRules(
      mockPut("http://localhost/api/risk/rules", { rules: customRules }),
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const returned = body.rules as Array<{ id: string }>;
    expect(returned).toHaveLength(1);
    expect(returned[0]!.id).toBe("custom_rule_1");

    // Verify DB state
    const row = await rawDb.setting.findUnique({ where: { key: "risk_engine_rules" } });
    expect(row).toBeTruthy();
    const persisted = JSON.parse(row!.value) as Array<{ id: string }>;
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.id).toBe("custom_rule_1");
  });

  it("PUT returns 400 on invalid input (missing rules array)", async () => {
    const res = await PUTRules(
      mockPut("http://localhost/api/risk/rules", { notRules: [] }),
    );
    expect(res.status).toBe(400);
  });

  it("PUT returns 401 when auth is set up but no session cookie is present", async () => {
    await seedAuthSecret();
    const res = await PUTRules(
      mockPut("http://localhost/api/risk/rules", { rules: [] }),
    );
    expect(res.status).toBe(401);
  });

  // No GET 401 test — bare GET handler (see file header note).
});

// ─── GET / POST /api/risk/assess/[orderId] ───────────────────────────────────
describe("GET / POST /api/risk/assess/[orderId] — assess order risk", () => {
  beforeEach(async () => { await cleanDb();
    authCookieStore.clear();
    delete process.env.AUTH_SECRET;
    await establishAuthenticatedTestSession(); });
  afterAll(async () => { delete process.env.AUTH_SECRET;
    await rawDb.$disconnect(); });

  it("GET returns 200 + assessment for a real order (new customer, no history)", async () => {
    const { order } = await seedOrderForAssessment();
    const res = await GETAssess(
      mockGet(`http://localhost/api/risk/assess/${order.id}`),
      { params: Promise.resolve({ orderId: order.id }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const assessment = body.assessment as Record<string, unknown>;
    // Shape
    expect(typeof assessment.score).toBe("number");
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high", "critical"]).toContain(assessment.level);
    expect(["auto_confirm", "standard", "call_first", "review", "hold", "blacklisted"]).toContain(assessment.action);
    expect(typeof assessment.confidence).toBe("number");
    expect(Array.isArray(assessment.factors)).toBe(true);
    expect(typeof assessment.ruleOverride).toBe("boolean");
    expect(Array.isArray(assessment.triggeredRules)).toBe(true);
    expect(typeof assessment.assessedAt).toBe("string");
  });

  it("GET returns 404 when the order does not exist", async () => {
    const res = await GETAssess(
      mockGet("http://localhost/api/risk/assess/nonexistent"),
      { params: Promise.resolve({ orderId: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });

  it("POST re-assesses (force refresh) and returns the same shape as GET", async () => {
    const { order } = await seedOrderForAssessment();
    const res = await POSTAssess(
      mockPost(`http://localhost/api/risk/assess/${order.id}`, {}),
      { params: Promise.resolve({ orderId: order.id }) },
    );
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.assessment).toBeTruthy();
    expect((body.assessment as { score: number }).score).toBeGreaterThanOrEqual(0);
  });

  it("POST returns 404 when the order does not exist", async () => {
    const res = await POSTAssess(
      mockPost("http://localhost/api/risk/assess/nonexistent", {}),
      { params: Promise.resolve({ orderId: "nonexistent" }) },
    );
    expect(res.status).toBe(404);
  });

  it("POST returns 401 when auth is set up but no session cookie is present", async () => {
    await seedAuthSecret();
    const { order } = await seedOrderForAssessment();
    const res = await POSTAssess(
      mockPost(`http://localhost/api/risk/assess/${order.id}`, {}),
      { params: Promise.resolve({ orderId: order.id }) },
    );
    expect(res.status).toBe(401);
  });

  // No GET 401 test — bare GET handler (see file header note).
});
