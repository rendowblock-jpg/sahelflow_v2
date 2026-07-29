import "server-only";

import { z } from "zod";

import {
  dispatchSelectedAutomations,
  type TriggerEvent,
} from "@/lib/automations/engine";
import type { ServiceContext } from "@/lib/data/service-base";
import { logger } from "@/lib/logger";
import {
  type FrozenAutomationIntentPayload,
  type FrozenAutomationSnapshot,
} from "./automation-outbox";
import { getBusinessEnvelopeKey } from "./envelope-key";
import {
  AMBIGUOUS_AUTOMATION_EFFECT_PREFIX,
  executeFrozenAutomation,
  isRetryableFrozenAutomationResult,
} from "./frozen-automation-executor";
import { openBusinessPayloadWithKey } from "./payload-codec";

const PERIODIC_DRAIN_MS = 5_000;
const MAX_RETRY_DELAY_SECONDS = 15 * 60;

const triggerSchema = z.enum([
  "order.created",
  "order.confirmed",
  "order.shipped",
  "order.delivered",
  "order.returned",
  "order.cancelled",
  "customer.created",
  "customer.blacklisted",
  "message.received",
  "stock.low",
]);

const frozenAutomationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  action: z.string().min(1),
  config: z.string().nullable(),
  conditions: z.string().nullable(),
  steps: z.string().nullable(),
  dryRun: z.boolean(),
});

const frozenIntentSchema = z.object({
  version: z.literal(2),
  trigger: triggerSchema,
  eventPayload: z.record(z.string(), z.unknown()),
  automation: frozenAutomationSchema,
});

const legacyIntentSchema = z
  .object({ trigger: triggerSchema })
  .passthrough();

interface OutboxRow {
  id: string;
  effectKey: string;
  commandId: string;
  effectType: string;
  payloadJson: string;
  attemptCount: number | bigint;
}

class AmbiguousOutboxEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousOutboxEffectError";
  }
}

class TerminalOutboxEffectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TerminalOutboxEffectError";
  }
}

export interface AutomationOutboxResult {
  claimed: number;
  succeeded: number;
  retrying: number;
  deadLetter: number;
}

async function recoverStaleClaims(context: ServiceContext): Promise<void> {
  await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET
      "status" = 'retrying',
      "nextAttemptAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'processing'
      AND "updatedAt" <= datetime('now', '-5 minutes')
  `;

  // V2 actions are independently idempotent: WhatsApp has a durable sidecar
  // receipt, customer tags commit with an audit receipt, status updates are
  // transactional no-ops on replay, and notifications are log-only.
  await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET
      "status" = 'retrying',
      "nextAttemptAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'dispatching'
      AND "effectType" = 'automation.dispatch.v2'
      AND "updatedAt" <= datetime('now', '-5 minutes')
  `;

  await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET
      "status" = 'dead_letter',
      "nextAttemptAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'dispatching'
      AND "effectType" = 'automation.dispatch'
      AND "updatedAt" <= datetime('now', '-5 minutes')
  `;
}

async function listCandidates(
  context: ServiceContext,
  options: { effectKey?: string; limit: number },
): Promise<OutboxRow[]> {
  if (options.effectKey) {
    return context.prisma.$queryRaw<OutboxRow[]>`
      SELECT
        "id", "effectKey", "commandId", "effectType", "payloadJson",
        "attemptCount"
      FROM "OutboxIntent"
      WHERE "effectKey" = ${options.effectKey}
        AND "effectType" IN ('automation.dispatch', 'automation.dispatch.v2')
        AND "status" IN ('queued', 'retrying')
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP)
      LIMIT 1
    `;
  }

  return context.prisma.$queryRaw<OutboxRow[]>`
    SELECT
      "id", "effectKey", "commandId", "effectType", "payloadJson",
      "attemptCount"
    FROM "OutboxIntent"
    WHERE "effectType" IN ('automation.dispatch', 'automation.dispatch.v2')
      AND "status" IN ('queued', 'retrying')
      AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP)
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT ${options.limit}
  `;
}

async function claim(
  context: ServiceContext,
  row: OutboxRow,
): Promise<boolean> {
  const claimed = await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET
      "status" = 'processing',
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id}
      AND "status" IN ('queued', 'retrying')
  `;
  return claimed === 1;
}

