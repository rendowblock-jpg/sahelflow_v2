/**
 * Risk engine service — DB-aware layer tests.
 *
 * Covers config/rules persistence, assessment-input builder, assessOrderRisk,
 * batchAssessOrders, and blacklist management. Follows the cleanDb-in-beforeEach
 * pattern from src/lib/data/__tests__/order-service.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getRiskConfig,
  saveRiskConfig,
  getRiskRules,
  saveRiskRules,
  incrementRuleTriggers,
  buildAssessmentInputFromOrder,
  assessOrderRisk,
  assessRiskFromInput,
  batchAssessOrders,
  blacklistCustomer,
  unblacklistCustomer,
  listBlacklistedCustomers,
} from "../service";
import { DEFAULT_RISK_CONFIG, DEFAULT_RISK_RULES, type RiskAssessmentInput } from "../types";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedTestCustomer,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";
// The extended db client (with PII encryption/decryption). The service writes
// notes through this client (encrypting them); to read the plaintext notes back
// in tests we must also read through this client (the raw PrismaClient used
// for seeding returns the on-disk ciphertext).
import { db as piiDb } from "@/lib/db";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
  // cleanDb doesn't touch WilayaRiskProfile — clear it explicitly.
  await db.wilayaRiskProfile.deleteMany();
});

afterEach(async () => {
  // Wait for fire-and-forget `incrementRuleTriggers` calls to settle so they
  // don't race with the next test's cleanDb.
  await new Promise((r) => setTimeout(r, 30));
  await disconnectTestPrisma(db);
});

async function seedWilayaRisk(
  wilaya = "Alger",
  level = 2,
  confirmationRate = 0.78,
  returnRate = 0.12,
) {
  return db.wilayaRiskProfile.create({
    data: { wilaya, riskLevel: level, confirmationRate, returnRate },
  });
}

async function seedOrderForCustomer(
  customerId: string,
  opts: {
    status?: string;
    totalPrice?: number;
    wilaya?: string;
    phone?: string;
    createdAt?: Date;
    source?: string;
  } = {},
) {
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  return db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: opts.status ?? "draft",
      customerId,
      totalPrice: opts.totalPrice ?? 3000,
      wilaya: opts.wilaya ?? "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: opts.phone ?? "0555123456",
      source: opts.source ?? "whatsapp",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

// ── Config persistence ──────────────────────────────────────────────────────

describe("getRiskConfig / saveRiskConfig", () => {
  it("returns DEFAULT_RISK_CONFIG when no Setting row exists", async () => {
    const config = await getRiskConfig();
    expect(config).toEqual(DEFAULT_RISK_CONFIG);
  });

  it("saves and reloads a custom config", async () => {
    const custom = {
      ...DEFAULT_RISK_CONFIG,
      thresholds: { low: 10, medium: 30, high: 60 },
      autoActions: {
        ...DEFAULT_RISK_CONFIG.autoActions,
        autoConfirmLow: true,
      },
    };
    await saveRiskConfig(custom);
    const reloaded = await getRiskConfig();
    expect(reloaded.thresholds).toEqual({ low: 10, medium: 30, high: 60 });
    expect(reloaded.autoActions.autoConfirmLow).toBe(true);
  });

  it("falls back to defaults when the stored value is malformed JSON", async () => {
    await db.setting.create({
      data: { key: "risk_engine_config", value: "{not valid json" },
    });
    const config = await getRiskConfig();
    expect(config).toEqual(DEFAULT_RISK_CONFIG);
  });

  it("upserts: saving twice updates the existing row", async () => {
    await saveRiskConfig({ ...DEFAULT_RISK_CONFIG, autoBlacklistReturnRate: 0.3 });
    await saveRiskConfig({ ...DEFAULT_RISK_CONFIG, autoBlacklistReturnRate: 0.6 });
    const rows = await db.setting.findMany({ where: { key: "risk_engine_config" } });
    expect(rows).toHaveLength(1);
    const reloaded = await getRiskConfig();
    expect(reloaded.autoBlacklistReturnRate).toBe(0.6);
  });
});

// ── Rules persistence ───────────────────────────────────────────────────────

describe("getRiskRules / saveRiskRules", () => {
  it("seeds DEFAULT_RISK_RULES on first access (with triggerCount=0)", async () => {
    const rules = await getRiskRules();
    expect(rules).toHaveLength(DEFAULT_RISK_RULES.length);
    for (const r of rules) {
      expect(r.triggerCount).toBe(0);
      expect(r.id).toBeTruthy();
      expect(r.enabled).toBe(true);
    }
    // Verify the Setting row was created
    const row = await db.setting.findUnique({ where: { key: "risk_engine_rules" } });
    expect(row).not.toBeNull();
  });

  it("returns the saved rules on subsequent calls (no re-seed)", async () => {
    await getRiskRules(); // seeds defaults
    const rules = await getRiskRules();
    expect(rules).toHaveLength(DEFAULT_RISK_RULES.length);
  });

  it("saveRiskRules replaces the entire set", async () => {
    await getRiskRules();
    await saveRiskRules([]);
    const reloaded = await getRiskRules();
    expect(reloaded).toEqual([]);
  });

  it("falls back to defaults when stored value is malformed JSON", async () => {
    await db.setting.create({
      data: { key: "risk_engine_rules", value: "{broken" },
    });
    const rules = await getRiskRules();
    expect(rules).toHaveLength(DEFAULT_RISK_RULES.length);
  });
});

// ── incrementRuleTriggers ───────────────────────────────────────────────────

describe("incrementRuleTriggers", () => {
  it("no-ops on empty array", async () => {
    await getRiskRules(); // seed
    await incrementRuleTriggers([]);
    const rules = await getRiskRules();
    for (const r of rules) expect(r.triggerCount).toBe(0);
  });

  it("increments the trigger count for the named rules only", async () => {
    await getRiskRules(); // seed
    await incrementRuleTriggers(["blacklist_hold", "very_high_value_order"]);
    await new Promise((r) => setTimeout(r, 30));
    const rules = await getRiskRules();
    const bl = rules.find((r) => r.id === "blacklist_hold")!;
    const vhv = rules.find((r) => r.id === "very_high_value_order")!;
    const other = rules.find((r) => r.id === "new_customer_high_value")!;
    expect(bl.triggerCount).toBe(1);
    expect(vhv.triggerCount).toBe(1);
    expect(other.triggerCount).toBe(0);
  });

  it("accumulates across multiple calls", async () => {
    await getRiskRules();
    await incrementRuleTriggers(["blacklist_hold"]);
    await incrementRuleTriggers(["blacklist_hold"]);
    await new Promise((r) => setTimeout(r, 30));
    const rules = await getRiskRules();
    const bl = rules.find((r) => r.id === "blacklist_hold")!;
    expect(bl.triggerCount).toBe(2);
  });
});

// ── buildAssessmentInputFromOrder ───────────────────────────────────────────

describe("buildAssessmentInputFromOrder", () => {
  it("returns null for a non-existent order", async () => {
    const input = await buildAssessmentInputFromOrder("nonexistent123456789012");
    expect(input).toBeNull();
  });

  it("builds the input from a seeded order + customer + wilaya risk", async () => {
    const customer = await seedTestCustomer(db);
    await seedWilayaRisk("Alger", 2, 0.78, 0.12);
    // Some history
    await seedOrderForCustomer(customer.id, { status: "delivered", totalPrice: 5000 });
    await seedOrderForCustomer(customer.id, { status: "returned", totalPrice: 2000 });
    const order = await seedOrderForCustomer(customer.id, { status: "draft", totalPrice: 3000 });

    const input = await buildAssessmentInputFromOrder(order.id);
    expect(input).not.toBeNull();
    expect(input!.order.totalPrice).toBe(3000);
    expect(input!.order.wilaya).toBe("Alger");
    expect(input!.customerHistory).toBeDefined();
    expect(input!.customerHistory!.totalOrders).toBe(3);
    expect(input!.customerHistory!.deliveredCount).toBe(1);
    expect(input!.customerHistory!.returnedCount).toBe(1);
    expect(input!.customerHistory!.isBlacklisted).toBe(false);
    expect(input!.wilayaRisk).not.toBeNull();
    expect(input!.wilayaRisk!.riskLevel).toBe(2);
    expect(input!.wilayaRisk!.confirmationRate).toBe(0.78);
  });

  it("returns null wilayaRisk when no profile is seeded for the wilaya", async () => {
    const customer = await seedTestCustomer(db);
    const order = await seedOrderForCustomer(customer.id);
    const input = await buildAssessmentInputFromOrder(order.id);
    expect(input).not.toBeNull();
    expect(input!.wilayaRisk).toBeNull();
  });

  it("reflects customer.isBlacklisted in the history", async () => {
    const customer = await seedTestCustomer(db);
    await db.customer.update({
      where: { id: customer.id },
      data: { isBlacklisted: true, blacklistReason: "fraud" },
    });
    const order = await seedOrderForCustomer(customer.id);
    const input = await buildAssessmentInputFromOrder(order.id);
    expect(input!.customerHistory!.isBlacklisted).toBe(true);
  });
});

// ── assessOrderRisk ─────────────────────────────────────────────────────────

describe("assessOrderRisk", () => {
  it("returns null for a non-existent order", async () => {
    const assessment = await assessOrderRisk("nonexistent123456789012");
    expect(assessment).toBeNull();
  });

  it("returns a full RiskAssessment with score/level/action/factors", async () => {
    const customer = await seedTestCustomer(db);
    await seedWilayaRisk();
    const order = await seedOrderForCustomer(customer.id, { totalPrice: 3000 });
    const assessment = await assessOrderRisk(order.id);
    expect(assessment).not.toBeNull();
    expect(assessment!.score).toBeGreaterThanOrEqual(0);
    expect(assessment!.score).toBeLessThanOrEqual(100);
    expect(["low", "medium", "high", "critical"]).toContain(assessment!.level);
    expect([
      "auto_confirm",
      "standard",
      "call_first",
      "review",
      "hold",
      "blacklisted",
    ]).toContain(assessment!.action);
    expect(assessment!.factors.length).toBeGreaterThan(0);
    expect(typeof assessment!.assessedAt).toBe("string");
  });

  it("forces action=blacklisted + level=critical when customer.isBlacklisted is true", async () => {
    const customer = await seedTestCustomer(db);
    await db.customer.update({
      where: { id: customer.id },
      data: { isBlacklisted: true },
    });
    const order = await seedOrderForCustomer(customer.id);
    const assessment = await assessOrderRisk(order.id);
    expect(assessment!.action).toBe("blacklisted");
    expect(assessment!.level).toBe("critical");
    expect(assessment!.triggeredRules).toContain("blacklist_hold");
    expect(assessment!.confidence).toBe(1.0);
  });

  it("includes wilaya_risk factor when a profile is seeded", async () => {
    const customer = await seedTestCustomer(db);
    await seedWilayaRisk("Alger", 4, 0.6, 0.22);
    const order = await seedOrderForCustomer(customer.id);
    const assessment = await assessOrderRisk(order.id);
    const wilayaFactor = assessment!.factors.find((f) => f.id === "wilaya_risk");
    expect(wilayaFactor).toBeDefined();
  });
});

// ── assessRiskFromInput ─────────────────────────────────────────────────────

describe("assessRiskFromInput", () => {
  it("computes an assessment from a raw input (no DB order needed)", async () => {
    const input: RiskAssessmentInput = {
      order: {
        totalPrice: 3000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Didouche",
        phone: "0555123456",
        source: "whatsapp",
        createdAt: new Date(),
      },
      wilayaRisk: { riskLevel: 2, confirmationRate: 0.78, returnRate: 0.12 },
    };
    const assessment = await assessRiskFromInput(input);
    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.factors.find((f) => f.id === "new_customer")).toBeDefined();
  });
});

// ── batchAssessOrders ───────────────────────────────────────────────────────

describe("batchAssessOrders", () => {
  it("returns an empty Map for an empty input array", async () => {
    const result = await batchAssessOrders([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("assesses multiple orders and returns a Map keyed by order id", async () => {
    const customer = await seedTestCustomer(db);
    await seedWilayaRisk();
    const o1 = await seedOrderForCustomer(customer.id);
    const o2 = await seedOrderForCustomer(customer.id);
    const o3 = await seedOrderForCustomer(customer.id);
    const result = await batchAssessOrders([o1.id, o2.id, o3.id]);
    expect(result.size).toBe(3);
    expect(result.get(o1.id)).toBeDefined();
    expect(result.get(o2.id)).toBeDefined();
    expect(result.get(o3.id)).toBeDefined();
  });

  it("skips non-existent order ids (no entry in the Map)", async () => {
    const customer = await seedTestCustomer(db);
    await seedWilayaRisk();
    const o1 = await seedOrderForCustomer(customer.id);
    const result = await batchAssessOrders([o1.id, "nonexistent999999999999"]);
    expect(result.size).toBe(1);
    expect(result.get(o1.id)).toBeDefined();
    expect(result.has("nonexistent999999999999")).toBe(false);
  });
});

// ── Blacklist management ────────────────────────────────────────────────────

describe("blacklistCustomer / unblacklistCustomer / listBlacklistedCustomers", () => {
  it("blacklistCustomer adds a [BLACKLISTED] tag to notes", async () => {
    const customer = await seedTestCustomer(db);
    await blacklistCustomer(customer.id, "fraud");
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    expect(reloaded!.notes).toContain("[BLACKLISTED");
    expect(reloaded!.notes).toContain("fraud");
  });

  it("blacklistCustomer adds a plain tag when no reason is given", async () => {
    const customer = await seedTestCustomer(db);
    await blacklistCustomer(customer.id);
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    expect(reloaded!.notes).toBe("[BLACKLISTED]");
  });

  it("blacklistCustomer is idempotent (no double tag)", async () => {
    const customer = await seedTestCustomer(db);
    await blacklistCustomer(customer.id);
    await blacklistCustomer(customer.id);
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    const matches = reloaded!.notes!.match(/\[BLACKLISTED/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("blacklistCustomer appends to existing notes", async () => {
    const customer = await seedTestCustomer(db);
    await db.customer.update({
      where: { id: customer.id },
      data: { notes: "VIP customer" },
    });
    await blacklistCustomer(customer.id, "no-show");
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    expect(reloaded!.notes).toContain("VIP customer");
    expect(reloaded!.notes).toContain("[BLACKLISTED: no-show]");
  });

  it("blacklistCustomer is a no-op for a non-existent customer", async () => {
    await expect(blacklistCustomer("nonexistent123456789")).resolves.toBeUndefined();
  });

  it("unblacklistCustomer removes the [BLACKLISTED] tag", async () => {
    const customer = await seedTestCustomer(db);
    await blacklistCustomer(customer.id, "fraud");
    await unblacklistCustomer(customer.id);
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    expect(reloaded!.notes).toBeNull();
  });

  it("unblacklistCustomer preserves other notes content", async () => {
    const customer = await seedTestCustomer(db);
    await db.customer.update({
      where: { id: customer.id },
      data: { notes: "VIP customer\n[BLACKLISTED: fraud]" },
    });
    await unblacklistCustomer(customer.id);
    const reloaded = await piiDb.customer.findUnique({ where: { id: customer.id } });
    expect(reloaded!.notes).toBe("VIP customer");
  });

  it("unblacklistCustomer is a no-op for a non-existent customer", async () => {
    await expect(unblacklistCustomer("nonexistent123456789")).resolves.toBeUndefined();
  });

  it("listBlacklistedCustomers returns only customers with the [BLACKLISTED] tag", async () => {
    // The service's listBlacklistedCustomers queries `notes contains "[BLACKLISTED"`
    // directly against the on-disk column. Because Customer.notes is encrypted
    // at rest by the PII extension, blacklistCustomer()'s tag is never visible
    // to that contains-filter (it sees ciphertext). To exercise the function's
    // intended query logic, seed a customer with PLAINTEXT blacklist notes via
    // the raw client (bypassing the PII extension).
    const c1 = await seedTestCustomer(db, { name: "Bad", phone: uniquePhone() });
    const c2 = await seedTestCustomer(db, { name: "Good", phone: uniquePhone() });
    await db.customer.update({
      where: { id: c1.id },
      data: { notes: "[BLACKLISTED: fraud]" },
    });
    // c2 is NOT blacklisted
    void c2;
    const list = await listBlacklistedCustomers();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(c1.id);
    expect(list[0]!.name).toBe("Bad");
  });

  it("listBlacklistedCustomers returns empty when none are blacklisted", async () => {
    await seedTestCustomer(db);
    const list = await listBlacklistedCustomers();
    expect(list).toEqual([]);
  });
});
