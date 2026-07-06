/**
 * Automations engine — trigger dispatcher + action executor.
 *
 * This is the "brain" that listens to business events (order created,
 * order delivered, etc.) and fires any active automations that match
 * the trigger.
 *
 * Flow:
 *   1. A business action (e.g. orderService.updateStatus) calls
 *      dispatchTrigger("order.delivered", { orderId, customerId, ... })
 *   2. The engine loads all active automations with trigger === "order.delivered"
 *   3. For each automation, it executes the action (send_whatsapp, tag_customer, etc.)
 *   4. It logs the result (success/failed/skipped) to AutomationLog
 *   5. It increments the automation's runCount + updates lastRunAt
 *
 * All execution is fire-and-forget (void) — it never blocks the calling
 * business operation. Failures are logged, not thrown.
 */
import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { evaluateConditions, type ConditionGroup } from "./conditions";

import { readFileSync, existsSync } from "fs";

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

export type ExecutionStatus = "success" | "failed" | "skipped";

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
  event: TriggerEvent,
  payload: TriggerPayload,
): Promise<void> {
  try {
    const automations = await db.automation.findMany({
      where: { trigger: event, isActive: true },
    });

    if (automations.length === 0) return;

    logger.info("automation.dispatch", { event, count: automations.length });

    // Execute all matching automations in parallel
    await Promise.allSettled(
      automations.map((auto) => executeAutomation(auto, event, payload)),
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
 * below its `lowStockThreshold`. If so, dispatch the `stock.low` trigger so
 * any matching automation (e.g. "send notification on low stock") can fire.
 *
 * Call this from inside a `$transaction` callback right after the stock
 * decrement/increment — the supplied `tx` lets the read see the same row
 * state as the caller's transaction (race-safe detection). Outside a tx,
 * pass the regular `db` client (e.g. from `productService.update`).
 *
 * The caller should `await` this helper so the read completes inside the
 * transaction (race-safe). The actual `dispatchTrigger` call inside is
 * `void`-ed — fire-and-forget, never blocks the caller, never throws. This
 * matches the pattern of the existing `order.*` dispatches in
 * `order-service.ts` (the dispatch itself is fire-and-forget).
 */
export async function checkAndDispatchLowStock(
  tx: LowStockQueryClient,
  productId: string,
): Promise<void> {
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
    if (!product) return;
    // Only fire when stock is at or below the threshold — restoration that
    // pushes stock back above the threshold will NOT re-fire (the product is
    // no longer low).
    if (product.stock > product.lowStockThreshold) return;

    void dispatchTrigger("stock.low", {
      productId: product.id,
      productName: product.name,
      stockLevel: product.stock,
      lowStockThreshold: product.lowStockThreshold,
    });
  } catch (err) {
    // Never let the low-stock check bubble up to the business operation.
    logger.error("automation.lowStockCheck.failed", {
      productId,
      error: String(err),
    });
  }
}

// ── Single automation execution ──────────────────────────────────────────────

async function executeAutomation(
  automation: {
    id: string;
    name: string;
    action: string;
    config: string | null;
    conditions?: string | null;
    steps?: string | null;
  },
  event: string,
  payload: TriggerPayload,
): Promise<void> {
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

    // Phase 6: multi-step actions — if steps are defined, run each in order
    const steps = automation.steps ? JSON.parse(automation.steps) as string[] : null;
    if (steps && Array.isArray(steps) && steps.length > 0) {
      for (const step of steps) {
        const stepResult = await executeActionWithRetry(step, config, payload);
        if (stepResult.status === "failed") {
          // If a step fails, log + continue (don't block subsequent steps)
          logger.warn("automation.step.failed", { automationId: automation.id, step, error: stepResult.message });
        }
      }
      status = "success";
      message = `Executed ${steps.length} steps`;
    } else {
      const result = await executeActionWithRetry(automation.action, config, payload);
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
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  maxRetries = 2,
): Promise<{ status: ExecutionStatus; message: string }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeAction(action, config, payload);
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
      return executeTagCustomer(config, payload);

    case "update_status":
      return executeUpdateStatus(config, payload);

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
    const res = await fetch("http://127.0.0.1:3001/status", {
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
    const sendRes = await fetch("http://127.0.0.1:3001/send", {
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
      return { status: "skipped", message: "WhatsApp sidecar not running (port 3001)" };
    }
    // Actual send error — re-throw so retry fires
    throw err;
  }
}

/**
 * Add a note to the customer record.
 */
async function executeTagCustomer(
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  if (!payload.customerId) {
    return { status: "skipped", message: "No customerId in payload" };
  }

  const noteText = config.noteText ?? `Tagged by automation: ${payload.orderNumber ?? ""}`;
  const customer = await db.customer.findUnique({
    where: { id: payload.customerId },
    select: { notes: true },
  });

  if (!customer) {
    return { status: "skipped", message: "Customer not found" };
  }

  const newNotes = customer.notes ? `${customer.notes}\n${noteText}` : noteText;
  await db.customer.update({
    where: { id: payload.customerId },
    data: { notes: newNotes },
  });

  return { status: "success", message: `Tagged customer: ${noteText}` };
}

/**
 * Update the order status (e.g. auto-confirm low-risk orders).
 */
async function executeUpdateStatus(
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
    await orderService.updateStatus({ prisma: db }, payload.orderId, targetStatus as import("@/types/domain").OrderStatus);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("transition") || msg.includes("Not Found")) {
      return { status: "skipped", message: `Cannot transition to ${targetStatus}: ${msg}` };
    }
    return { status: "failed", message: `Status update failed: ${msg}` };
  }

  return { status: "success", message: `Order ${payload.orderNumber} → ${targetStatus}` };
}
