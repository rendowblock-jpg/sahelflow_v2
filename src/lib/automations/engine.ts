/**
 * Automations engine — trigger dispatcher + action executor.
 *
 * This is the "brain" that listens to business events (order created,
 * order delivered, etc.) and fires any active automations that match
 * the trigger.
 *
 * Flow:
 *   1. A business action (e.g. orderService.updateStatus) calls
 *      dispatchTrigger(context, "order.delivered", { orderId, customerId, ... })
 *   2. The engine loads all active automations with trigger === "order.delivered"
 *   3. For each automation, it executes the action (send_whatsapp, tag_customer, etc.)
 *   4. It logs the result (success/failed/skipped) to AutomationLog
 *   5. It increments the automation's runCount + updates lastRunAt
 *
 * All execution is fire-and-forget (void) — it never blocks the calling
 * business operation. Failures are logged, not thrown.
 */
import "server-only";
import { logger } from "@/lib/logger";
import type { ServiceContext } from "@/lib/data/service-base";
import { evaluateConditions, type ConditionGroup } from "./conditions";

import { readFileSync, existsSync } from "fs";

const WHATSAPP_SIDECAR_URL =
  process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";

/** Read the sidecar bearer token from the token file (written by the sidecar on startup). */
function readSidecarTokenFile(): string | undefined {
  try {
    const tokenFile = process.env.SIDECAR_TOKEN_FILE || "/tmp/sahelflow-sidecar-token";
    if (existsSync(tokenFile)) {
      return readFileSync(tokenFile, "utf-8").trim();
    }
  } catch { /* ignore */ }
  return undefined;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type TriggerEvent =
  | "order.created"
  | "order.confirmed"
  | "order.shipped"
  | "order.delivered"
  | "order.returned"
  | "order.cancelled"
  | "customer.created"
  | "customer.blacklisted"
  | "message.received"
  | "stock.low";

export interface TriggerPayload {
  orderId?: string;
  customerId?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  totalPrice?: number;
  wilaya?: string;
  productId?: string;
  productName?: string;
  stockLevel?: number;
  [key: string]: unknown;
}

/**
 * W3-3 (task 2-g): extended with two new statuses:
 *   - "dry_run"       — automation.dryRun is true; the engine logged what
 *                       it WOULD do but did not execute the action.
 *   - "rate_limited"  — a destructive automation exceeded its per-minute
 *                       rate limit (DESTRUCTIVE_RATE_LIMIT_PER_MIN) and was
 *                       skipped to prevent a runaway trigger from causing
 *                       mass data loss.
 */
export type ExecutionStatus =
  | "success"
  | "failed"
  | "skipped"
  | "dry_run"
  | "rate_limited";

interface AutomationConfig {
  messageTemplate?: string;
  targetStatus?: string;
  noteText?: string;
  [key: string]: unknown;
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Dispatch a trigger event to all matching active automations.
 *
 * This is fire-and-forget — it catches all errors internally and never
 * throws. The calling business operation is never blocked by automation
 * failures.
 */
export async function dispatchTrigger(
  context: ServiceContext,
  event: TriggerEvent,
  payload: TriggerPayload,
): Promise<void> {
  try {
    const automations = await context.prisma.automation.findMany({
      where: { trigger: event, isActive: true },
    });

    if (automations.length === 0) return;

    logger.info("automation.dispatch", { event, count: automations.length });

    // Execute all matching automations in parallel
    await Promise.allSettled(
      automations.map((auto) => executeAutomation(context, auto, event, payload)),
    );
  } catch (err) {
    // Never let automation failures bubble up to the business operation
    logger.error("automation.dispatch.failed", { event, error: String(err) });
  }
}

// ── Low-stock trigger helper ─────────────────────────────────────────────────

/**
 * Minimal structural type for a Prisma client (or transaction client) that
 * supports `product.findUnique`. We accept the loose `{ findUnique(args: any) =>
 * Promise<any> }` shape because the PII-extended `DbClient` and the standard
 * `Prisma.TransactionClient` use different `InternalArgs` generic
 * instantiations on `product.findUnique`, which makes them mutually
 * unassignable — even though the runtime call signature is identical. The
 * `any` lets both the full client (passed by `productService.update`) and the
 * transaction client (passed by `orderService.updateStatus`) flow through.
 */
type LowStockQueryClient = {
  product: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
};

/** Shape returned by `LowStockQueryClient.product.findUnique` for our select. */
interface LowStockProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
}

/**
 * After a stock change, check whether the product's stock has dropped to or
 * below its `lowStockThreshold`. Returns the product info if low-stock,
 * `null` otherwise.
 *
 * SV-M8: SPLIT out of `checkAndDispatchLowStock` so callers inside a
 * `$transaction` can DETECT low-stock inside the tx (race-safe read of the
 * just-updated stock) and DISPATCH the `stock.low` trigger AFTER the tx
 * commits. Previously the dispatch fired inside the tx — if the tx rolled
 * back, the seller got a low-stock notification for a stock change that
 * didn't actually happen.
 *
 * Callers that aren't inside a tx (rare — only legacy paths) can still use
 * `checkAndDispatchLowStock` which calls both functions inline.
 */
export async function detectLowStock(
  tx: LowStockQueryClient,
  productId: string,
): Promise<LowStockProductRow | null> {
  try {
    const product = (await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        lowStockThreshold: true,
      },
    })) as LowStockProductRow | null;
    if (!product) return null;
    // Only fire when stock is at or below the threshold — restoration that
    // pushes stock back above the threshold will NOT re-fire (the product is
    // no longer low).
    if (product.stock > product.lowStockThreshold) return null;
    return product;
  } catch (err) {
    // Never let the low-stock check bubble up to the business operation.
    logger.error("automation.lowStockCheck.failed", {
      productId,
      error: String(err),
    });
    return null;
  }
}

