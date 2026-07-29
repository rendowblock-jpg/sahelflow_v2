import "server-only";

import { existsSync, readFileSync } from "node:fs";

import { evaluateConditions, type ConditionGroup } from "@/lib/automations/conditions";
import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import { redactPii } from "@/lib/redact-pii";
import type { OrderStatus } from "@/types/domain";
import type { FrozenAutomationSnapshot } from "./automation-outbox";

const WHATSAPP_SIDECAR_URL =
  process.env.WHATSAPP_SIDECAR_URL ?? "http://127.0.0.1:3001";
const WHATSAPP_STATUS_TIMEOUT_MS = 3_000;
const WHATSAPP_SEND_TIMEOUT_MS = 12_000;
export const AMBIGUOUS_AUTOMATION_EFFECT_PREFIX = "AMBIGUOUS_EFFECT:";

export type FrozenAutomationStatus =
  | "success"
  | "failed"
  | "skipped"
  | "dry_run"
  | "rate_limited";

export interface FrozenAutomationResult {
  status: FrozenAutomationStatus;
  message: string | null;
}

export interface FrozenAutomationExecutionOptions {
  onEffectStart?: () => Promise<void>;
}

interface AutomationConfig {
  messageTemplate?: string;
  targetStatus?: string;
  noteText?: string;
  [key: string]: unknown;
}

type EffectStarter = () => Promise<void>;

function readSidecarTokenFile(): string | undefined {
  try {
    const tokenFile =
      process.env.SIDECAR_TOKEN_FILE || "/tmp/sahelflow-sidecar-token";
    if (existsSync(tokenFile)) return readFileSync(tokenFile, "utf8").trim();
  } catch {
    // Provider health remains the authority.
  }
  return undefined;
}

