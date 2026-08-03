import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { systemBusinessPrincipal } from "@/lib/business-truth/principal";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
} from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import {
  getWhatsAppEffectStatus,
  queueWhatsAppText,
} from "@/lib/whatsapp/durable-send";
import {
  automationHash,
  automationStepSchema,
  renderAutomationTemplate,
  type AutomationStepDefinition,
  type AutomationTriggerPayload,
  type CanonicalAutomationDefinition,
} from "./contracts";

const RUN_LEASE_MS = 90_000;
const EFFECT_POLL_MS = 5_000;
const MAX_STEP_RETRY_DELAY_MS = 300_000;
const NON_TERMINAL_STEP_STATES = [
  "queued",
  "retrying",
  "processing",
  "waiting_effect",
] as const;

type AutomationTx = Parameters<
  Parameters<ServiceContext["prisma"]["$transaction"]>[0]
>[0];

interface AutomationRunRow {
  id: string;
  runKey: string;
  automationId: string;
  automationName: string;
  triggerType: string;
  definitionHash: string;
  definitionJson: string;
  triggerPayloadHash: string;
  triggerPayloadJson: string;
  status: string;
  stepCount: number;
  attemptCount: number;
  lockedAt: Date | null;
  leaseToken: string | null;
}

interface ClaimedRun extends AutomationRunRow {
  activeLeaseToken: string;
}

interface AutomationStepRow {
  id: string;
  stepKey: string;
  runId: string;
  position: number;
  action: string;
  failurePolicy: string;
  configJson: string;
  configHash: string;
  status: string;
  attemptCount: number;
  operatorRetryCount: number;
  nextAttemptAt: Date | null;
  lockedAt: Date | null;
  leaseToken: string | null;
  effectKey: string | null;
  effectState: string | null;
  lastErrorCode: string | null;
}

interface ClaimedStep extends AutomationStepRow {
  attemptId: string;
  attemptNumber: number;
  activeLeaseToken: string;
}

type StepSelection =
  | { kind: "none" }
  | {
      kind: "blocked";
      step: AutomationStepRow;
      state: "retrying";
      nextAttemptAt: Date;
    }
  | { kind: "waiting_effect"; step: AutomationStepRow }
  | { kind: "claimed"; step: ClaimedStep };

interface RunCounts {
  succeeded: number;
  failed: number;
  skipped: number;
  ambiguous: number;
  deadLetter: number;
}

export interface AutomationRunProcessingResult {
  runId: string;
  state: string;
  stepId: string | null;
  effectKey: string | null;
  errorCode: string | null;
}

class AutomationActionError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "AutomationActionError";
  }
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function retryDelay(
  definition: CanonicalAutomationDefinition,
  attemptNumber: number,
): number {
  return Math.min(
    definition.retryDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1)),
    MAX_STEP_RETRY_DELAY_MS,
  );
}

function isRunTerminal(status: string): boolean {
  return [
    "succeeded",
    "partially_completed",
    "failed",
    "ambiguous",
    "dead_letter",
    "skipped",
    "dry_run",
  ].includes(status);
}

function isStepTerminal(status: string): boolean {
  return [
    "succeeded",
    "failed",
    "skipped",
    "ambiguous",
    "dead_letter",
    "dry_run",
  ].includes(status);
}

function errorCode(error: unknown): string {
  if (error instanceof AutomationActionError) return error.code;
  if (error instanceof SahelFlowError) return error.code.slice(0, 128);
  if (error instanceof Error && error.name) return error.name.slice(0, 128);
  return "AUTOMATION_STEP_FAILED";
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AutomationActionError) return error.retryable;
  if (error instanceof SahelFlowError) {
    return (
      error.statusCode >= 500 ||
      error.code === "WHATSAPP_ACCOUNT_UNAVAILABLE"
    );
  }
  return true;
}

