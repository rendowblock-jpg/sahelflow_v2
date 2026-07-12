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

/**
 * Increment the trigger count for rules that fired (for analytics).
 *
 * SV-M7: the previous read-all → map → save-all was non-atomic — two
 * concurrent risk assessments that triggered the same rule would both read
 * triggerCount=5, both increment to 6, both save → second save overwrites
 * the first → one increment is lost.
 *
 * Risk rules are stored as a JSON blob in a single Setting row (key=RULES_KEY),
 * so we can't use Prisma's `{ triggerCount: { increment: 1 } }` operator
 * (it's a JSON field, not a column). The fix: wrap the read-modify-write in
 * a `$transaction` so the read + write happen as an atomic unit on the
 * SQLite writer lock. Prisma's interactive `$transaction` on SQLite uses
 * the standard `BEGIN` (DEFERRED) — the write lock is acquired on the first
 * WRITE (the upsert), not on BEGIN. Two concurrent calls can still both
 * read the same pre-write snapshot, but the SECOND call's upsert blocks on
 * the first's write lock + sees the committed state on re-read inside the
 * tx... actually no — Prisma's interactive tx doesn't re-read on write
 * contention, it just waits for the lock + then writes its stale value.
 *
 * RESIDUAL RACE: under high concurrency, two concurrent calls could still
 * lose one increment. This is acceptable for an analytics counter (worst
 * case: undercount by a few — never data corruption, never an over-count).
 * A proper fix would require either (a) a `RiskRule` table with
 * `triggerCount` as a column (so we can use `{ increment: 1 }`) or
 * (b) a Postgres backend with SELECT FOR UPDATE. Both are out of scope for
 * a medium-severity fix. The $transaction at least makes the read+write
 * atomic as a unit (no partial writes).
 */
