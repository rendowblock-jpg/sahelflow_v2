import "server-only";

import { existsSync, readFileSync } from "fs";

import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import { redactPii } from "@/lib/redact-pii";
import { evaluateConditions, type ConditionGroup } from "./conditions";

const WHATSAPP_SIDECAR_URL =
  process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";
const WHATSAPP_STATUS_TIMEOUT_MS = 3_000;
const WHATSAPP_SEND_TIMEOUT_MS = 12_000;
const AMBIGUOUS_EFFECT_PREFIX = "AMBIGUOUS_EFFECT:";

function readSidecarTokenFile(): string | undefined {
  try {
    const tokenFile =
      process.env.SIDECAR_TOKEN_FILE || "/tmp/sahelflow-sidecar-token";
    if (existsSync(tokenFile)) return readFileSync(tokenFile, "utf-8").trim();
  } catch {
    // Missing token is handled by the sidecar response.
  }
  return undefined;
}

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

interface AutomationRecord {
  id: string;
  name: string;
  action: string;
  config: string | null;
  conditions?: string | null;
  steps?: string | null;
  dryRun?: boolean | null;
}

export interface AutomationExecutionReceipt {
  automationId: string;
  status: ExecutionStatus;
  message: string | null;
}

export interface SelectedAutomationDispatchOptions {
  automationIds: readonly string[];
  signal?: AbortSignal;
  durableReceipt?: string;
}

function terminalSkip(message: string | null): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  return [
    "conditions not met",
    "no customer phone",
    "no customerid",
    "no orderid",
    "no targetstatus",
    "invalid target status",
    "confirmation requires trusted manual approval",
    "unknown action:",
    "customer not found",
  ].some((prefix) => normalized.startsWith(prefix));
}

function retryableResult(result: {
  status: ExecutionStatus;
  message: string | null;
}): boolean {
  if (result.status === "failed" || result.status === "rate_limited") return true;
  return result.status === "skipped" && !terminalSkip(result.message);
}

export async function dispatchSelectedAutomations(
  context: ServiceContext,
  event: TriggerEvent,
  payload: TriggerPayload,
  options: SelectedAutomationDispatchOptions,
): Promise<AutomationExecutionReceipt[]> {
  if (options.automationIds.length === 0) return [];
  if (options.signal?.aborted) throw new Error("Automation dispatch aborted");

  const automations = await context.prisma.automation.findMany({
    where: {
      id: { in: [...options.automationIds] },
      trigger: event,
      isActive: true,
    },
  });
  if (automations.length === 0) return [];

  logger.info("automation.dispatch.selected", {
    event,
    count: automations.length,
  });

  return Promise.all(
    automations.map((automation) =>
      executeAutomation(context, automation, event, payload, {
        signal: options.signal,
        durableReceipt: options.durableReceipt,
        strictPersistence: true,
      }),
    ),
  );
}