async function claimRun(context: ServiceContext): Promise<ClaimedRun | null> {
  return context.prisma.$transaction(async (tx) => {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - RUN_LEASE_MS);
    const current = await tx.automationRun.findFirst({
      where: {
        OR: [
          { status: "queued" },
          {
            status: "retrying",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          {
            status: "waiting_effect",
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
          },
          { status: "processing", lockedAt: { lte: expiredBefore } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!current || isRunTerminal(current.status)) return null;

    const row = current as AutomationRunRow;
    const activeLeaseToken = randomUUID();
    const updated = await tx.automationRun.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attemptCount: row.attemptCount,
      },
      data: {
        status: "processing",
        attemptCount: { increment: 1 },
        lockedAt: now,
        leaseToken: activeLeaseToken,
        nextAttemptAt: null,
        lastErrorCode: null,
        startedAt: row.attemptCount === 0 ? now : undefined,
      },
    });
    if (updated.count !== 1) return null;
    return {
      ...row,
      status: "processing",
      attemptCount: row.attemptCount + 1,
      lockedAt: now,
      leaseToken: activeLeaseToken,
      activeLeaseToken,
    };
  });
}

async function openRunDefinition(
  context: ServiceContext,
  run: ClaimedRun,
): Promise<CanonicalAutomationDefinition> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return openBusinessCommandResultWithKey<CanonicalAutomationDefinition>(
    run.definitionJson,
    {
      commandId: run.id,
      idempotencyKey: `automation-run-definition:${run.runKey}`,
      requestHash: run.definitionHash,
    },
    envelopeKey,
  );
}

async function openRunPayload(
  context: ServiceContext,
  run: ClaimedRun,
): Promise<AutomationTriggerPayload> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return openBusinessCommandResultWithKey<AutomationTriggerPayload>(
    run.triggerPayloadJson,
    {
      commandId: run.id,
      idempotencyKey: `automation-run-trigger:${run.runKey}`,
      requestHash: run.triggerPayloadHash,
    },
    envelopeKey,
  );
}

async function openStepDefinition(
  context: ServiceContext,
  step: AutomationStepRow,
): Promise<AutomationStepDefinition> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const config = openBusinessCommandResultWithKey<unknown>(
    step.configJson,
    {
      commandId: step.id,
      idempotencyKey: `automation-step-config:${step.stepKey}`,
      requestHash: step.configHash,
    },
    envelopeKey,
  );
  return automationStepSchema.parse({
    action: step.action,
    onFailure: step.failurePolicy,
    config,
  });
}

async function sealStepResult(
  context: ServiceContext,
  step: AutomationStepRow,
  result: unknown,
): Promise<string> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return sealBusinessCommandResultWithKey(
    result,
    {
      commandId: step.id,
      idempotencyKey: `automation-step-result:${step.stepKey}`,
      requestHash: automationHash(result),
    },
    envelopeKey,
  ).resultJson;
}

async function closeExpiredStepAttempt(
  tx: AutomationTx,
  step: AutomationStepRow,
  now: Date,
): Promise<void> {
  if (
    step.status === "processing" &&
    step.lockedAt &&
    step.lockedAt.getTime() <= now.getTime() - RUN_LEASE_MS
  ) {
    await tx.automationStepAttempt.updateMany({
      where: {
        stepRunId: step.id,
        leaseToken: step.leaseToken,
        state: "processing",
      },
      data: {
        state: "lease_expired",
        errorCode: "AUTOMATION_STEP_LEASE_EXPIRED",
        detailJson: JSON.stringify({ retryable: true }),
        completedAt: now,
      },
    });
  }
}

