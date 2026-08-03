import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import { sealBusinessCommandResultWithKey } from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";
import { evaluateConditions } from "./conditions";
import {
  AUTOMATION_TRIGGER_EFFECT_TYPE,
  automationHash,
  definitionHash,
  normalizeStoredTriggerPayload,
  parseStoredAutomationDefinition,
  type AutomationTriggerEnvelope,
  type CanonicalAutomationDefinition,
  type StoredAutomationDefinitionRow,
} from "./contracts";

const TRIGGER_LEASE_MS = 90_000;
const TRIGGER_MAX_ATTEMPTS = 6;
const TRIGGER_RETRY_DELAYS_MS = [
  5_000,
  30_000,
  120_000,
  600_000,
  1_800_000,
] as const;
const MAX_TRIGGER_RETRY_DELAY_MS = 1_800_000;

interface TriggerIntentRow {
  id: string;
  effectKey: string;
  commandId: string;
  effectType: string;
  payloadJson: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseToken: string | null;
  lastErrorCode: string | null;
}

interface ClaimedTrigger extends TriggerIntentRow {
  activeLeaseToken: string;
}

export interface AutomationTriggerDrainResult {
  effectKey: string;
  state: "succeeded" | "retrying" | "dead_letter";
  createdRuns: number;
  replayedRuns: number;
  invalidRuns: number;
  errorCode: string | null;
}

function triggerRetryDelay(attemptCount: number): number {
  return (
    TRIGGER_RETRY_DELAYS_MS[
      Math.min(
        Math.max(attemptCount - 1, 0),
        TRIGGER_RETRY_DELAYS_MS.length - 1,
      )
    ] ?? MAX_TRIGGER_RETRY_DELAY_MS
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function claimTrigger(
  context: ServiceContext,
): Promise<ClaimedTrigger | null> {
  return context.prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - TRIGGER_LEASE_MS);
    const current = await tx.outboxIntent.findFirst({
      where: {
        effectType: AUTOMATION_TRIGGER_EFFECT_TYPE,
        OR: [
          { status: "queued" },
          {
            status: "retrying",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "processing", lockedAt: { lte: expiredBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!current) return null;
    const row = current as TriggerIntentRow;

    if (row.attemptCount >= TRIGGER_MAX_ATTEMPTS) {
      await tx.outboxIntent.updateMany({
        where: {
          id: row.id,
          status: row.status,
          attemptCount: row.attemptCount,
        },
        data: {
          status: "dead_letter",
          lastErrorCode:
            row.lastErrorCode ?? "AUTOMATION_TRIGGER_ATTEMPTS_EXHAUSTED",
          nextAttemptAt: null,
          lockedAt: null,
          leaseToken: null,
          deadLetteredAt: now,
        },
      });
      return null;
    }

    const activeLeaseToken = randomUUID();
    const claimed = await tx.outboxIntent.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attemptCount: row.attemptCount,
      },
      data: {
        status: "processing",
        attemptCount: { increment: 1 },
        nextAttemptAt: null,
        lockedAt: now,
        leaseToken: activeLeaseToken,
        lastErrorCode: null,
      },
    });
    if (claimed.count !== 1) return null;
    return {
      ...row,
      status: "processing",
      attemptCount: row.attemptCount + 1,
      nextAttemptAt: null,
      lockedAt: now,
      leaseToken: activeLeaseToken,
      lastErrorCode: null,
      activeLeaseToken,
    };
  });
}

async function openTriggerEnvelope(
  context: ServiceContext,
  claim: ClaimedTrigger,
): Promise<AutomationTriggerEnvelope> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const raw = openBusinessPayloadWithKey<unknown>(
    claim.payloadJson,
    {
      kind: "outbox-intent",
      recordKey: claim.effectKey,
      recordType: claim.effectType,
      commandId: claim.commandId,
    },
    envelopeKey,
  );
  return normalizeStoredTriggerPayload(claim.effectKey, raw);
}

function sealRunPayload(
  payload: unknown,
  runId: string,
  runKey: string,
  purpose: "definition" | "trigger",
  requestHash: string,
  envelopeKey: Buffer,
): string {
  return sealBusinessCommandResultWithKey(
    payload,
    {
      commandId: runId,
      idempotencyKey: `automation-run-${purpose}:${runKey}`,
      requestHash,
    },
    envelopeKey,
  ).resultJson;
}

function sealStepConfig(
  config: unknown,
  stepId: string,
  stepKey: string,
  configHash: string,
  envelopeKey: Buffer,
): string {
  return sealBusinessCommandResultWithKey(
    config,
    {
      commandId: stepId,
      idempotencyKey: `automation-step-config:${stepKey}`,
      requestHash: configHash,
    },
    envelopeKey,
  ).resultJson;
}