/**
 * Fire the `stock.low` trigger for a product detected as low-stock via
 * `detectLowStock`. Fire-and-forget — never blocks the caller, never throws.
 *
 * SV-M8: callers should call this AFTER the surrounding `$transaction`
 * commits, so the dispatch matches the committed stock state (no
 * notifications for rolled-back changes).
 */
export function dispatchLowStock(context: ServiceContext, product: LowStockProductRow): void {
  void dispatchTrigger(context, "stock.low", {
    productId: product.id,
    productName: product.name,
    stockLevel: product.stock,
    lowStockThreshold: product.lowStockThreshold,
  });
}

/**
 * Backward-compat wrapper: detect + dispatch in one call.
 *
 * SV-M8 WARNING: calling this inside a `$transaction` re-introduces the
 * "dispatch fires before commit" bug. New callers should use `detectLowStock`
 * inside the tx + `dispatchLowStock` after the tx commits. This wrapper is
 * kept for non-tx callers only.
 */
export async function checkAndDispatchLowStock(
  context: ServiceContext,
  tx: LowStockQueryClient,
  productId: string,
): Promise<void> {
  const product = await detectLowStock(tx, productId);
  if (product) dispatchLowStock(context, product);
}

// ── Destructive-action detection + rate-limiting (W3-3, task 2-g) ────────────

/**
 * W3-3: target order statuses that make an `update_status` action
 * destructive. Cancelling or failing an order is hard to reverse
 * (stock has been adjusted, customer stats have been updated, automations
 * may have fired on the cancellation trigger).
 */
const DESTRUCTIVE_TARGET_STATUSES = new Set(["cancelled", "failed"]);

/**
 * W3-3: per-automation per-minute cap on destructive executions. If an
 * automation's trigger fires more than this many times in 60s AND the
 * action is destructive, the engine skips execution + logs `rate_limited`.
 *
 * 10/min is a deliberate balance: a seller legitimately confirming 30
 * orders in a minute (bulk import) won't be blocked because `confirmed`
 * is NOT in DESTRUCTIVE_TARGET_STATUSES. But a runaway trigger that tries
 * to cancel 100 orders in a minute (e.g. a misconfigured condition that
 * matches every page load) will be stopped after the 10th cancel.
 */
const DESTRUCTIVE_RATE_LIMIT_PER_MIN = 10;