async function claimNextStep(
  context: ServiceContext,
  run: ClaimedRun,
): Promise<StepSelection> {
  return context.prisma.$transaction(async (tx) => {
    const ownedRun = await tx.automationRun.findFirst({
      where: {
        id: run.id,
        status: "processing",
        leaseToken: run.activeLeaseToken,
      },
      select: { id: true },
    });
    if (!ownedRun) return { kind: "none" } as const;

    const steps = await tx.automationStepRun.findMany({
      where: { runId: run.id },
      orderBy: { position: "asc" },
    });
    const now = new Date();
    for (const raw of steps) {
      const step = raw as AutomationStepRow;
      if (isStepTerminal(step.status)) continue;
      if (step.status === "waiting_effect") {
        return { kind: "waiting_effect", step } as const;
      }
      if (
        step.status === "retrying" &&
        step.nextAttemptAt &&
        step.nextAttemptAt > now
      ) {
        return {
          kind: "blocked",
          step,
          state: "retrying",
          nextAttemptAt: step.nextAttemptAt,
        } as const;
      }
      if (
        step.status === "processing" &&
        step.lockedAt &&
        step.lockedAt.getTime() > now.getTime() - RUN_LEASE_MS
      ) {
        return {
          kind: "blocked",
          step,
          state: "retrying",
          nextAttemptAt: new Date(
            step.lockedAt.getTime() + RUN_LEASE_MS,
          ),
        } as const;
      }

      await closeExpiredStepAttempt(tx, step, now);
      const activeLeaseToken = randomUUID();
      const attemptNumber = step.attemptCount + 1;
      const claimed = await tx.automationStepRun.updateMany({
        where: {
          id: step.id,
          status: step.status,
          attemptCount: step.attemptCount,
        },
        data: {
          status: "processing",
          attemptCount: attemptNumber,
          lockedAt: now,
          leaseToken: activeLeaseToken,
          nextAttemptAt: null,
          lastErrorCode: null,
          startedAt: step.attemptCount === 0 ? now : undefined,
        },
      });
      if (claimed.count !== 1) return { kind: "none" } as const;

      const attemptId = randomUUID();
      await tx.automationStepAttempt.create({
        data: {
          id: attemptId,
          stepRunId: step.id,
          attemptNumber,
          leaseToken: activeLeaseToken,
          state: "processing",
        },
      });
      return {
        kind: "claimed",
        step: {
          ...step,
          status: "processing",
          attemptCount: attemptNumber,
          nextAttemptAt: null,
          lockedAt: now,
          leaseToken: activeLeaseToken,
          attemptId,
          attemptNumber,
          activeLeaseToken,
        },
      } as const;
    }
    return { kind: "none" } as const;
  });
}

function countsFromStatuses(statuses: string[]): RunCounts {
  return {
    succeeded: statuses.filter((status) => status === "succeeded").length,
    failed: statuses.filter((status) => status === "failed").length,
    skipped: statuses.filter((status) => status === "skipped").length,
    ambiguous: statuses.filter((status) => status === "ambiguous").length,
    deadLetter: statuses.filter((status) => status === "dead_letter").length,
  };
}

function terminalRunState(counts: RunCounts): string {
  if (counts.ambiguous > 0) return "ambiguous";
  if (counts.deadLetter > 0 && counts.succeeded === 0) return "dead_letter";
  if (counts.failed > 0 || counts.deadLetter > 0 || counts.skipped > 0) {
    return counts.succeeded > 0 ? "partially_completed" : "failed";
  }
  return "succeeded";
}

async function finalizeOrScheduleRun(
  context: ServiceContext,
  run: ClaimedRun,
): Promise<AutomationRunProcessingResult> {
  return context.prisma.$transaction(async (tx) => {
    const steps = await tx.automationStepRun.findMany({
      where: { runId: run.id },
      orderBy: { position: "asc" },
    });
    const counts = countsFromStatuses(steps.map((step) => step.status));
    const next = steps.find((step) => !isStepTerminal(step.status));

    if (next) {
      const state =
        next.status === "waiting_effect"
          ? "waiting_effect"
          : next.status === "retrying" || next.status === "processing"
            ? "retrying"
            : "queued";
      const nextAttemptAt =
        state === "waiting_effect"
          ? next.nextAttemptAt ?? new Date(Date.now() + EFFECT_POLL_MS)
          : state === "retrying"
            ? next.nextAttemptAt ??
              (next.lockedAt
                ? new Date(next.lockedAt.getTime() + RUN_LEASE_MS)
                : new Date(Date.now() + 1_000))
            : null;
      await tx.automationRun.updateMany({
        where: {
          id: run.id,
          status: "processing",
          leaseToken: run.activeLeaseToken,
        },
        data: {
          status: state,
          succeededStepCount: counts.succeeded,
          failedStepCount:
            counts.failed + counts.deadLetter + counts.ambiguous,
          skippedStepCount: counts.skipped,
          nextAttemptAt,
          lockedAt: null,
          leaseToken: null,
        },
      });
      return {
        runId: run.id,
        state,
        stepId: next.id,
        effectKey: next.effectKey,
        errorCode: next.lastErrorCode,
      };
    }

    const terminalState = terminalRunState(counts);
    const now = new Date();
    const updated = await tx.automationRun.updateMany({
      where: {
        id: run.id,
        status: "processing",
        leaseToken: run.activeLeaseToken,
      },
      data: {
        status: terminalState,
        succeededStepCount: counts.succeeded,
        failedStepCount:
          counts.failed + counts.deadLetter + counts.ambiguous,
        skippedStepCount: counts.skipped,
        completedAt: now,
        deadLetteredAt: terminalState === "dead_letter" ? now : null,
        lockedAt: null,
        leaseToken: null,
        nextAttemptAt: null,
      },
    });
    if (updated.count === 1) {
      await tx.automation.updateMany({
        where: { id: run.automationId },
        data: {
          runCount: { increment: 1 },
          lastRunAt: now,
          lastError: terminalState === "succeeded" ? null : terminalState,
          nextRunAt: null,
        },
      });
      await tx.automationLog.create({
        data: {
          automationId: run.automationId,
          trigger: run.triggerType,
          status:
            terminalState === "succeeded"
              ? "success"
              : terminalState === "partially_completed"
                ? "failed"
                : terminalState,
          message: `Durable run ${terminalState}: ${counts.succeeded}/${run.stepCount} step(s) succeeded`,
          payload: JSON.stringify({ runId: run.id, runKey: run.runKey }),
        },
      });
    }
    return {
      runId: run.id,
      state: terminalState,
      stepId: null,
      effectKey: null,
      errorCode: terminalState === "succeeded" ? null : terminalState,
    };
  });
}