async function createValidRun(
  context: ServiceContext,
  claim: ClaimedTrigger,
  envelope: AutomationTriggerEnvelope,
  definition: CanonicalAutomationDefinition,
  envelopeKey: Buffer,
): Promise<"created" | "replayed"> {
  const defHash = definitionHash(definition);
  const runKey = `automation-run:${automationHash([
    claim.effectKey,
    definition.automationId,
    defHash,
  ])}`;
  if (
    await context.prisma.automationRun.findUnique({
      where: { runKey },
      select: { id: true },
    })
  ) {
    return "replayed";
  }

  const runId = randomUUID();
  const payloadHash = automationHash(envelope.payload);
  const conditionMatched = evaluateConditions(
    definition.conditions,
    envelope.payload,
  );
  const status = !conditionMatched
    ? "skipped"
    : definition.dryRun
      ? "dry_run"
      : "queued";
  const completedAt = status === "queued" ? null : new Date();
  const steps = definition.steps.map((step, position) => {
    const configHash = automationHash(step.config);
    const stepKey = `automation-step:${automationHash([
      runKey,
      position,
      step.action,
      step.onFailure,
      configHash,
    ])}`;
    const stepId = randomUUID();
    return {
      id: stepId,
      stepKey,
      runId,
      position,
      action: step.action,
      failurePolicy: step.onFailure,
      configJson: sealStepConfig(
        step.config,
        stepId,
        stepKey,
        configHash,
        envelopeKey,
      ),
      configHash,
      status,
      completedAt,
    };
  });

  try {
    await context.prisma.$transaction(async (tx) => {
      await tx.automationRun.create({
        data: {
          id: runId,
          runKey,
          automationId: definition.automationId,
          automationName: definition.name,
          triggerIntentId: claim.id,
          triggerEffectKey: claim.effectKey,
          triggerType: envelope.trigger,
          triggerKey: envelope.triggerKey,
          definitionHash: defHash,
          definitionJson: sealRunPayload(
            definition,
            runId,
            runKey,
            "definition",
            defHash,
            envelopeKey,
          ),
          triggerPayloadJson: sealRunPayload(
            envelope.payload,
            runId,
            runKey,
            "trigger",
            payloadHash,
            envelopeKey,
          ),
          triggerPayloadHash: payloadHash,
          status,
          stepCount: steps.length,
          skippedStepCount: status === "skipped" ? steps.length : 0,
          startedAt: status === "queued" ? null : new Date(),
          completedAt,
          steps: { create: steps },
        },
      });
      if (status !== "queued") {
        await tx.automationLog.create({
          data: {
            automationId: definition.automationId,
            trigger: envelope.trigger,
            status,
            message:
              status === "skipped"
                ? "Conditions not met"
                : `DRY-RUN: ${steps.length} validated step(s)`,
            payload: JSON.stringify({
              runId,
              triggerKey: envelope.triggerKey,
            }),
          },
        });
      }
    });
    return "created";
  } catch (error) {
    if (isUniqueViolation(error)) return "replayed";
    throw error;
  }
}

async function createInvalidRun(
  context: ServiceContext,
  claim: ClaimedTrigger,
  envelope: AutomationTriggerEnvelope,
  automation: StoredAutomationDefinitionRow,
  validationError: unknown,
  envelopeKey: Buffer,
): Promise<"created" | "replayed"> {
  const rawDefinition = {
    automationId: automation.id,
    name: automation.name,
    trigger: automation.trigger,
    action: automation.action,
    config: automation.config,
    conditions: automation.conditions ?? null,
    steps: automation.steps ?? null,
    dryRun: automation.dryRun === true,
    maxRetries: automation.maxRetries ?? 2,
    retryDelayMs: automation.retryDelayMs ?? 500,
    invalid: true,
  };
  const defHash = automationHash(rawDefinition);
  const runKey = `automation-run:${automationHash([
    claim.effectKey,
    automation.id,
    defHash,
  ])}`;
  if (
    await context.prisma.automationRun.findUnique({
      where: { runKey },
      select: { id: true },
    })
  ) {
    return "replayed";
  }

  const runId = randomUUID();
  const payloadHash = automationHash(envelope.payload);
  const code = "AUTOMATION_DEFINITION_INVALID";
  const detail =
    validationError instanceof Error
      ? validationError.message.slice(0, 500)
      : code;
  try {
    await context.prisma.$transaction(async (tx) => {
      await tx.automationRun.create({
        data: {
          id: runId,
          runKey,
          automationId: automation.id,
          automationName: automation.name,
          triggerIntentId: claim.id,
          triggerEffectKey: claim.effectKey,
          triggerType: envelope.trigger,
          triggerKey: envelope.triggerKey,
          definitionHash: defHash,
          definitionJson: sealRunPayload(
            rawDefinition,
            runId,
            runKey,
            "definition",
            defHash,
            envelopeKey,
          ),
          triggerPayloadJson: sealRunPayload(
            envelope.payload,
            runId,
            runKey,
            "trigger",
            payloadHash,
            envelopeKey,
          ),
          triggerPayloadHash: payloadHash,
          status: "dead_letter",
          stepCount: 0,
          lastErrorCode: code,
          startedAt: new Date(),
          completedAt: new Date(),
          deadLetteredAt: new Date(),
        },
      });
      await tx.automation.updateMany({
        where: { id: automation.id, isActive: true },
        data: { isActive: false, lastError: code, nextRunAt: null },
      });
      await tx.automationLog.create({
        data: {
          automationId: automation.id,
          trigger: envelope.trigger,
          status: "failed",
          message: `${code}: ${detail}`,
          payload: JSON.stringify({
            runId,
            triggerKey: envelope.triggerKey,
          }),
        },
      });
    });
    return "created";
  } catch (error) {
    if (isUniqueViolation(error)) return "replayed";
    throw error;
  }
}