/**
 * W3-3: an action is destructive if it modifies order state to a terminal/
 * hard-to-reverse status. Currently only `update_status` with a destructive
 * targetStatus qualifies.
 *
 * Other actions are NOT rate-limited:
 *   - `send_whatsapp`        — side-effect only (a duplicate WhatsApp is
 *                              annoying but not data loss; the recipient
 *                              can ignore it). Rate-limiting here would
 *                              silently drop delivery confirmations etc.
 *   - `tag_customer`         — notes are append-only + editable; a runaway
 *                              trigger duplicates notes (cleanup is a
 *                              one-liner) but doesn't lose data.
 *   - `send_notification`    — in-app only, no persistent state change.
 *
 * Future: if `update_stock` / `update_price` actions are added (currently
 * they're AI tools, not automations), add them here.
 */
function isDestructiveAction(action: string, config: AutomationConfig): boolean {
  if (action === "update_status") {
    const target = config.targetStatus;
    return typeof target === "string" && DESTRUCTIVE_TARGET_STATUSES.has(target);
  }
  return false;
}

/**
 * W3-3: count destructive executions (success OR failed — both count,
 * since an attempt that failed still consumed a turn) for this automation
 * in the last 60s. Returns true if the rate limit has been exceeded.
 *
 * Queries AutomationLog directly. The `status in ["success", "failed"]`
 * filter excludes `dry_run`, `rate_limited`, and `skipped` rows — those
 * don't represent real execution attempts.
 */
async function isDestructiveRateLimited(
  context: ServiceContext,
  automationId: string,
): Promise<boolean> {
  const sixtySecondsAgo = new Date(Date.now() - 60_000);
  const recentCount = await context.prisma.automationLog.count({
    where: {
      automationId,
      status: { in: ["success", "failed"] },
      createdAt: { gte: sixtySecondsAgo },
    },
  });
  return recentCount >= DESTRUCTIVE_RATE_LIMIT_PER_MIN;
}

/**
 * W3-3 (task 2-g): produce a human-readable description of what an action
 * WOULD do, for the `dry_run` AutomationLog message. The description is
 * intentionally short (one line) so it's scannable in the log table.
 *
 * Examples:
 *   - send_whatsapp   → "send WhatsApp to 0555123456 ('Hello Ahmed...')"
 *   - update_status   → "update order #CMD-001 status → cancelled"
 *   - tag_customer    → "tag customer 'Ahmed' with note 'VIP'"
 *   - send_notification → "send in-app notification"
 *   - multi-step      → "run 3 steps: [send_whatsapp, update_status, tag_customer]"
 */
function describeActionIntent(
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  stepsRaw?: string | null,
): string {
  // Multi-step automation — describe each step (no recursion; steps are
  // action-name strings, not full action+config tuples).
  if (stepsRaw) {
    try {
      const steps = JSON.parse(stepsRaw);
      if (Array.isArray(steps) && steps.length > 0) {
        return `run ${steps.length} steps: [${steps.join(", ")}]`;
      }
    } catch {
      // fall through to single-action description
    }
  }

  switch (action) {
    case "send_whatsapp": {
      const phone = payload.customerPhone ?? "(no phone)";
      const tmpl = config.messageTemplate ?? "(default template)";
      const preview = tmpl.length > 40 ? `${tmpl.slice(0, 40)}...` : tmpl;
      return `send WhatsApp to ${phone} ('${preview}')`;
    }
    case "update_status": {
      const target = config.targetStatus ?? "(unset)";
      return `update order ${payload.orderNumber ?? payload.orderId ?? "(no order)"} status → ${target}`;
    }
    case "tag_customer": {
      const note = config.noteText ?? "(default tag)";
      return `tag customer '${payload.customerName ?? payload.customerId ?? "(unknown)"}' with note '${note}'`;
    }
    case "send_notification": {
      const tmpl = config.messageTemplate ?? "Automation triggered";
      return `send in-app notification ('${tmpl}')`;
    }
    default:
      return `execute action '${action}'`;
  }
}

// ── Single automation execution ──────────────────────────────────────────────

