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
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
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
    select: { notes: true, createdAt: true, isBlacklisted: true },
  });

  // Check blacklist via the dedicated isBlacklisted column
  const isBlacklisted = customer?.isBlacklisted ?? false;

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

/**
 * Batch-assess multiple orders efficiently.
 * Loads config + rules ONCE, then builds inputs + assesses each order.
 * Returns a Map<orderId, RiskAssessment> for O(1) lookup by the UI.
 *
 * Used by the orders page to show risk badges on every row without
 * N separate config/rules DB round-trips.
 */
export async function batchAssessOrders(orderIds: string[]): Promise<Map<string, RiskAssessment>> {
  if (orderIds.length === 0) return new Map();

  const [config, rules] = await Promise.all([getRiskConfig(), getRiskRules()]);
  const results = new Map<string, RiskAssessment>();

  // Build all inputs first (parallel), then assess
  const inputs = await Promise.all(
    orderIds.map(async (id) => ({ id, input: await buildAssessmentInputFromOrder(id) })),
  );

  let allTriggered: string[] = [];
  for (const { id, input } of inputs) {
    if (!input) continue;
    const assessment = assessRisk(input, config, rules);
    results.set(id, assessment);
    allTriggered = allTriggered.concat(assessment.triggeredRules);
  }

  // Persist rule trigger counts once (batched)
  if (allTriggered.length > 0) {
    void incrementRuleTriggers(allTriggered);
  }

  return results;
}

// ── Blacklist management ─────────────────────────────────────────────────────
//
// Blacklist state is persisted on the Customer row itself via the dedicated
// `isBlacklisted` / `blacklistReason` / `blacklistedAt` columns (CODE-025).
// The risk-engine scoring reads `isBlacklisted` — so this is the column that
// makes the risk penalty actually fire.
//
// We ALSO keep a human-readable `[BLACKLISTED: reason]` tag in the encrypted
// `notes` field as an audit trail for sellers reading the customer detail
// page. The notes tag is NEVER used for querying (notes is encrypted at rest,
// so a `contains` filter would search ciphertext and find nothing).

/** Add a customer to the blacklist. */
export async function blacklistCustomer(customerId: string, reason?: string): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { notes: true, isBlacklisted: true, name: true, phone: true },
  });
  if (!customer) return;

  // Idempotent: already blacklisted — just update the reason if a new one is given.
  if (customer.isBlacklisted) {
    if (reason) {
      await db.customer.update({
        where: { id: customerId },
        data: { blacklistReason: reason },
      });
    }
    return;
  }

  const existingNotes = customer.notes ?? "";
  const tag = reason ? `[BLACKLISTED: ${reason}]` : "[BLACKLISTED]";
  const newNotes = existingNotes ? `${existingNotes}\n${tag}` : tag;

  await db.customer.update({
    where: { id: customerId },
    data: {
      isBlacklisted: true,
      blacklistReason: reason ?? null,
      blacklistedAt: new Date(),
      notes: newNotes,
    },
  });

  // Fire automation trigger (fire-and-forget)
  void dispatchTrigger("customer.blacklisted" as TriggerEvent, {
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
  });
}

/** Remove a customer from the blacklist. */
export async function unblacklistCustomer(customerId: string): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { notes: true, isBlacklisted: true },
  });
  if (!customer) return;

  // Idempotent: not blacklisted AND no stale tag in notes — nothing to do.
  // (A stale tag can exist from the pre-CODE-025 bug where blacklistCustomer
  // only wrote to notes. We clean those up here too.)
  const hasStaleTag = (customer.notes ?? "").includes("[BLACKLISTED");
  if (!customer.isBlacklisted && !hasStaleTag) return;

  const cleaned = (customer.notes ?? "")
    .replace(/\[BLACKLISTED[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  await db.customer.update({
    where: { id: customerId },
    data: {
      isBlacklisted: false,
      blacklistReason: null,
      blacklistedAt: null,
      notes: cleaned || null,
    },
  });
}

/** List all blacklisted customers (queries the dedicated isBlacklisted column). */
export async function listBlacklistedCustomers(): Promise<Array<{
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  orderCount: number;
  blacklistReason: string | null;
  blacklistedAt: Date | null;
}>> {
  const customers = await db.customer.findMany({
    where: { isBlacklisted: true },
    select: {
      id: true,
      name: true,
      phone: true,
      notes: true,
      orderCount: true,
      blacklistReason: true,
      blacklistedAt: true,
    },
    orderBy: { blacklistedAt: "desc" },
  });
  return customers;
}