async function markTriggerSucceeded(
  context: ServiceContext,
  claim: ClaimedTrigger,
  counts: { createdRuns: number; replayedRuns: number; invalidRuns: number },
): Promise<AutomationTriggerDrainResult> {
  const updated = await context.prisma.outboxIntent.updateMany({
    where: {
      id: claim.id,
      status: "processing",
      leaseToken: claim.activeLeaseToken,
    },
    data: {
      status: "succeeded",
      outcomeState: "receipt",
      receiptJson: JSON.stringify(counts),
      succeededAt: new Date(),
      nextAttemptAt: null,
      lockedAt: null,
      leaseToken: null,
      lastErrorCode: null,
    },
  });
  if (updated.count !== 1) {
    throw new ConflictError(
      "Automation trigger lease changed before run materialization receipt",
    );
  }
  return {
    effectKey: claim.effectKey,
    state: "succeeded",
    ...counts,
    errorCode: null,
  };
}

async function markTriggerFailure(
  context: ServiceContext,
  claim: ClaimedTrigger,
  error: unknown,
): Promise<AutomationTriggerDrainResult> {
  const code =
    error instanceof SahelFlowError
      ? error.code.slice(0, 128)
      : error instanceof Error && error.name
        ? error.name.slice(0, 128)
        : "AUTOMATION_TRIGGER_MATERIALIZATION_FAILED";
  const exhausted = claim.attemptCount >= TRIGGER_MAX_ATTEMPTS;
  const state = exhausted ? "dead_letter" : "retrying";
  const nextAttemptAt = exhausted
    ? null
    : new Date(Date.now() + triggerRetryDelay(claim.attemptCount));
  await context.prisma.outboxIntent.updateMany({
    where: {
      id: claim.id,
      status: "processing",
      leaseToken: claim.activeLeaseToken,
    },
    data: {
      status: state,
      outcomeState: "none",
      lastErrorCode: code,
      nextAttemptAt,
      lockedAt: null,
      leaseToken: null,
      deadLetteredAt: exhausted ? new Date() : null,
    },
  });
  return {
    effectKey: claim.effectKey,
    state,
    createdRuns: 0,
    replayedRuns: 0,
    invalidRuns: 0,
    errorCode: code,
  };
}

async function executeClaimedTrigger(
  context: ServiceContext,
  claim: ClaimedTrigger,
): Promise<AutomationTriggerDrainResult> {
  try {
    const envelope = await openTriggerEnvelope(context, claim);
    const envelopeKey = await getBusinessEnvelopeKey(context);
    const automations = await context.prisma.automation.findMany({
      where: {
        trigger: envelope.trigger,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    let createdRuns = 0;
    let replayedRuns = 0;
    let invalidRuns = 0;

    for (const automation of automations) {
      let definition: CanonicalAutomationDefinition;
      try {
        definition = parseStoredAutomationDefinition(automation);
      } catch (validationError) {
        invalidRuns += 1;
        const result = await createInvalidRun(
          context,
          claim,
          envelope,
          automation,
          validationError,
          envelopeKey,
        );
        if (result === "created") createdRuns += 1;
        else replayedRuns += 1;
        continue;
      }

      const result = await createValidRun(
        context,
        claim,
        envelope,
        definition,
        envelopeKey,
      );
      if (result === "created") createdRuns += 1;
      else replayedRuns += 1;
    }

    return markTriggerSucceeded(context, claim, {
      createdRuns,
      replayedRuns,
      invalidRuns,
    });
  } catch (error) {
    return markTriggerFailure(context, claim, error);
  }
}

export async function drainDueAutomationTriggers(
  context: ServiceContext,
  limit = 10,
): Promise<AutomationTriggerDrainResult[]> {
  const bounded = Math.max(1, Math.min(limit, 25));
  const results: AutomationTriggerDrainResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const claimed = await claimTrigger(context);
    if (!claimed) break;
    results.push(await executeClaimedTrigger(context, claimed));
  }
  return results;
}