async function executeAutomation(
  context: ServiceContext,
  automation: {
    id: string;
    name: string;
    action: string;
    config: string | null;
    conditions?: string | null;
    steps?: string | null;
    /** W3-3: when true, log what we WOULD do but don't execute. */
    dryRun?: boolean | null;
  },
  event: string,
  payload: TriggerPayload,
): Promise<void> {
  const db = context.prisma;
  let status: ExecutionStatus = "success";
  let message: string | null = null;

  try {
    const config: AutomationConfig = automation.config
      ? JSON.parse(automation.config)
      : {};

    // Phase 6: evaluate conditions (JSON-logic) — skip if conditions don't match
    const conditions: ConditionGroup | null = automation.conditions
      ? JSON.parse(automation.conditions)
      : null;
    if (conditions && !evaluateConditions(conditions, payload)) {
      // Conditions not met — log as skipped
      await db.automationLog.create({
        data: {
          automationId: automation.id,
          trigger: event,
          status: "skipped",
          message: "Conditions not met",
          payload: JSON.stringify(payload).slice(0, 2000),
        },
      });
      return;
    }

    // ── W3-3 (task 2-g): dry-run mode ────────────────────────────────────────
    // When automation.dryRun is true, log what we WOULD do but do NOT execute
    // the action. This lets a seller test an automation against live triggers
    // (e.g. ship a test order, watch the AutomationLog fill up with `dry_run`
    // entries describing what would have happened) without risking side
    // effects (WhatsApp sends, status updates, customer tagging).
    //
    // Dry-run logs do NOT count toward the destructive rate limit — a
    // dry-running automation can fire as often as its trigger allows.
    if (automation.dryRun === true) {
      const wouldDo = describeActionIntent(automation.action, config, payload, automation.steps);
      await db.automationLog.create({
        data: {
          automationId: automation.id,
          trigger: event,
          status: "dry_run",
          message: `DRY-RUN: would ${wouldDo}`,
          payload: JSON.stringify(payload).slice(0, 2000),
        },
      });
      // Don't increment runCount — a dry-run isn't a real execution.
      // (runCount is the seller-facing "how many times has this fired"
      //  metric; dry-runs would inflate it misleadingly.)
      logger.info("automation.dryRun", {
        automationId: automation.id,
        action: automation.action,
        wouldDo,
      });
      return;
    }

    // ── W3-3 (task 2-g): destructive-action rate-limit ──────────────────────
    // For destructive actions (cancel order, mark failed), cap executions at
    // DESTRUCTIVE_RATE_LIMIT_PER_MIN per automation. Prevents a runaway
    // trigger (e.g. a misconfigured condition that matches every page load)
    // from cancelling 100s of orders in a minute. Non-destructive actions
    // (send_whatsapp, tag_customer, send_notification, update_status to
    // non-terminal statuses) are NOT rate-limited.
    if (isDestructiveAction(automation.action, config)) {
      const rateLimited = await isDestructiveRateLimited(context, automation.id);
      if (rateLimited) {
        await db.automationLog.create({
          data: {
            automationId: automation.id,
            trigger: event,
            status: "rate_limited",
            message: `Rate-limited: ${DESTRUCTIVE_RATE_LIMIT_PER_MIN}/min cap for destructive action '${automation.action}' reached`,
            payload: JSON.stringify(payload).slice(0, 2000),
          },
        });
        // Don't increment runCount — a rate-limited skip isn't an execution.
        logger.warn("automation.rateLimited", {
          automationId: automation.id,
          action: automation.action,
        });
        return;
      }
    }

    // Phase 6: multi-step actions — if steps are defined, run each in order
    const steps = automation.steps ? JSON.parse(automation.steps) as string[] : null;
    if (steps && Array.isArray(steps) && steps.length > 0) {
      for (const step of steps) {
        const stepResult = await executeActionWithRetry(context, step, config, payload);
        if (stepResult.status === "failed") {
          // If a step fails, log + continue (don't block subsequent steps)
          logger.warn("automation.step.failed", { automationId: automation.id, step, error: stepResult.message });
        }
      }
      status = "success";
      message = `Executed ${steps.length} steps`;
    } else {
      const result = await executeActionWithRetry(context, automation.action, config, payload);
      status = result.status;
      message = result.message;
    }
  } catch (err) {
    status = "failed";
    message = err instanceof Error ? err.message : String(err);
  }

  // Log the execution
  try {
    await db.automationLog.create({
      data: {
        automationId: automation.id,
        trigger: event,
        status,
        message,
        payload: JSON.stringify(payload).slice(0, 2000),
      },
    });

    // Update the automation's run stats
    await db.automation.update({
      where: { id: automation.id },
      data: {
        runCount: { increment: 1 },
        lastRunAt: new Date(),
      },
    });
  } catch (err) {
    logger.error("automation.log.failed", {
      automationId: automation.id,
      error: String(err),
    });
  }
}