async function scheduleOwnedRun(
  context: ServiceContext,
  run: ClaimedRun,
  state: "retrying" | "waiting_effect",
  nextAttemptAt: Date,
  step: AutomationStepRow,
  lastErrorCode: string | null = null,
): Promise<AutomationRunProcessingResult> {
  await context.prisma.automationRun.updateMany({
    where: {
      id: run.id,
      status: "processing",
      leaseToken: run.activeLeaseToken,
    },
    data: {
      status: state,
      nextAttemptAt,
      lockedAt: null,
      leaseToken: null,
      lastErrorCode,
    },
  });
  return {
    runId: run.id,
    state,
    stepId: step.id,
    effectKey: step.effectKey,
    errorCode: lastErrorCode,
  };
}

async function skipDownstreamSteps(
  tx: AutomationTx,
  step: AutomationStepRow,
  now: Date,
): Promise<void> {
  const downstream = await tx.automationStepRun.findMany({
    where: {
      runId: step.runId,
      position: { gt: step.position },
      status: { in: [...NON_TERMINAL_STEP_STATES] },
    },
    select: { id: true },
  });
  if (downstream.length === 0) return;
  const ids = downstream.map((candidate) => candidate.id);
  await tx.automationStepRun.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "skipped",
      lastErrorCode: "BLOCKED_BY_FAILED_STEP",
      nextAttemptAt: null,
      lockedAt: null,
      leaseToken: null,
      completedAt: now,
    },
  });
  await tx.automationStepAttempt.updateMany({
    where: {
      stepRunId: { in: ids },
      state: { in: ["processing", "waiting_effect", "retrying"] },
    },
    data: {
      state: "skipped",
      errorCode: "BLOCKED_BY_FAILED_STEP",
      detailJson: JSON.stringify({ blockedByStepId: step.id }),
      completedAt: now,
    },
  });
}

async function reconcileWhatsAppStep(
  context: ServiceContext,
  run: ClaimedRun,
  step: AutomationStepRow,
): Promise<AutomationRunProcessingResult> {
  if (!step.effectKey) {
    throw new AutomationActionError(
      "AUTOMATION_EFFECT_CORRELATION_MISSING",
      false,
      "WhatsApp step has no durable effect correlation",
    );
  }
  const effect = await getWhatsAppEffectStatus(context, step.effectKey);
  if (["queued", "processing", "retrying"].includes(effect.state)) {
    const nextAttemptAt = new Date(Date.now() + EFFECT_POLL_MS);
    await context.prisma.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "waiting_effect",
        effectKey: step.effectKey,
      },
      data: { effectState: effect.state, nextAttemptAt },
    });
    return scheduleOwnedRun(
      context,
      run,
      "waiting_effect",
      nextAttemptAt,
      step,
    );
  }

  const now = new Date();
  const status =
    effect.state === "succeeded"
      ? "succeeded"
      : effect.state === "ambiguous"
        ? "ambiguous"
        : "dead_letter";
  await context.prisma.$transaction(async (tx) => {
    await tx.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "waiting_effect",
        effectKey: step.effectKey,
      },
      data: {
        status,
        effectState: effect.state,
        lastErrorCode: effect.errorCode,
        completedAt: now,
        deadLetteredAt: status === "dead_letter" ? now : null,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
      },
    });
    await tx.automationStepAttempt.updateMany({
      where: { stepRunId: step.id, state: "waiting_effect" },
      data: {
        state: status,
        errorCode: effect.errorCode,
        detailJson: JSON.stringify({
          effectKey: step.effectKey,
          providerMessageIdPresent: Boolean(effect.providerMessageId),
        }),
        completedAt: now,
      },
    });
    if (status !== "succeeded" && step.failurePolicy === "stop") {
      await skipDownstreamSteps(tx, step, now);
    }
  });
  return finalizeOrScheduleRun(context, run);
}