async function markDispatchStarted(
  context: ServiceContext,
  row: OutboxRow,
): Promise<void> {
  const started = await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET "status" = 'dispatching', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id} AND "status" = 'processing'
  `;
  if (started !== 1) {
    throw new Error(
      `Outbox intent '${row.effectKey}' lost its claim before dispatch`,
    );
  }
}

async function markSucceeded(
  context: ServiceContext,
  row: OutboxRow,
): Promise<void> {
  const updated = await context.prisma.$executeRaw`
    UPDATE "OutboxIntent"
    SET
      "status" = 'succeeded',
      "nextAttemptAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${row.id}
      AND "status" IN ('processing', 'dispatching')
  `;
  if (updated !== 1) {
    throw new Error(`Outbox intent '${row.effectKey}' could not be acknowledged`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAmbiguous(error: unknown): boolean {
  return (
    error instanceof AmbiguousOutboxEffectError ||
    errorMessage(error).includes(AMBIGUOUS_AUTOMATION_EFFECT_PREFIX)
  );
}

async function markFailed(
  context: ServiceContext,
  row: OutboxRow,
  error: unknown,
): Promise<"retrying" | "dead_letter"> {
  const attempt = Number(row.attemptCount) + 1;
  const deadLetter =
    isAmbiguous(error) || error instanceof TerminalOutboxEffectError;
  const status = deadLetter ? "dead_letter" : "retrying";
  const delaySeconds = Math.min(
    MAX_RETRY_DELAY_SECONDS,
    2 ** Math.min(10, Math.max(0, attempt - 1)),
  );

  if (deadLetter) {
    await context.prisma.$executeRaw`
      UPDATE "OutboxIntent"
      SET
        "status" = 'dead_letter',
        "nextAttemptAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
        AND "status" IN ('processing', 'dispatching')
    `;
  } else {
    await context.prisma.$executeRaw`
      UPDATE "OutboxIntent"
      SET
        "status" = 'retrying',
        "nextAttemptAt" = datetime('now', ${`+${delaySeconds} seconds`}),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${row.id}
        AND "status" IN ('processing', 'dispatching')
    `;
  }

  logger.error("business-outbox.automation.failed", {
    effectKey: row.effectKey,
    attempt,
    status,
    ambiguous: isAmbiguous(error),
    error: errorMessage(error),
  });
  return status;
}

function parseFrozenSteps(
  automation: FrozenAutomationSnapshot,
): string[] | null {
  if (!automation.steps) return null;
  try {
    const parsed = JSON.parse(automation.steps) as unknown;
    if (!Array.isArray(parsed) || parsed.some((step) => typeof step !== "string")) {
      throw new Error("steps must be an array of action names");
    }
    return parsed;
  } catch (error) {
    throw new TerminalOutboxEffectError(
      `Invalid frozen automation steps: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function executeFrozenIntent(
  context: ServiceContext,
  row: OutboxRow,
  payload: FrozenAutomationIntentPayload,
): Promise<void> {
  let dispatchStarted = false;
  const onEffectStart = async (): Promise<void> => {
    if (dispatchStarted) return;
    await markDispatchStarted(context, row);
    dispatchStarted = true;
  };
  const steps = parseFrozenSteps(payload.automation);

  if (steps && steps.length > 0) {
    for (let index = 0; index < steps.length; index += 1) {
      const stepSnapshot: FrozenAutomationSnapshot = {
        ...payload.automation,
        action: steps[index]!,
        steps: null,
      };
      const stepResult = await executeFrozenAutomation(
        context,
        payload.trigger,
        payload.eventPayload,
        stepSnapshot,
        `${row.effectKey}:step:${index}`,
        { onEffectStart },
      );
      if (isRetryableFrozenAutomationResult(stepResult)) {
        throw new Error(
          `Frozen automation step ${index + 1} remained retryable: ${
            stepResult.status
          }: ${stepResult.message ?? "no detail"}`,
        );
      }
    }
    return;
  }

  const result = await executeFrozenAutomation(
    context,
    payload.trigger,
    payload.eventPayload,
    payload.automation as FrozenAutomationSnapshot,
    row.effectKey,
    { onEffectStart },
  );
  if (isRetryableFrozenAutomationResult(result)) {
    throw new Error(
      `Frozen automation remained retryable: ${result.status}: ${
        result.message ?? "no detail"
      }`,
    );
  }
}

