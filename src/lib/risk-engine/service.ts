/**
 * Risk service — DB-aware layer that loads config + rules, builds the
 * RiskAssessmentInput from real order/customer data, and persists assessments.
 *
 * This is the integration layer between the pure scoring engine and the
 * Prisma database. It's the only part of the risk engine that touches the DB.
 *
 * Config + rules are stored in the Setting table (key/value JSON), so the
 * seller can tune them via the Settings UI without code changes.
 */
import "server-only";

import { db } from "@/lib/db";
import {
  DEFAULT_RISK_CONFIG,
  DEFAULT_RISK_RULES,
  type RiskAssessment,
  type RiskAssessmentInput,
  type RiskEngineConfig,
  type RiskRule,
} from "./types";
import { assessRisk } from "./scoring";

// ── Setting keys ─────────────────────────────────────────────────────────────

const CONFIG_KEY = "risk_engine_config";
const RULES_KEY = "risk_engine_rules";

// ── Config persistence ───────────────────────────────────────────────────────

/** Load the risk engine config (falls back to defaults if not set). */
export async function getRiskConfig(): Promise<RiskEngineConfig> {
  const row = await db.setting.findUnique({ where: { key: CONFIG_KEY } });
  if (!row) return DEFAULT_RISK_CONFIG;
  try {
    return { ...DEFAULT_RISK_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_RISK_CONFIG;
  }
}

/** Save the risk engine config. */
export async function saveRiskConfig(config: RiskEngineConfig): Promise<void> {
  await db.setting.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: JSON.stringify(config) },
    update: { value: JSON.stringify(config) },
  });
}

// ── Rules persistence ────────────────────────────────────────────────────────

/** Load all risk rules (creates defaults if none exist). */
export async function getRiskRules(): Promise<RiskRule[]> {
  const row = await db.setting.findUnique({ where: { key: RULES_KEY } });
  if (!row) {
    // Seed defaults on first access
    const defaults: RiskRule[] = DEFAULT_RISK_RULES.map((r) => ({ ...r, triggerCount: 0 }));
    await db.setting.create({
      data: { key: RULES_KEY, value: JSON.stringify(defaults) },
    });
    return defaults;
  }
  try {
    const parsed = JSON.parse(row.value) as RiskRule[];
    return parsed;
  } catch {
    return DEFAULT_RISK_RULES.map((r) => ({ ...r, triggerCount: 0 }));
  }
}

/** Save all risk rules (replaces the entire set). */
export async function saveRiskRules(rules: RiskRule[]): Promise<void> {
  await db.setting.upsert({
    where: { key: RULES_KEY },
    create: { key: RULES_KEY, value: JSON.stringify(rules) },
    update: { value: JSON.stringify(rules) },
  });
}

/** Increment the trigger count for rules that fired (for analytics). */
export async function incrementRuleTriggers(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;
  const rules = await getRiskRules();
  const updated = rules.map((r) =>
    ruleIds.includes(r.id) ? { ...r, triggerCount: r.triggerCount + 1 } : r,
  );
  await saveRiskRules(updated);
}

// ── Assessment input builder ─────────────────────────────────────────────────

/**
 * Build the RiskAssessmentInput from a real order ID.
 * Loads the order, the customer's history, and the wilaya risk profile.
 */