async function markStepSucceeded(
  context: ServiceContext,
  run: ClaimedRun,
  step: ClaimedStep,
  result: unknown,
): Promise<AutomationRunProcessingResult> {
  const now = new Date();
  const resultJson = await sealStepResult(context, step, result);
  await context.prisma.$transaction(async (tx) => {
    await tx.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        status: "succeeded",
        resultJson,
        completedAt: now,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
      },
    });
    await tx.automationStepAttempt.updateMany({
      where: {
        id: step.attemptId,
        state: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        state: "succeeded",
        detailJson: JSON.stringify({ resultCommitted: true }),
        completedAt: now,
      },
    });
  });
  return finalizeOrScheduleRun(context, run);
}

async function markStepFailure(
  context: ServiceContext,
  run: ClaimedRun,
  step: ClaimedStep,
  definition: CanonicalAutomationDefinition,
  error: unknown,
): Promise<AutomationRunProcessingResult> {
  const code = errorCode(error);
  const canRetry =
    isRetryable(error) && step.attemptNumber <= definition.maxRetries;
  const now = new Date();
  if (canRetry) {
    const nextAttemptAt = new Date(
      now.getTime() + retryDelay(definition, step.attemptNumber),
    );
    await context.prisma.$transaction(async (tx) => {
      await tx.automationStepRun.updateMany({
        where: {
          id: step.id,
          status: "processing",
          leaseToken: step.activeLeaseToken,
        },
        data: {
          status: "retrying",
          lastErrorCode: code,
          nextAttemptAt,
          lockedAt: null,
          leaseToken: null,
        },
      });
      await tx.automationStepAttempt.updateMany({
        where: {
          id: step.attemptId,
          state: "processing",
          leaseToken: step.activeLeaseToken,
        },
        data: {
          state: "retrying",
          errorCode: code,
          detailJson: JSON.stringify({
            retryable: true,
            failurePolicy: step.failurePolicy,
          }),
          completedAt: now,
        },
      });
    });
    return scheduleOwnedRun(
      context,
      run,
      "retrying",
      nextAttemptAt,
      step,
      code,
    );
  }

  const terminalStatus =
    step.failurePolicy === "continue" ? "failed" : "dead_letter";
  await context.prisma.$transaction(async (tx) => {
    await tx.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        status: terminalStatus,
        lastErrorCode: code,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        completedAt: now,
        deadLetteredAt: terminalStatus === "dead_letter" ? now : null,
      },
    });
    await tx.automationStepAttempt.updateMany({
      where: {
        id: step.attemptId,
        state: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        state: terminalStatus,
        errorCode: code,
        detailJson: JSON.stringify({
          retryable: false,
          failurePolicy: step.failurePolicy,
        }),
        completedAt: now,
      },
    });
    if (step.failurePolicy === "stop") {
      await skipDownstreamSteps(tx, step, now);
    }
  });
  return finalizeOrScheduleRun(context, run);
}

