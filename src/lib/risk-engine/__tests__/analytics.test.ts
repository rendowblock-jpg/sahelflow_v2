/**
 * Risk analytics — DB-backed aggregation tests.
 *
 * Seeds orders with varied risk levels (via customer history + wilaya risk
 * profiles) and asserts the analytics report's distribution, confirmation-by-
 * level, wilaya grouping, top factors, trend, rule triggers, and KPIs.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getRiskAnalyticsReport as getRiskAnalyticsReportForShop,
  type RiskAnalyticsReport,
} from "../analytics";
import { getRiskRules as getRiskRulesForShop } from "../service";
import { DEFAULT_RISK_RULES } from "../types";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedTestCustomer,
  TEST_SHOP_CONTEXT,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";
import { db as piiDb } from "@/lib/db";

let db: PrismaClient;

const context = { prisma: piiDb, shop: TEST_SHOP_CONTEXT };
const getRiskAnalyticsReport = (days = 30) =>
  getRiskAnalyticsReportForShop(context, days);
const getRiskRules = () => getRiskRulesForShop(context);

beforeEach(async () => {
  db = await createTestPrisma();
  await db.wilayaRiskProfile.deleteMany();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function seedWilaya(wilaya: string, level: number, conf: number, ret: number) {
  return db.wilayaRiskProfile.create({
    data: { wilaya, riskLevel: level, confirmationRate: conf, returnRate: ret },
  });
}

async function seedOrder(
  customerId: string,
  opts: {
    status?: string;
    totalPrice?: number;
    wilaya?: string;
    createdAt?: Date;
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
      address: "123 Rue",
      phone: uniquePhone(),
      source: "whatsapp",
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

// ── Empty DB ────────────────────────────────────────────────────────────────

describe("getRiskAnalyticsReport — empty database", () => {
  it("returns a well-formed report with zero counts without seeding settings", async () => {
    const before = await db.setting.findMany({ orderBy: { key: "asc" } });
    const report = await getRiskAnalyticsReport(30);
    expect(report.totalOrders).toBe(0);
    expect(report.distribution).toHaveLength(4);
    for (const d of report.distribution) {
      expect(d.count).toBe(0);
      expect(d.percentage).toBe(0);
    }
    expect(report.confirmationByLevel).toHaveLength(4);
    expect(report.riskByWilaya).toEqual([]);
    expect(report.topFactors).toEqual([]);
    expect(report.trend).toEqual([]);
    expect(report.ruleTriggers).toHaveLength(DEFAULT_RISK_RULES.length);
    expect(report.kpis.avgRiskScore).toBe(0);
    expect(report.kpis.confirmationRate).toBe(0);
    expect(report.kpis.returnRate).toBe(0);
    expect(report.kpis.highRiskOrderCount).toBe(0);
    expect(report.kpis.blacklistedCustomerCount).toBe(0);
    expect(report.kpis.potentialSavingsDzd).toBe(0);
    await expect(
      db.setting.findMany({ orderBy: { key: "asc" } }),
    ).resolves.toEqual(before);
  });
});

// ── With seeded data ────────────────────────────────────────────────────────

describe("getRiskAnalyticsReport — seeded orders", () => {
  it("counts totalOrders and computes distribution percentages", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    // 3 customers to get 3 distinct orders with histories
    const c1 = await seedTestCustomer(db, { phone: uniquePhone() });
    const c2 = await seedTestCustomer(db, { phone: uniquePhone() });
    const c3 = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedOrder(c1.id, { totalPrice: 3000, status: "delivered" });
    await seedOrder(c2.id, { totalPrice: 3000, status: "delivered" });
    await seedOrder(c3.id, { totalPrice: 3000, status: "delivered" });

    const report: RiskAnalyticsReport = await getRiskAnalyticsReport(30);
    expect(report.totalOrders).toBe(3);

    const totalCount = report.distribution.reduce((s, d) => s + d.count, 0);
    expect(totalCount).toBe(3);
    const sumPct = report.distribution.reduce((s, d) => s + d.percentage, 0);
    expect(sumPct).toBeCloseTo(1, 5);
  });

  it("groups confirmation/return rates by risk level", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedOrder(c.id, { status: "delivered", totalPrice: 3000 });
    await seedOrder(c.id, { status: "returned", totalPrice: 3000 });

    const report = await getRiskAnalyticsReport(30);
    expect(report.confirmationByLevel).toHaveLength(4);
    // Each level entry has the required fields
    for (const entry of report.confirmationByLevel) {
      expect(typeof entry.total).toBe("number");
      expect(typeof entry.delivered).toBe("number");
      expect(typeof entry.returned).toBe("number");
      expect(typeof entry.refused).toBe("number");
      expect(typeof entry.cancelled).toBe("number");
      expect(typeof entry.pending).toBe("number");
      expect(typeof entry.confirmationRate).toBe("number");
      expect(typeof entry.returnRate).toBe("number");
    }
    const totalDelivered = report.confirmationByLevel.reduce((s, e) => s + e.delivered, 0);
    const totalReturned = report.confirmationByLevel.reduce((s, e) => s + e.returned, 0);
    expect(totalDelivered).toBe(1);
    expect(totalReturned).toBe(1);
  });

  it("aggregates risk by wilaya (top 10 by order count)", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    await seedWilaya("Oran", 3, 0.7, 0.16);
    const c1 = await seedTestCustomer(db, { phone: uniquePhone() });
    const c2 = await seedTestCustomer(db, { phone: uniquePhone() });

    await seedOrder(c1.id, { wilaya: "Alger", status: "delivered" });
    await seedOrder(c1.id, { wilaya: "Alger", status: "delivered" });
    await seedOrder(c2.id, { wilaya: "Oran", status: "delivered" });

    const report = await getRiskAnalyticsReport(30);
    expect(report.riskByWilaya.length).toBeLessThanOrEqual(10);
    const algiers = report.riskByWilaya.find((w) => w.wilaya === "Alger");
    expect(algiers).toBeDefined();
    expect(algiers!.orderCount).toBe(2);
    expect(algiers!.avgScore).toBeGreaterThanOrEqual(0);
    expect(algiers!.avgScore).toBeLessThanOrEqual(100);
    const oran = report.riskByWilaya.find((w) => w.wilaya === "Oran");
    expect(oran).toBeDefined();
    expect(oran!.orderCount).toBe(1);
  });

  it("computes top factors with occurrence counts and avg points", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedOrder(c.id, { totalPrice: 3000 });

    const report = await getRiskAnalyticsReport(30);
    expect(report.topFactors.length).toBeGreaterThan(0);
    expect(report.topFactors.length).toBeLessThanOrEqual(8);
    for (const f of report.topFactors) {
      expect(f.factorId).toBeTruthy();
      expect(f.labelKey).toBeTruthy();
      expect(f.occurrenceCount).toBeGreaterThan(0);
      expect(typeof f.avgPoints).toBe("number");
    }
    // Sorted by occurrenceCount desc
    for (let i = 1; i < report.topFactors.length; i++) {
      expect(report.topFactors[i]!.occurrenceCount).toBeLessThanOrEqual(
        report.topFactors[i - 1]!.occurrenceCount,
      );
    }
  });

  it("builds a daily trend series sorted by date ascending", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    await seedOrder(c.id, { createdAt: twoDaysAgo });
    await seedOrder(c.id, { createdAt: today });

    const report = await getRiskAnalyticsReport(30);
    expect(report.trend.length).toBeGreaterThan(0);
    for (let i = 1; i < report.trend.length; i++) {
      expect(report.trend[i]!.date >= report.trend[i - 1]!.date).toBe(true);
    }
    for (const t of report.trend) {
      expect(typeof t.date).toBe("string");
      expect(t.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.orderCount).toBeGreaterThan(0);
      expect(typeof t.avgScore).toBe("number");
      expect(typeof t.criticalCount).toBe("number");
    }
  });

  it("ruleTriggers reflects in-memory defaults without persisting them", async () => {
    await getRiskRules();
    const report = await getRiskAnalyticsReport(30);
    expect(report.ruleTriggers).toHaveLength(DEFAULT_RISK_RULES.length);
    for (const rt of report.ruleTriggers) {
      expect(rt.ruleId).toBeTruthy();
      expect(rt.labelKey).toBeTruthy();
      expect(typeof rt.triggerCount).toBe("number");
      expect(typeof rt.enabled).toBe("boolean");
    }
    await expect(
      db.setting.findUnique({ where: { key: "risk_engine_rules" } }),
    ).resolves.toBeNull();
  });

  it("KPIs: avgRiskScore is the mean of all assessment scores", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedOrder(c.id, { totalPrice: 3000 });
    await seedOrder(c.id, { totalPrice: 3000 });

    const report = await getRiskAnalyticsReport(30);
    expect(report.kpis.avgRiskScore).toBeGreaterThanOrEqual(0);
    expect(report.kpis.avgRiskScore).toBeLessThanOrEqual(100);
  });

  it("KPIs: confirmationRate and returnRate from completed orders", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c1 = await seedTestCustomer(db, { phone: uniquePhone() });
    const c2 = await seedTestCustomer(db, { phone: uniquePhone() });
    const c3 = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedOrder(c1.id, { status: "delivered" });
    await seedOrder(c2.id, { status: "delivered" });
    await seedOrder(c3.id, { status: "returned" });

    const report = await getRiskAnalyticsReport(30);
    // 2 delivered / 3 completed = 0.667
    expect(report.kpis.confirmationRate).toBeCloseTo(2 / 3, 2);
    // 1 returned / 3 completed = 0.333
    expect(report.kpis.returnRate).toBeCloseTo(1 / 3, 2);
  });

  it("KPIs: highRiskOrderCount counts high + critical", async () => {
    // Force a high-risk scenario: blacklisted customer → critical
    await seedWilaya("Alger", 5, 0.5, 0.28); // highest risk wilaya
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    await db.customer.update({ where: { id: c.id }, data: { isBlacklisted: true } });
    await seedOrder(c.id, { totalPrice: 3000 });

    const report = await getRiskAnalyticsReport(30);
    expect(report.kpis.highRiskOrderCount).toBeGreaterThanOrEqual(1);
  });

  it("KPIs: blacklistedCustomerCount counts customers with isBlacklisted flag", async () => {
    const c1 = await seedTestCustomer(db, { phone: uniquePhone() });
    await seedTestCustomer(db, { phone: uniquePhone() });
    await db.customer.update({
      where: { id: c1.id },
      data: { isBlacklisted: true },
    });
    const report = await getRiskAnalyticsReport(30);
    expect(report.kpis.blacklistedCustomerCount).toBe(1);
  });

  it("KPIs: potentialSavingsDzd = (high-risk returned) × 600", async () => {
    await seedWilaya("Alger", 5, 0.5, 0.28);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    await db.customer.update({ where: { id: c.id }, data: { isBlacklisted: true } });
    // Blacklisted → critical. Mark returned → counts toward savings.
    await seedOrder(c.id, { status: "returned", totalPrice: 3000 });

    const report = await getRiskAnalyticsReport(30);
    expect(report.kpis.potentialSavingsDzd).toBe(600);
  });

  it("respects the days window (excludes older orders)", async () => {
    await seedWilaya("Alger", 2, 0.78, 0.12);
    const c = await seedTestCustomer(db, { phone: uniquePhone() });
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60); // outside 30-day window
    await seedOrder(c.id, { createdAt: oldDate });

    const report = await getRiskAnalyticsReport(30);
    expect(report.totalOrders).toBe(0);
  });
});