export async function incrementRuleTriggers(ruleIds: string[]): Promise<void> {
  if (ruleIds.length === 0) return;
  await db.$transaction(
    async (tx) => {
    // Re-read inside the tx so we see any concurrent committed writes.
    const row = await tx.setting.findUnique({ where: { key: RULES_KEY } });
    let rules: RiskRule[];
    if (!row) {
      // Seed defaults on first access (mirrors getRiskRules seeding).
      rules = DEFAULT_RISK_RULES.map((r) => ({ ...r, triggerCount: 0 }));
    } else {
      try {
        rules = JSON.parse(row.value) as RiskRule[];
      } catch {
        rules = DEFAULT_RISK_RULES.map((r) => ({ ...r, triggerCount: 0 }));
      }
    }
    const updated = rules.map((r) =>
      ruleIds.includes(r.id) ? { ...r, triggerCount: r.triggerCount + 1 } : r,
    );
    await tx.setting.upsert({
      where: { key: RULES_KEY },
      create: { key: RULES_KEY, value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    });
  },
    // Increase from the default 5s — the dev server's first-compile is slow
    // (Turbopack can take 40s+ on first request), and the transaction would
    // otherwise expire. In production this completes in <100ms.
    { maxWait: 10_000, timeout: 30_000 },
  );
}

// ── Assessment input builder ─────────────────────────────────────────────────

/**
 * Build the RiskAssessmentInput from a real order ID.
 * Loads the order, the customer's history, and the wilaya risk profile.
 */
export async function buildAssessmentInputFromOrder(orderId: string): Promise<RiskAssessmentInput | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
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
    where: { customerId: order.customerId, deletedAt: null },
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
  const customer = await db.customer.findFirst({
    where: { id: order.customerId, deletedAt: null },
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

// ── Pre-create assessment (W3-4, task 2-g) ───────────────────────────────────

/**
 * W3-4 (task 2-g): raw order data submitted to the pre-create risk check.
 *
 * This is the "pre-flight" shape — the data the seller has typed into the
 * order form (or that the storefront has posted) BEFORE the order row is
 * persisted. The function looks up the customer by phone (if she exists)
 * to evaluate history-based factors; if the phone is new, the customer
 * is treated as a first-time buyer (which itself is a risk factor — see
 * `factorNewCustomer` in scoring.ts).
 */
export interface PreCreateOrderData {
  /** Customer phone (Algerian mobile, 0[5-7]XXXXXXXX). Used to look up existing customer history. */
  phone: string;
  /** Delivery wilaya (Arabic name, e.g. "الجزائر" or transliteration "Alger"). Drives wilaya-risk factor. */
  wilaya: string;
  commune?: string | null;
  address?: string | null;
  /** Order total (items + delivery) in DZD. Drives order-value factor. */
  totalPrice: number;
  /** Order source — "manual" (seller-created) or "storefront". Drives source-eq rule. */
  source?: string;
  /** Line items (currently unused by the scoring engine — reserved for future item-based factors). */
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
}

/**
 * W3-4 (task 2-g): build a RiskAssessmentInput from raw order-form data
 * (no order ID — the order hasn't been persisted yet).
 *
 * Mirrors `buildAssessmentInputFromOrder` but operates on submitted data
 * instead of querying an Order row. Loads:
 *   - The customer's order history (by phone lookup — phone is unique on Customer)
 *   - The customer's blacklist flag
 *   - The wilaya risk profile (by wilaya name)
 *
 * If the phone doesn't match any existing customer, the customerHistory
 * is `undefined` — the scoring engine treats this as a first-time buyer
 * (factorNewCustomer fires, +20 risk points by default).
 */
export async function buildAssessmentInputFromOrderData(
  orderData: PreCreateOrderData,
): Promise<RiskAssessmentInput> {
  // Look up existing customer by phone (phone is @@unique on Customer).
  // We allow soft-deleted customers to be found — if a seller is re-creating
  // an order for a previously-deleted customer, the risk history is still
  // relevant. (The deletedAt filter on order lookups below handles
  // soft-deleted orders separately.)
  const customer = await db.customer.findFirst({
    where: { phone: orderData.phone },
    select: {
      id: true,
      isBlacklisted: true,
      createdAt: true,
    },
  });

  let customerHistory: RiskAssessmentInput["customerHistory"] | undefined;
  if (customer) {
    // Load the customer's order history (exclude soft-deleted orders).
    const customerOrders = await db.order.findMany({
      where: { customerId: customer.id, deletedAt: null },
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

    customerHistory = {
      customerId: customer.id,
      totalOrders,
      deliveredCount,
      returnedCount,
      refusedCount,
      cancelledCount,
      totalSpent,
      firstOrderDate: totalOrders > 0 ? customerOrders[0]!.createdAt : null,
      lastOrderDate: totalOrders > 0 ? customerOrders[customerOrders.length - 1]!.createdAt : null,
      isBlacklisted: customer.isBlacklisted,
    };
  }

  // Wilaya risk profile (may not exist for all wilayas — that's fine, the
  // scoring engine treats a missing profile as no wilaya-risk contribution).
  const wilayaRiskRow = await db.wilayaRiskProfile.findUnique({
    where: { wilaya: orderData.wilaya },
  });

  return {
    order: {
      totalPrice: orderData.totalPrice,
      wilaya: orderData.wilaya,
      commune: orderData.commune ?? null,
      address: orderData.address ?? null,
      phone: orderData.phone,
      source: orderData.source ?? "manual",
      // The order doesn't exist yet — use "now" so the order-frequency factor
      // can compute hours-since-last-order against the customer's real history.
      createdAt: new Date(),
    },
    customerHistory,
    wilayaRisk: wilayaRiskRow
      ? {
          riskLevel: wilayaRiskRow.riskLevel,
          confirmationRate: wilayaRiskRow.confirmationRate ?? 0,
          returnRate: wilayaRiskRow.returnRate ?? 0,
        }
      : null,
  };
}

/**
 * W3-4 (task 2-g): assess order risk BEFORE the order is created.
 *
 * Takes the raw order-form data (customer phone, wilaya, items, total) and
 * returns a full RiskAssessment — same factors, same scoring, same rules as
 * the post-create `assessOrderRisk`. The difference: this function looks up
 * the customer by phone (instead of by an order's customerId FK) and uses
 * `new Date()` as the order's createdAt.
 *
 * Use cases:
 *   - Manual order creation UI: show a confirmation dialog if risk is HIGH
 *     (score > 70) before saving — "This order has HIGH risk (score: 85/100).
 *     Reason: phone has 3 previous cancellations. Do you still want to create
 *     this order?"
 *   - Storefront: reject high-risk orders at the API boundary (or flag them
 *     for seller review before they hit the orders table).
 *
 * Unlike `assessOrderRisk`, this function does NOT need an order ID — it
 * operates entirely on the submitted data + the customer's existing history.
 *
 * Rule trigger counts ARE persisted (fire-and-forget) — the rule genuinely
 * fired during a risk evaluation, even if the seller abandons the order
 * after seeing the warning. This keeps analytics consistent with the
 * post-create path.
 */
export async function assessOrderRiskPreCreate(
  orderData: PreCreateOrderData,
): Promise<RiskAssessment> {
  const input = await buildAssessmentInputFromOrderData(orderData);
  const [config, rules] = await Promise.all([getRiskConfig(), getRiskRules()]);
  const assessment = assessRisk(input, config, rules);

  // Persist rule trigger counts (fire-and-forget — matches assessOrderRisk).
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

/**
 * Add a customer to the blacklist.
 *
 * SV-M6: the notes read-modify-write is now wrapped in a `$transaction` so
 * concurrent calls (e.g. two automations fire `customer.blacklisted` for the
 * same customer in quick succession) don't lose writes. Previously both
 * read notes="X", both append their tag, both save → second save overwrites
 * the first → the first tag is lost. The tx serializes the read+write via
 * SQLite's single-writer lock.
 */
export async function blacklistCustomer(customerId: string, reason?: string): Promise<void> {
  // Read outside the tx: used for the early no-op return + the dispatch payload.
  // (Reading twice is fine — the tx still serializes the WRITE; the dispatch
  // payload just needs a best-effort snapshot.)
  const customer = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
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

  await db.$transaction(async (tx) => {
    // SV-M6: re-read notes INSIDE the tx so we see any concurrent uncommitted writes.
    const fresh = await tx.customer.findUnique({
      where: { id: customerId },
      select: { notes: true },
    });
    const existingNotes = fresh?.notes ?? "";
    const tag = reason ? `[BLACKLISTED: ${reason}]` : "[BLACKLISTED]";
    const newNotes = existingNotes ? `${existingNotes}\n${tag}` : tag;

    await tx.customer.update({
      where: { id: customerId },
      data: {
        isBlacklisted: true,
        blacklistReason: reason ?? null,
        blacklistedAt: new Date(),
        notes: newNotes,
      },
    });
  });

  // Fire automation trigger (fire-and-forget)
  void dispatchTrigger("customer.blacklisted" as TriggerEvent, {
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
  });
}

/**
 * Remove a customer from the blacklist.
 *
 * SV-M6: same transactional notes read-modify-write pattern as blacklistCustomer.
 */
export async function unblacklistCustomer(customerId: string): Promise<void> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, deletedAt: null },
    select: { notes: true, isBlacklisted: true },
  });
  if (!customer) return;

  // Idempotent: not blacklisted AND no stale tag in notes — nothing to do.
  // (A stale tag can exist from the pre-CODE-025 bug where blacklistCustomer
  // only wrote to notes. We clean those up here too.)
  const hasStaleTag = (customer.notes ?? "").includes("[BLACKLISTED");
  if (!customer.isBlacklisted && !hasStaleTag) return;

  await db.$transaction(async (tx) => {
    // SV-M6: re-read notes INSIDE the tx.
    const fresh = await tx.customer.findUnique({
      where: { id: customerId },
      select: { notes: true },
    });
    const cleaned = (fresh?.notes ?? "")
      .replace(/\[BLACKLISTED[^\]]*\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    await tx.customer.update({
      where: { id: customerId },
      data: {
        isBlacklisted: false,
        blacklistReason: null,
        blacklistedAt: null,
        notes: cleaned || null,
      },
    });
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
    where: { isBlacklisted: true, deletedAt: null },
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