async function executeDatabaseStep(
  context: ServiceContext,
  run: ClaimedRun,
  step: ClaimedStep,
  definition: Exclude<
    AutomationStepDefinition,
    { action: "send_whatsapp" }
  >,
  payload: AutomationTriggerPayload,
): Promise<AutomationRunProcessingResult> {
  if (definition.action === "send_notification") {
    return markStepSucceeded(context, run, step, {
      notification: renderAutomationTemplate(
        definition.config.messageTemplate,
        payload,
      ),
    });
  }

  if (definition.action === "tag_customer") {
    const customerId =
      typeof payload.customerId === "string" ? payload.customerId : null;
    if (!customerId) {
      throw new AutomationActionError(
        "AUTOMATION_CUSTOMER_ID_MISSING",
        false,
        "Customer tag step requires customerId",
      );
    }
    const noteText = renderAutomationTemplate(
      definition.config.noteText,
      payload,
    );
    const now = new Date();
    const resultJson = await sealStepResult(context, step, {
      customerId,
      tagged: true,
    });
    await context.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { notes: true },
      });
      if (!customer) {
        throw new AutomationActionError(
          "AUTOMATION_CUSTOMER_NOT_FOUND",
          false,
          "Customer tag target no longer exists",
        );
      }
      const marker = `[automation-step:${step.stepKey}]`;
      if (!customer.notes?.includes(marker)) {
        await tx.customer.update({
          where: { id: customerId },
          data: {
            notes: customer.notes
              ? `${customer.notes}\n${marker} ${noteText}`
              : `${marker} ${noteText}`,
          },
        });
      }
      await tx.automationStepRun.updateMany({
        where: {
          id: step.id,
          status: "processing",
          leaseToken: step.activeLeaseToken,
        },
        data: {
          status: "succeeded",
          resultJson,
          completedAt: now,
          lockedAt: null,
          leaseToken: null,
          lastErrorCode: null,
        },
      });
      await tx.automationStepAttempt.updateMany({
        where: {
          id: step.attemptId,
          state: "processing",
          leaseToken: step.activeLeaseToken,
        },
        data: {
          state: "succeeded",
          detailJson: JSON.stringify({ idempotencyMarker: true }),
          completedAt: now,
        },
      });
    });
    return finalizeOrScheduleRun(context, run);
  }

  const orderId =
    typeof payload.orderId === "string" ? payload.orderId : null;
  if (!orderId) {
    throw new AutomationActionError(
      "AUTOMATION_ORDER_ID_MISSING",
      false,
      "Status update step requires orderId",
    );
  }
  const { orderService } = await import("@/lib/data/order-service");
  const now = new Date();
  const resultJson = await sealStepResult(context, step, {
    orderId,
    targetStatus: definition.config.targetStatus,
  });
  const effects = await context.prisma.$transaction(async (tx) => {
    const transition = await orderService.updateStatusInTx(
      tx,
      orderId,
      definition.config.targetStatus,
      { actor: `automation:${run.automationId}:run:${run.id}` },
    );
    await tx.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        status: "succeeded",
        resultJson,
        completedAt: now,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
      },
    });
    await tx.automationStepAttempt.updateMany({
      where: {
        id: step.attemptId,
        state: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        state: "succeeded",
        detailJson: JSON.stringify({
          transitionCommitted: transition.changed,
        }),
        completedAt: now,
      },
    });
    return transition;
  });
  await Promise.resolve(orderService.dispatchStatusTransition(context, effects));
  return finalizeOrScheduleRun(context, run);
}