function terminalSkip(message: string | null): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  return [
    "conditions not met",
    "invalid frozen automation snapshot",
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

export function isRetryableFrozenAutomationResult(
  result: FrozenAutomationResult,
): boolean {
  if (result.status === "failed" || result.status === "rate_limited") return true;
  return result.status === "skipped" && !terminalSkip(result.message);
}

function linkedAbortController(timeoutMs: number): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timeoutFired = false;
  const timeout = setTimeout(() => {
    timeoutFired = true;
    controller.abort(new Error("Automation provider timeout"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeoutFired,
    cleanup: () => clearTimeout(timeout),
  };
}

function authHeaders(): Record<string, string> {
  const token = process.env.SIDECAR_TOKEN ?? readSidecarTokenFile();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function executeSendWhatsapp(
  config: AutomationConfig,
  payload: Record<string, unknown>,
  effectKey: string,
  startEffect: EffectStarter,
): Promise<FrozenAutomationResult> {
  const phone =
    typeof payload.customerPhone === "string" ? payload.customerPhone : "";
  if (!phone) {
    return { status: "skipped", message: "No customer phone in payload" };
  }

  const template =
    typeof config.messageTemplate === "string"
      ? config.messageTemplate
      : "Hello {{customerName}}, your order {{orderNumber}} has been updated.";
  const text = template
    .replace(/\{\{customerName\}\}/g, String(payload.customerName ?? ""))
    .replace(/\{\{orderNumber\}\}/g, String(payload.orderNumber ?? ""))
    .replace(/\{\{totalPrice\}\}/g, String(payload.totalPrice ?? ""))
    .replace(/\{\{wilaya\}\}/g, String(payload.wilaya ?? ""));
  const headers = authHeaders();

  const healthAbort = linkedAbortController(WHATSAPP_STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_SIDECAR_URL}/status`, {
      signal: healthAbort.signal,
      headers,
    });
    if (!response.ok) {
      return { status: "skipped", message: "WhatsApp sidecar not healthy" };
    }
    const health = (await response.json()) as {
      status?: string;
      connected?: boolean;
    };
    if (!(health.connected ?? health.status === "connected")) {
      return {
        status: "skipped",
        message: "WhatsApp not connected (scan QR code)",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      healthAbort.timedOut() ||
      message.includes("aborted") ||
      message.includes("fetch failed") ||
      message.includes("ECONNREFUSED")
    ) {
      return { status: "skipped", message: "WhatsApp sidecar is not running" };
    }
    throw error;
  } finally {
    healthAbort.cleanup();
  }

  await startEffect();
  const sendAbort = linkedAbortController(WHATSAPP_SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`${WHATSAPP_SIDECAR_URL}/send`, {
      method: "POST",
      signal: sendAbort.signal,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ to: phone, text, idempotencyKey: effectKey }),
    });
    const detail = await response.text();
    if (!response.ok) {
      let ambiguous = false;
      try {
        ambiguous =
          (JSON.parse(detail) as { ambiguous?: boolean }).ambiguous === true;
      } catch {
        ambiguous = detail.includes('"ambiguous":true');
      }
      if (ambiguous) {
        throw new Error(
          `${AMBIGUOUS_AUTOMATION_EFFECT_PREFIX} WhatsApp provider receipt requires reconciliation`,
        );
      }
      throw new Error(`WhatsApp send failed: ${detail}`);
    }
    return { status: "success", message: `WhatsApp sent to ${phone}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes(AMBIGUOUS_AUTOMATION_EFFECT_PREFIX) ||
      sendAbort.timedOut() ||
      message.includes("aborted")
    ) {
      throw new Error(
        message.includes(AMBIGUOUS_AUTOMATION_EFFECT_PREFIX)
          ? message
          : `${AMBIGUOUS_AUTOMATION_EFFECT_PREFIX} WhatsApp send may have committed; manual reconciliation required`,
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
  payload: Record<string, unknown>,
  effectKey: string,
  startEffect: EffectStarter,
): Promise<FrozenAutomationResult> {
  const customerId =
    typeof payload.customerId === "string" ? payload.customerId : "";
  if (!customerId) {
    return { status: "skipped", message: "No customerId in payload" };
  }
  const noteText =
    typeof config.noteText === "string"
      ? config.noteText
      : `Tagged by automation: ${String(payload.orderNumber ?? "")}`;

  const existing = await context.prisma.auditLog.findFirst({
    where: {
      action: "automation.tag_customer.applied",
      entity: "customer",
      entityId: customerId,
      metadata: { contains: effectKey },
    },
    select: { id: true },
  });
  if (existing) {
    return { status: "success", message: "Customer tag already applied" };
  }

  await startEffect();
  const outcome = await context.prisma.$transaction(async (tx) => {
    const receipt = await tx.auditLog.findFirst({
      where: {
        action: "automation.tag_customer.applied",
        entity: "customer",
        entityId: customerId,
        metadata: { contains: effectKey },
      },
      select: { id: true },
    });
    if (receipt) return "replayed" as const;

    const customer = await tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { notes: true },
    });
    if (!customer) return "missing" as const;

    await tx.customer.update({
      where: { id: customerId },
      data: {
        notes: customer.notes ? `${customer.notes}\n${noteText}` : noteText,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "automation.tag_customer.applied",
        entity: "customer",
        entityId: customerId,
        actor: "automation",
        after: JSON.stringify({ noteAppended: true }),
        metadata: JSON.stringify({ effectKey }),
      },
    });
    return "applied" as const;
  });

  if (outcome === "missing") {
    return { status: "skipped", message: "Customer not found" };
  }
  return {
    status: "success",
    message:
      outcome === "replayed"
        ? "Customer tag already applied"
        : `Tagged customer: ${noteText}`,
  };
}

async function executeUpdateStatus(
  context: ServiceContext,
  config: AutomationConfig,
  payload: Record<string, unknown>,
  startEffect: EffectStarter,
): Promise<FrozenAutomationResult> {
  const orderId = typeof payload.orderId === "string" ? payload.orderId : "";
  if (!orderId) return { status: "skipped", message: "No orderId in payload" };
  const targetStatus =
    typeof config.targetStatus === "string" ? config.targetStatus : "";
  if (!targetStatus) {
    return { status: "skipped", message: "No targetStatus in config" };
  }
  if (targetStatus === "confirmed") {
    return {
      status: "skipped",
      message: "Confirmation requires trusted manual approval",
    };
  }
  const valid = new Set<OrderStatus>([
    "draft",
    "pending",
    "shipped",
    "delivered",
    "returned",
    "refused",
    "cancelled",
  ]);
  if (!valid.has(targetStatus as OrderStatus)) {
    return { status: "skipped", message: `Invalid target status: ${targetStatus}` };
  }

  await startEffect();
  const { orderService } = await import("@/lib/data/order-service");
  try {
    await orderService.updateStatus(context, orderId, targetStatus as OrderStatus, {
      actor: "automation",
    });
    return {
      status: "success",
      message: `Order ${String(payload.orderNumber ?? orderId)} → ${targetStatus}`,
    };
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
}

async function executeAction(
  context: ServiceContext,
  action: string,
  config: AutomationConfig,
  payload: Record<string, unknown>,
  effectKey: string,
  startEffect: EffectStarter,
): Promise<FrozenAutomationResult> {
  switch (action) {
    case "send_whatsapp":
      return executeSendWhatsapp(config, payload, effectKey, startEffect);
    case "send_notification":
      return {
        status: "success",
        message: `Notification: ${String(
          config.messageTemplate ?? "Automation triggered",
        )}`,
      };
    case "tag_customer":
      return executeTagCustomer(
        context,
        config,
        payload,
        effectKey,
        startEffect,
      );
    case "update_status":
      return executeUpdateStatus(context, config, payload, startEffect);
    default:
      return { status: "skipped", message: `Unknown action: ${action}` };
  }
}

async function persistBestEffortLog(
  context: ServiceContext,
  automation: FrozenAutomationSnapshot,
  trigger: string,
  payload: Record<string, unknown>,
  result: FrozenAutomationResult,
  effectKey: string,
): Promise<void> {
  try {
    const exists = await context.prisma.automation.findUnique({
      where: { id: automation.id },
      select: { id: true },
    });
    if (!exists) return;

    const prior = await context.prisma.automationLog.findFirst({
      where: {
        automationId: automation.id,
        trigger,
        payload: { contains: effectKey },
      },
      select: { id: true },
    });
    if (prior) return;

    const durablePayload = {
      ...redactPii(payload),
      __sahelflowEffectKey: effectKey,
    };
    await context.prisma.$transaction([
      context.prisma.automationLog.create({
        data: {
          automationId: automation.id,
          trigger,
          status: result.status,
          message: result.message === null ? null : redactPii(result.message),
          payload: JSON.stringify(durablePayload).slice(0, 2000),
        },
      }),
      context.prisma.automation.update({
        where: { id: automation.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      }),
    ]);
  } catch (error) {
    logger.error("automation.frozen-log.failed", {
      automationId: automation.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseSnapshotJson<T>(
  value: string | null,
  fallback: T,
): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export async function executeFrozenAutomation(
  context: ServiceContext,
  trigger: string,
  payload: Record<string, unknown>,
  automation: FrozenAutomationSnapshot,
  effectKey: string,
  options: FrozenAutomationExecutionOptions = {},
): Promise<FrozenAutomationResult> {
  let effectStarted = false;
  const startEffect = async (): Promise<void> => {
    if (effectStarted) return;
    await options.onEffectStart?.();
    effectStarted = true;
  };

  let config: AutomationConfig;
  let conditions: ConditionGroup | null;
  let steps: string[] | null;
  try {
    config = parseSnapshotJson<AutomationConfig>(automation.config, {});
    conditions = parseSnapshotJson<ConditionGroup | null>(
      automation.conditions,
      null,
    );
    steps = parseSnapshotJson<string[] | null>(automation.steps, null);
  } catch (error) {
    const result: FrozenAutomationResult = {
      status: "skipped",
      message: `Invalid frozen automation snapshot: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
    await persistBestEffortLog(
      context,
      automation,
      trigger,
      payload,
      result,
      effectKey,
    );
    return result;
  }

  let result: FrozenAutomationResult;
  if (conditions && !evaluateConditions(conditions, payload)) {
    result = { status: "skipped", message: "Conditions not met" };
  } else if (automation.dryRun) {
    result = { status: "dry_run", message: `DRY-RUN: ${automation.action}` };
  } else if (Array.isArray(steps) && steps.length > 0) {
    let completedEffect = false;
    let terminalSkipMessage: string | null = null;
    result = { status: "success", message: `Executed ${steps.length} steps` };
    for (let index = 0; index < steps.length; index += 1) {
      const stepResult = await executeAction(
        context,
        steps[index]!,
        config,
        payload,
        `${effectKey}:step:${index}`,
        startEffect,
      );
      if (isRetryableFrozenAutomationResult(stepResult)) {
        if (completedEffect) {
          throw new Error(
            `${AMBIGUOUS_AUTOMATION_EFFECT_PREFIX} a prior automation step committed before step ${
              index + 1
            } became retryable`,
          );
        }
        result = stepResult;
        break;
      }
      if (stepResult.status === "success") completedEffect = true;
      if (
        stepResult.status === "skipped" &&
        terminalSkipMessage === null
      ) {
        terminalSkipMessage = stepResult.message;
      }
    }
    if (!isRetryableFrozenAutomationResult(result) && terminalSkipMessage) {
      result = { status: "skipped", message: terminalSkipMessage };
    }
  } else {
    result = await executeAction(
      context,
      automation.action,
      config,
      payload,
      effectKey,
      startEffect,
    );
  }

  await persistBestEffortLog(
    context,
    automation,
    trigger,
    payload,
    result,
    effectKey,
  );
  return result;
}