// ── Action executor with retry (Phase 6) ─────────────────────────────────────

async function executeActionWithRetry(
  context: ServiceContext,
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  maxRetries = 2,
): Promise<{ status: ExecutionStatus; message: string }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeAction(context, action, config, payload);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        logger.warn("automation.retry", { action, attempt: attempt + 1, error: lastError });
      }
    }
  }
  return { status: "failed", message: lastError ?? "Action failed after retries" };
}

// ── Action executors ─────────────────────────────────────────────────────────

async function executeAction(
  context: ServiceContext,
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  switch (action) {
    case "send_whatsapp":
      return executeSendWhatsapp(config, payload);

    case "send_notification":
      // In-app notifications are logged — the frontend can poll/display these
      return {
        status: "success",
        message: `Notification: ${config.messageTemplate ?? "Automation triggered"}`,
      };

    case "tag_customer":
      return executeTagCustomer(context, config, payload);

    case "update_status":
      return executeUpdateStatus(context, config, payload);

    default:
      return { status: "skipped", message: `Unknown action: ${action}` };
  }
}

/**
 * Send a WhatsApp message to the customer.
 *
 * This requires the WhatsApp sidecar (Baileys) to be running on port 3001.
 * If it's not connected, we log "skipped" rather than "failed" — the
 * automation is valid, it just can't execute right now.
 */