async function executeWhatsAppStep(
  context: ServiceContext,
  run: ClaimedRun,
  step: ClaimedStep,
  definition: Extract<
    AutomationStepDefinition,
    { action: "send_whatsapp" }
  >,
  payload: AutomationTriggerPayload,
): Promise<AutomationRunProcessingResult> {
  const customerPhone =
    typeof payload.customerPhone === "string"
      ? payload.customerPhone
      : null;
  if (!customerPhone) {
    throw new AutomationActionError(
      "AUTOMATION_CUSTOMER_PHONE_MISSING",
      false,
      "WhatsApp step requires customerPhone",
    );
  }
  const text = renderAutomationTemplate(
    definition.config.messageTemplate,
    payload,
  );
  if (!text.trim()) {
    throw new AutomationActionError(
      "AUTOMATION_WHATSAPP_MESSAGE_EMPTY",
      false,
      "WhatsApp step rendered an empty message",
    );
  }
  const queued = await queueWhatsAppText(
    {
      ...context,
      businessPrincipal: systemBusinessPrincipal("automation-worker"),
    },
    {
      clientMessageId: deterministicUuid(step.stepKey),
      to: customerPhone,
      text,
    },
  );
  const now = new Date();
  const nextAttemptAt = new Date(now.getTime() + EFFECT_POLL_MS);
  await context.prisma.$transaction(async (tx) => {
    await tx.automationStepRun.updateMany({
      where: {
        id: step.id,
        status: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        status: "waiting_effect",
        effectKey: queued.effectKey,
        effectState: "queued",
        nextAttemptAt,
        lockedAt: null,
        leaseToken: null,
      },
    });
    await tx.automationStepAttempt.updateMany({
      where: {
        id: step.attemptId,
        state: "processing",
        leaseToken: step.activeLeaseToken,
      },
      data: {
        state: "waiting_effect",
        detailJson: JSON.stringify({
          effectKey: queued.effectKey,
          replayed: queued.replayed,
        }),
      },
    });
  });
  return scheduleOwnedRun(
    context,
    run,
    "waiting_effect",
    nextAttemptAt,
    {
      ...step,
      status: "waiting_effect",
      effectKey: queued.effectKey,
      effectState: "queued",
    },
  );
}

async function deadLetterInvalidRunPayload(
  context: ServiceContext,
  run: ClaimedRun,
  error: unknown,
): Promise<AutomationRunProcessingResult> {
  const now = new Date();
  const code = errorCode(error);
  await context.prisma.$transaction(async (tx) => {
    await tx.automationStepRun.updateMany({
      where: {
        runId: run.id,
        status: { in: [...NON_TERMINAL_STEP_STATES] },
      },
      data: {
        status: "skipped",
        lastErrorCode: "AUTOMATION_RUN_PAYLOAD_INVALID",
        completedAt: now,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
      },
    });
    await tx.automationRun.updateMany({
      where: {
        id: run.id,
        status: "processing",
        leaseToken: run.activeLeaseToken,
      },
      data: {
        status: "dead_letter",
        lastErrorCode: "AUTOMATION_RUN_PAYLOAD_INVALID",
        completedAt: now,
        deadLetteredAt: now,
        lockedAt: null,
        leaseToken: null,
      },
    });
  });
  return {
    runId: run.id,
    state: "dead_letter",
    stepId: null,
    effectKey: null,
    errorCode: code,
  };
}

async function executeClaimedRun(
  context: ServiceContext,
  run: ClaimedRun,
): Promise<AutomationRunProcessingResult> {
  let definition: CanonicalAutomationDefinition;
  let payload: AutomationTriggerPayload;
  try {
    [definition, payload] = await Promise.all([
      openRunDefinition(context, run),
      openRunPayload(context, run),
    ]);
  } catch (error) {
    return deadLetterInvalidRunPayload(context, run, error);
  }

  const selection = await claimNextStep(context, run);
  if (selection.kind === "none") {
    return finalizeOrScheduleRun(context, run);
  }
  if (selection.kind === "blocked") {
    return scheduleOwnedRun(
      context,
      run,
      selection.state,
      selection.nextAttemptAt,
      selection.step,
      selection.step.lastErrorCode,
    );
  }
  if (selection.kind === "waiting_effect") {
    try {
      return await reconcileWhatsAppStep(context, run, selection.step);
    } catch (error) {
      const code = errorCode(error);
      return scheduleOwnedRun(
        context,
        run,
        "waiting_effect",
        new Date(Date.now() + EFFECT_POLL_MS),
        selection.step,
        code,
      );
    }
  }

  const step = selection.step;
  try {
    const stepDefinition = await openStepDefinition(context, step);
    return stepDefinition.action === "send_whatsapp"
      ? executeWhatsAppStep(context, run, step, stepDefinition, payload)
      : executeDatabaseStep(context, run, step, stepDefinition, payload);
  } catch (error) {
    return markStepFailure(context, run, step, definition, error);
  }
}

export async function drainDueAutomationRuns(
  context: ServiceContext,
  limit = 10,
): Promise<AutomationRunProcessingResult[]> {
  const bounded = Math.max(1, Math.min(limit, 25));
  const results: AutomationRunProcessingResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const run = await claimRun(context);
    if (!run) break;
    results.push(await executeClaimedRun(context, run));
  }
  return results;
}