export async function dispatchTrigger(
  context: ServiceContext,
  event: TriggerEvent,
  payload: TriggerPayload,
): Promise<void> {
  try {
    const automations = await context.prisma.automation.findMany({
      where: { trigger: event, isActive: true },
      select: { id: true },
    });
    if (automations.length === 0) return;
    await dispatchSelectedAutomations(context, event, payload, {
      automationIds: automations.map((automation) => automation.id),
    });
  } catch (error) {
    logger.error("automation.dispatch.failed", {
      event,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

type LowStockQueryClient = {
  product: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
};

interface LowStockProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
}

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
    if (!product || product.stock > product.lowStockThreshold) return null;
    return product;
  } catch (error) {
    logger.error("automation.lowStockCheck.failed", {
      productId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function dispatchLowStock(
  context: ServiceContext,
  product: LowStockProductRow,
): void {
  void dispatchTrigger(context, "stock.low", {
    productId: product.id,
    productName: product.name,
    stockLevel: product.stock,
    lowStockThreshold: product.lowStockThreshold,
  });
}

export async function checkAndDispatchLowStock(
  context: ServiceContext,
  tx: LowStockQueryClient,
  productId: string,
): Promise<void> {
  const product = await detectLowStock(tx, productId);
  if (product) dispatchLowStock(context, product);
}

const DESTRUCTIVE_TARGET_STATUSES = new Set(["cancelled", "failed"]);
const DESTRUCTIVE_RATE_LIMIT_PER_MIN = 10;

function isDestructiveAction(
  action: string,
  config: AutomationConfig,
): boolean {
  if (action !== "update_status") return false;
  const target = config.targetStatus;
  return typeof target === "string" && DESTRUCTIVE_TARGET_STATUSES.has(target);
}

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

function describeActionIntent(
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  stepsRaw?: string | null,
): string {
  if (stepsRaw) {
    try {
      const steps = JSON.parse(stepsRaw);
      if (Array.isArray(steps) && steps.length > 0) {
        return `run ${steps.length} steps: [${steps.join(", ")}]`;
      }
    } catch {
      // Fall through to the single-action description.
    }
  }

  switch (action) {
    case "send_whatsapp": {
      const phone = payload.customerPhone ?? "(no phone)";
      const template = config.messageTemplate ?? "(default template)";
      const preview = template.length > 40 ? `${template.slice(0, 40)}...` : template;
      return `send WhatsApp to ${phone} ('${preview}')`;
    }
    case "update_status":
      return `update order ${payload.orderNumber ?? payload.orderId ?? "(no order)"} status → ${config.targetStatus ?? "(unset)"}`;
    case "tag_customer":
      return `tag customer '${payload.customerName ?? payload.customerId ?? "(unknown)"}' with note '${config.noteText ?? "(default tag)"}'`;
    case "send_notification":
      return `send in-app notification ('${config.messageTemplate ?? "Automation triggered"}')`;
    default:
      return `execute action '${action}'`;
  }
}

interface ExecuteAutomationOptions {
  signal?: AbortSignal;
  durableReceipt?: string;
  strictPersistence?: boolean;
}

function durableAutomationPayload(payload: TriggerPayload): TriggerPayload {
  const redacted = redactPii(payload);
  for (const receiptKey of [
    "__sahelflowOutboxReceipt",
    "__sahelflowOutboxStepReceipt",
  ]) {
    const value = payload[receiptKey];
    if (typeof value === "string") redacted[receiptKey] = value;
  }
  return redacted;
}

async function persistAutomationLog(
  context: ServiceContext,
  automationId: string,
  trigger: string,
  result: { status: ExecutionStatus; message: string | null },
  payload: TriggerPayload,
  options: { incrementRunCount: boolean; strict: boolean },
): Promise<void> {
  try {
    await context.prisma.automationLog.create({
      data: {
        automationId,
        trigger,
        status: result.status,
        message: result.message === null ? null : redactPii(result.message),
        payload: JSON.stringify(durableAutomationPayload(payload)).slice(0, 2000),
      },
    });
    if (options.incrementRunCount) {
      await context.prisma.automation.update({
        where: { id: automationId },
        data: {
          runCount: { increment: 1 },
          lastRunAt: new Date(),
        },
      });
    }
  } catch (error) {
    logger.error("automation.log.failed", {
      automationId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (options.strict) throw error;
  }
}

async function readDurableStepReceipt(
  context: ServiceContext,
  automationId: string,
  trigger: string,
  durableReceipt: string,
): Promise<{ status: ExecutionStatus; message: string | null } | null> {
  const row = await context.prisma.automationLog.findFirst({
    where: {
      automationId,
      trigger,
      payload: { contains: durableReceipt },
    },
    select: { status: true, message: true },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    status: row.status as ExecutionStatus,
    message: row.message,
  };
}

async function executeAutomation(
  context: ServiceContext,
  automation: AutomationRecord,
  event: string,
  payload: TriggerPayload,
  options: ExecuteAutomationOptions = {},
): Promise<AutomationExecutionReceipt> {
  const strict = options.strictPersistence === true;
  let result: { status: ExecutionStatus; message: string | null } = {
    status: "success",
    message: null,
  };
  let incrementRunCount = true;

  try {
    if (options.signal?.aborted) throw new Error("Automation dispatch aborted");
    const config: AutomationConfig = automation.config
      ? JSON.parse(automation.config)
      : {};
    const conditions: ConditionGroup | null = automation.conditions
      ? JSON.parse(automation.conditions)
      : null;

    if (conditions && !evaluateConditions(conditions, payload)) {
      result = { status: "skipped", message: "Conditions not met" };
      incrementRunCount = false;
    } else if (automation.dryRun === true) {
      const wouldDo = describeActionIntent(
        automation.action,
        config,
        payload,
        automation.steps,
      );
      result = {
        status: "dry_run",
        message: `DRY-RUN: would ${wouldDo}`,
      };
      incrementRunCount = false;
      logger.info("automation.dryRun", {
        automationId: automation.id,
        action: automation.action,
        wouldDo: redactPii(wouldDo),
      });
    } else if (
      isDestructiveAction(automation.action, config) &&
      (await isDestructiveRateLimited(context, automation.id))
    ) {
      result = {
        status: "rate_limited",
        message: `Rate-limited: ${DESTRUCTIVE_RATE_LIMIT_PER_MIN}/min cap for destructive action '${automation.action}' reached`,
      };
      incrementRunCount = false;
      logger.warn("automation.rateLimited", {
        automationId: automation.id,
        action: automation.action,
      });
    } else {
      const steps = automation.steps
        ? (JSON.parse(automation.steps) as string[])
        : null;
      if (steps && Array.isArray(steps) && steps.length > 0) {
        let firstTerminalSkip: string | null = null;
        for (let index = 0; index < steps.length; index += 1) {
          const step = steps[index]!;
          const stepTrigger = `${event}:step:${index}`;
          if (options.durableReceipt) {
            const prior = await readDurableStepReceipt(
              context,
              automation.id,
              stepTrigger,
              options.durableReceipt,
            );
            if (prior && !retryableResult(prior)) {
              if (prior.status === "skipped" && firstTerminalSkip === null) {
                firstTerminalSkip = prior.message;
              }
              continue;
            }
          }

          const stepResult = await executeActionWithRetry(
            context,
            step,
            config,
            payload,
            2,
            options.signal,
          );
          if (options.durableReceipt) {
            await persistAutomationLog(
              context,
              automation.id,
              stepTrigger,
              stepResult,
              {
                ...payload,
                __sahelflowOutboxStepReceipt: options.durableReceipt,
                __sahelflowOutboxStepIndex: index,
              },
              { incrementRunCount: false, strict },
            );
          }

          if (retryableResult(stepResult)) {
            result = {
              status: stepResult.status,
              message: `Step ${index + 1} '${step}': ${stepResult.message}`,
            };
            break;
          }
          if (stepResult.status === "skipped" && firstTerminalSkip === null) {
            firstTerminalSkip = stepResult.message;
          }
        }

        if (!retryableResult(result)) {
          result = firstTerminalSkip
            ? { status: "skipped", message: firstTerminalSkip }
            : { status: "success", message: `Executed ${steps.length} steps` };
        }
      } else {
        result = await executeActionWithRetry(
          context,
          automation.action,
          config,
          payload,
          2,
          options.signal,
        );
      }
    }
  } catch (error) {
    result = {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  await persistAutomationLog(
    context,
    automation.id,
    event,
    result,
    payload,
    { incrementRunCount, strict },
  );
  return {
    automationId: automation.id,
    status: result.status,
    message: result.message,
  };
}

async function delayWithSignal(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    return;
  }
  if (signal.aborted) throw new Error("Automation dispatch aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Automation dispatch aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function executeActionWithRetry(
  context: ServiceContext,
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  maxRetries = 2,
  signal?: AbortSignal,
): Promise<{ status: ExecutionStatus; message: string }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (signal?.aborted) throw new Error("Automation dispatch aborted");
      return await executeAction(context, action, config, payload, signal);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (
        lastError.startsWith(AMBIGUOUS_EFFECT_PREFIX) ||
        signal?.aborted
      ) {
        break;
      }
      if (attempt < maxRetries) {
        await delayWithSignal(500 * Math.pow(2, attempt), signal);
        logger.warn("automation.retry", {
          action,
          attempt: attempt + 1,
          error: redactPii(lastError),
        });
      }
    }
  }
  return {
    status: "failed",
    message: lastError ?? "Action failed after retries",
  };
}

async function executeAction(
  context: ServiceContext,
  action: string,
  config: AutomationConfig,
  payload: TriggerPayload,
  signal?: AbortSignal,
): Promise<{ status: ExecutionStatus; message: string }> {
  switch (action) {
    case "send_whatsapp":
      return executeSendWhatsapp(config, payload, signal);
    case "send_notification":
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

function linkedAbortController(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutFired = false;
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }
  const timeout = setTimeout(() => {
    timeoutFired = true;
    controller.abort(new Error("Automation provider timeout"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeoutFired,
    cleanup: () => {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onParentAbort);
    },
  };
}

async function executeSendWhatsapp(
  config: AutomationConfig,
  payload: TriggerPayload,
  signal?: AbortSignal,
): Promise<{ status: ExecutionStatus; message: string }> {
  const phone = payload.customerPhone;
  if (!phone) {
    return { status: "skipped", message: "No customer phone in payload" };
  }

  const template =
    config.messageTemplate ??
    "Hello {{customerName}}, your order {{orderNumber}} has been updated.";
  const message = template
    .replace(/\{\{customerName\}\}/g, payload.customerName ?? "")
    .replace(/\{\{orderNumber\}\}/g, payload.orderNumber ?? "")
    .replace(/\{\{totalPrice\}\}/g, String(payload.totalPrice ?? ""))
    .replace(/\{\{wilaya\}\}/g, payload.wilaya ?? "");
  const token = process.env.SIDECAR_TOKEN ?? readSidecarTokenFile();

  const statusAbort = linkedAbortController(signal, WHATSAPP_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_SIDECAR_URL}/status`, {
      signal: statusAbort.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      return { status: "skipped", message: "WhatsApp sidecar not healthy" };
    }
    const health = (await response.json()) as {
      status?: string;
      connected?: boolean;
    };
    const connected = health.connected ?? health.status === "connected";
    if (!connected) {
      return {
        status: "skipped",
        message: "WhatsApp not connected (scan QR code)",
      };
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (statusAbort.timedOut() || messageText.includes("aborted")) {
      return {
        status: "skipped",
        message: "WhatsApp sidecar is not running",
      };
    }
    if (
      messageText.includes("fetch failed") ||
      messageText.includes("ECONNREFUSED")
    ) {
      return {
        status: "skipped",
        message: "WhatsApp sidecar is not running",
      };
    }
    throw error;
  } finally {
    statusAbort.cleanup();
  }

  if (signal?.aborted) throw new Error("Automation dispatch aborted");
  const sendAbort = linkedAbortController(signal, WHATSAPP_SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_SIDECAR_URL}/send`, {
      method: "POST",
      signal: sendAbort.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        to: phone,
        text: message,
        idempotencyKey:
          typeof payload.__sahelflowOutboxReceipt === "string"
            ? payload.__sahelflowOutboxReceipt
            : undefined,
      }),
    });
    if (!response.ok) {
      throw new Error(`WhatsApp send failed: ${await response.text()}`);
    }
    return { status: "success", message: `WhatsApp sent to ${phone}` };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (
      sendAbort.timedOut() ||
      signal?.aborted ||
      messageText.includes("aborted")
    ) {
      throw new Error(
        `${AMBIGUOUS_EFFECT_PREFIX} WhatsApp send timed out or was interrupted; manual reconciliation required`,
      );
    }
    throw error;
  } finally {
    sendAbort.cleanup();
  }
}

async function executeTagCustomer(
  context: ServiceContext,
  config: AutomationConfig,
  payload: TriggerPayload,
): Promise<{ status: ExecutionStatus; message: string }> {
  if (!payload.customerId) {
    return { status: "skipped", message: "No customerId in payload" };
  }
  const noteText =
    config.noteText ?? `Tagged by automation: ${payload.orderNumber ?? ""}`;
  try {
    await context.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: payload.customerId! },
        select: { notes: true },
      });
      if (!customer) throw new TagCustomerNotFoundError();
      const newNotes = customer.notes
        ? `${customer.notes}\n${noteText}`
        : noteText;
      await tx.customer.update({
        where: { id: payload.customerId! },
        data: { notes: newNotes },
      });
    });
  } catch (error) {
    if (error instanceof TagCustomerNotFoundError) {
      return { status: "skipped", message: "Customer not found" };
    }
    throw error;
  }
  return { status: "success", message: `Tagged customer: ${noteText}` };
}

class TagCustomerNotFoundError extends Error {
  constructor() {
    super("TagCustomerNotFound");
    this.name = "TagCustomerNotFoundError";
  }
}

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
  if (targetStatus === "confirmed") {
    return {
      status: "skipped",
      message: "Confirmation requires trusted manual approval",
    };
  }
  const validStatuses = [
    "draft",
    "pending",
    "shipped",
    "delivered",
    "returned",
    "refused",
    "cancelled",
    "failed",
  ] as const;
  if (!validStatuses.includes(targetStatus as (typeof validStatuses)[number])) {
    return {
      status: "skipped",
      message: `Invalid target status: ${targetStatus}`,
    };
  }

  const { orderService } = await import("@/lib/data/order-service");
  try {
    await orderService.updateStatus(
      context,
      payload.orderId,
      targetStatus as import("@/types/domain").OrderStatus,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("transition") || message.includes("Not Found")) {
      return {
        status: "skipped",
        message: `Cannot transition to ${targetStatus}: ${message}`,
      };
    }
    return { status: "failed", message: `Status update failed: ${message}` };
  }
  return {
    status: "success",
    message: `Order ${payload.orderNumber} → ${targetStatus}`,
  };
}