async function executeSendWhatsapp(
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  const phone = payload.customerPhone;
  if (!phone) {
    return { status: "skipped", message: "No customer phone in payload" };
  }

  // Replace template variables: {{customerName}}, {{orderNumber}}, {{totalPrice}}, {{wilaya}}
  // TODO(i18n, W2-8): the default fallback template is hardcoded English. The
  // proper fix is to either (a) load a locale-aware default via `getI18n()`
  // (server-side translation function — but it requires a Next.js request
  // context via `cookies()`, which is NOT available when automations are
  // dispatched from cron jobs / background services), or (b) move the default
  // to a Setting row (e.g. `whatsapp_default_template_<locale>`) that the
  // user can edit in the UI on the Automations page, with locale-aware
  // defaults pre-seeded in setupAuth. For now, this fallback only fires
  // when `config.messageTemplate` is unset (i.e. the user created an
  // automation without specifying a message — an edge case). Most users
  // set their own template via the Automations UI. Deferred to a follow-up
  // wave to avoid coupling the automation engine to the Next.js request
  // context (which would break cron-triggered dispatch).
  const template = config.messageTemplate ?? "Hello {{customerName}}, your order {{orderNumber}} has been updated.";
  const message = template
    .replace(/\{\{customerName\}\}/g, payload.customerName ?? "")
    .replace(/\{\{orderNumber\}\}/g, payload.orderNumber ?? "")
    .replace(/\{\{totalPrice\}\}/g, String(payload.totalPrice ?? ""))
    .replace(/\{\{wilaya\}\}/g, payload.wilaya ?? "");

  try {
    // Check if the WhatsApp sidecar is running
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    // Read the sidecar bearer token (written by the sidecar on startup)
    const token = process.env.SIDECAR_TOKEN ?? readSidecarTokenFile();
    const res = await fetch(`${WHATSAPP_SIDECAR_URL}/status`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return { status: "skipped", message: "WhatsApp sidecar not healthy" };
    }

    const health = (await res.json()) as { status?: string; connected?: boolean };
    // /status returns { status: "connected"|"connecting"|"disconnected", ... }
    const isConnected = health.connected ?? health.status === "connected";
    if (!isConnected) {
      return { status: "skipped", message: "WhatsApp not connected (scan QR code)" };
    }

    // Send the message
    // Sidecar expects { to, text } (not { phone, message }) + Bearer auth
    const sendToken = process.env.SIDECAR_TOKEN ?? readSidecarTokenFile();
    const sendRes = await fetch(`${WHATSAPP_SIDECAR_URL}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sendToken ? { Authorization: `Bearer ${sendToken}` } : {}),
      },
      body: JSON.stringify({ to: phone, text: message }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      // Session 30 (AUDIT-3 S6): throw on actual send failures so the
      // retry loop in executeActionWithRetry fires. Previously this returned
      // {status:"failed"} which the retry loop's catch block never saw.
      throw new Error(`WhatsApp send failed: ${err}`);
    }

    return { status: "success", message: `WhatsApp sent to ${phone}` };
  } catch (err) {
    // Session 30 (AUDIT-3 S6): distinguish "sidecar not running" (skip,
    // don't retry — the user needs to scan the QR code) from "send failed"
    // (throw, retry with backoff).
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
      // Sidecar not running — skip, don't retry (user action needed)
      return { status: "skipped", message: "WhatsApp sidecar is not running" };
    }
    // Actual send error — re-throw so retry fires
    throw err;
  }
}

/**
 * Add a note to the customer record.
 *
 * SV-M6: the notes read-modify-write is now wrapped in a `$transaction` so
 * two concurrent automations (e.g. order.delivered → tag_customer fires twice
 * in quick succession) don't lose writes. Previously: both read notes="X",
 * both append "\nTag1" / "\nTag2", both save → second save overwrites the
 * first → "Tag1" is lost. With the tx, the second read sees the first's
 * uncommitted write (Prisma's $transaction on SQLite uses BEGIN IMMEDIATE
 * for the batch form, but the interactive form also serializes via the
 * single writer lock).
 */
async function executeTagCustomer(
  context: ServiceContext,
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  if (!payload.customerId) {
    return { status: "skipped", message: "No customerId in payload" };
  }

  const noteText = config.noteText ?? `Tagged by automation: ${payload.orderNumber ?? ""}`;

  try {
    await context.prisma.$transaction(async (tx) => {
      // Re-read notes INSIDE the tx so we see any concurrent uncommitted writes.
      const customer = await tx.customer.findUnique({
        where: { id: payload.customerId! },
        select: { notes: true },
      });
      if (!customer) {
        // Can't throw — the caller expects a {status, message} response.
        // Throw a sentinel error we catch below to convert to "skipped".
        throw new TagCustomerNotFoundError();
      }
      const newNotes = customer.notes ? `${customer.notes}\n${noteText}` : noteText;
      await tx.customer.update({
        where: { id: payload.customerId! },
        data: { notes: newNotes },
      });
    });
  } catch (err) {
    if (err instanceof TagCustomerNotFoundError) {
      return { status: "skipped", message: "Customer not found" };
    }
    // Unexpected error — surface as failed so the retry loop fires.
    throw err;
  }

  return { status: "success", message: `Tagged customer: ${noteText}` };
}

/** Sentinel for the "customer not found" case inside executeTagCustomer's tx. */
class TagCustomerNotFoundError extends Error {
  constructor() {
    super("TagCustomerNotFound");
    this.name = "TagCustomerNotFoundError";
  }
}

/**
 * Update the order status (e.g. auto-confirm low-risk orders).
 */
async function executeUpdateStatus(
  context: ServiceContext,
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  if (!payload.orderId) {
    return { status: "skipped", message: "No orderId in payload" };
  }

  const targetStatus = config.targetStatus;
  if (!targetStatus) {
    return { status: "skipped", message: "No targetStatus in config" };
  }
  // Validate the target status is a real OrderStatus (config is JSON from DB)
  const VALID_STATUSES = ["draft", "pending", "confirmed", "shipped", "delivered", "returned", "refused", "cancelled", "failed"] as const;
  if (!VALID_STATUSES.includes(targetStatus as typeof VALID_STATUSES[number])) {
    return { status: "skipped", message: `Invalid target status: ${targetStatus}` };
  }

  // Route through orderService.updateStatus to enforce the state machine,
  // adjust stock, update customer stats, set timestamps, and fire triggers.
  // Dynamic import avoids a circular module-eval dependency (engine ← order-service ← engine).
  const { orderService } = await import("@/lib/data/order-service");
  try {
    await orderService.updateStatus(
      context,
      payload.orderId,
      targetStatus as import("@/types/domain").OrderStatus,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("transition") || msg.includes("Not Found")) {
      return { status: "skipped", message: `Cannot transition to ${targetStatus}: ${msg}` };
    }
    return { status: "failed", message: `Status update failed: ${msg}` };
  }

  return { status: "success", message: `Order ${payload.orderNumber} → ${targetStatus}` };
}