async function executeLegacyIntent(
  context: ServiceContext,
  row: OutboxRow,
  opened: unknown,
): Promise<void> {
  const parsed = legacyIntentSchema.parse(opened);
  const { trigger, ...eventPayload } = parsed;
  const automations = await context.prisma.automation.findMany({
    where: { trigger, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (automations.length === 0) return;

  await markDispatchStarted(context, row);
  const receipts = await dispatchSelectedAutomations(
    context,
    trigger as TriggerEvent,
    eventPayload,
    { automationIds: automations.map((automation) => automation.id) },
  );
  if (
    receipts.some(
      (receipt) =>
        receipt.status === "failed" || receipt.status === "rate_limited",
    )
  ) {
    throw new Error("Legacy automation dispatch produced a retryable receipt");
  }
}

export async function processAutomationOutbox(
  context: ServiceContext,
  options: { effectKey?: string; limit?: number } = {},
): Promise<AutomationOutboxResult> {
  await recoverStaleClaims(context);
  const candidates = await listCandidates(context, {
    effectKey: options.effectKey,
    limit: Math.max(1, Math.min(options.limit ?? 20, 100)),
  });
  const result: AutomationOutboxResult = {
    claimed: 0,
    succeeded: 0,
    retrying: 0,
    deadLetter: 0,
  };
  if (candidates.length === 0) return result;

  const envelopeKey = await getBusinessEnvelopeKey(context);
  for (const row of candidates) {
    if (!(await claim(context, row))) continue;
    result.claimed += 1;

    try {
      const opened = openBusinessPayloadWithKey<unknown>(
        row.payloadJson,
        {
          kind: "outbox-intent",
          recordKey: row.effectKey,
          recordType: row.effectType,
          commandId: row.commandId,
        },
        envelopeKey,
      );

      if (row.effectType === "automation.dispatch.v2") {
        await executeFrozenIntent(
          context,
          row,
          frozenIntentSchema.parse(opened),
        );
      } else if (row.effectType === "automation.dispatch") {
        await executeLegacyIntent(context, row, opened);
      } else {
        throw new TerminalOutboxEffectError(
          `Unsupported outbox effect type '${row.effectType}'`,
        );
      }

      await markSucceeded(context, row);
      result.succeeded += 1;
    } catch (error) {
      const status = await markFailed(context, row, error);
      result[status === "retrying" ? "retrying" : "deadLetter"] += 1;
    }
  }

  return result;
}

let periodicContext: ServiceContext | null = null;
let periodicTimer: ReturnType<typeof setTimeout> | null = null;

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
}

function armPeriodicDrain(delayMs: number): void {
  if (periodicTimer !== null) return;
  periodicTimer = setTimeout(() => {
    periodicTimer = null;
    const context = periodicContext;
    if (!context) return;
    void processAutomationOutbox(context, { limit: 20 })
      .catch((error) => {
        logger.error("business-outbox.automation.periodic-failed", {
          error: errorMessage(error),
        });
      })
      .finally(() => armPeriodicDrain(PERIODIC_DRAIN_MS));
  }, delayMs);
  unrefTimer(periodicTimer);
}

export function scheduleAutomationOutbox(
  context: ServiceContext,
  options: { effectKey?: string; limit?: number } = {},
): void {
  periodicContext = context;

  if (options.effectKey) {
    const immediate = setTimeout(() => {
      void processAutomationOutbox(context, options).catch((error) => {
        logger.error("business-outbox.automation.schedule-failed", {
          effectKey: options.effectKey ?? null,
          error: errorMessage(error),
        });
      });
    }, 0);
    unrefTimer(immediate);
  }

  armPeriodicDrain(0);
}