export async function buildAssessmentInputFromOrder(orderId: string): Promise<RiskAssessmentInput | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      totalPrice: true,
      wilaya: true,
      commune: true,
      address: true,
      phone: true,
      source: true,
      createdAt: true,
      customerId: true,
    },
  });
  if (!order) return null;

  // Customer history
  const customerOrders = await db.order.findMany({
    where: { customerId: order.customerId },
    select: { status: true, totalPrice: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const totalOrders = customerOrders.length;
  const deliveredCount = customerOrders.filter((o) => o.status === "delivered").length;
  const returnedCount = customerOrders.filter((o) => o.status === "returned").length;
  const refusedCount = customerOrders.filter((o) => o.status === "refused").length;
  const cancelledCount = customerOrders.filter((o) => o.status === "cancelled").length;
  const totalSpent = customerOrders
    .filter((o) => !["cancelled", "draft"].includes(o.status))
    .reduce((sum, o) => sum + o.totalPrice, 0);

  // Customer blacklist flag (stored in customer notes or a dedicated field)
  const customer = await db.customer.findUnique({
    where: { id: order.customerId },
    select: { notes: true, createdAt: true },
  });

  // Check blacklist — we use a simple convention: "[BLACKLISTED]" tag in notes
  // (future: dedicated isBlacklisted boolean column on Customer)
  const isBlacklisted = (customer?.notes ?? "").includes("[BLACKLISTED]");

  // Wilaya risk profile
  const wilayaRiskRow = await db.wilayaRiskProfile.findUnique({
    where: { wilaya: order.wilaya },
  });

  return {
    order: {
      totalPrice: order.totalPrice,
      wilaya: order.wilaya,
      commune: order.commune,
      address: order.address,
      phone: order.phone,
      source: order.source,
      createdAt: order.createdAt,
    },
    customerHistory: {
      customerId: order.customerId,
      totalOrders,
      deliveredCount,
      returnedCount,
      refusedCount,
      cancelledCount,
      totalSpent,
      firstOrderDate: totalOrders > 0 ? customerOrders[0]!.createdAt : null,
      lastOrderDate: totalOrders > 0 ? customerOrders[customerOrders.length - 1]!.createdAt : null,
      isBlacklisted,
    },
    wilayaRisk: wilayaRiskRow
      ? {
          riskLevel: wilayaRiskRow.riskLevel,
          confirmationRate: wilayaRiskRow.confirmationRate ?? 0,
          returnRate: wilayaRiskRow.returnRate ?? 0,
        }
      : null,
  };
}

// ── Main assess function ─────────────────────────────────────────────────────

/**
 * Assess the risk of an order by ID.
 * Loads config + rules, builds the input, runs the engine, and persists
 * the trigger counts for analytics.
 */
export async function assessOrderRisk(orderId: string): Promise<RiskAssessment | null> {
  const input = await buildAssessmentInputFromOrder(orderId);
  if (!input) return null;

  const [config, rules] = await Promise.all([getRiskConfig(), getRiskRules()]);

  const assessment = assessRisk(input, config, rules);

  // Persist rule trigger counts (fire-and-forget — don't block the response)
  void incrementRuleTriggers(assessment.triggeredRules);

  return assessment;
}

/**
 * Assess risk from a raw input (used by the order creation flow before
 * the order is persisted — e.g., to show a live risk preview in the order form).
 */
export async function assessRiskFromInput(input: RiskAssessmentInput): Promise<RiskAssessment> {
  const [config, rules] = await Promise.all([getRiskConfig(), getRiskRules()]);
  return assessRisk(input, config, rules);
}

// ── Blacklist management ─────────────────────────────────────────────────────

/** Add a customer to the blacklist (sets the [BLACKLISTED] tag in notes). */
export async function blacklistCustomer(customerId: string, reason?: string): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { notes: true },
  });
  if (!customer) return;

  const existingNotes = customer.notes ?? "";
  if (existingNotes.includes("[BLACKLISTED]")) return;

  const tag = reason
    ? `[BLACKLISTED: ${reason}]`
    : "[BLACKLISTED]";

  await db.customer.update({
    where: { id: customerId },
    data: { notes: existingNotes ? `${existingNotes}\n${tag}` : tag },
  });
}

/** Remove a customer from the blacklist. */
export async function unblacklistCustomer(customerId: string): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { notes: true },
  });
  if (!customer) return;

  const cleaned = (customer.notes ?? "")
    .replace(/\[BLACKLISTED[^\]]*\]/g, "")
    .trim();

  await db.customer.update({
    where: { id: customerId },
    data: { notes: cleaned || null },
  });
}

/** List all blacklisted customers. */
export async function listBlacklistedCustomers(): Promise<Array<{
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  orderCount: number;
}>> {
  const customers = await db.customer.findMany({
    where: { notes: { contains: "[BLACKLISTED" } },
    select: {
      id: true,
      name: true,
      phone: true,
      notes: true,
      orderCount: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return customers;
}
