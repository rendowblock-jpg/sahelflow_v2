import "server-only";

import { createHash } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";

const RECOVERABLE_RUN_STATES = [
  "failed",
  "partially_completed",
  "dead_letter",
] as const;
const RECOVERABLE_STEP_STATES = ["failed", "dead_letter"] as const;
const BLOCKED_STEP_ERROR = "BLOCKED_BY_FAILED_STEP";

export interface AutomationAttemptHistory {
  id: string;
  attemptNumber: number;
  state: string;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface AutomationStepHistory {
  id: string;
  position: number;
  action: string;
  failurePolicy: string;
  status: string;
  attemptCount: number;
  operatorRetryCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  effectKey: string | null;
  effectState: string | null;
  startedAt: string | null;
  completedAt: string | null;
  attempts: AutomationAttemptHistory[];
}

export interface AutomationRunHistory {
  id: string;
  automationId: string;
  automationName: string;
  triggerType: string;
  status: string;
  stepCount: number;
  succeededStepCount: number;
  failedStepCount: number;
  skippedStepCount: number;
  attemptCount: number;
  operatorRetryCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  recoverable: boolean;
  recoveryBlockCode: string | null;
  steps: AutomationStepHistory[];
}

export interface RetryAutomationRunInput {
  runId: string;
  auditActor: string;
  reason: string;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function recoveryTarget(
  run: {
    status: string;
    steps: Array<{
      id: string;
      action: string;
      status: string;
      effectKey: string | null;
    }>;
  },
) {
  if (run.status === "ambiguous") {
    return { step: null, blockCode: "AUTOMATION_EFFECT_AMBIGUOUS" };
  }
  const step = run.steps.find((candidate) =>
    (RECOVERABLE_STEP_STATES as readonly string[]).includes(candidate.status),
  );
  if (!step) {
    return { step: null, blockCode: "AUTOMATION_RETRY_TARGET_MISSING" };
  }
  if (step.action === "send_whatsapp" || step.effectKey) {
    return { step: null, blockCode: "AUTOMATION_EFFECT_RECOVERY_REQUIRED" };
  }
  return { step, blockCode: null };
}

/** Return sanitized durable run, step and immutable-attempt history. */
export async function listAutomationRunHistory(
  context: ServiceContext,
  limit = 20,
): Promise<AutomationRunHistory[]> {
  const bounded = Math.max(1, Math.min(limit, 50));
  const runs = await context.prisma.automationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: bounded,
    select: {
      id: true,
      automationId: true,
      automationName: true,
      triggerType: true,
      status: true,
      stepCount: true,
      succeededStepCount: true,
      failedStepCount: true,
      skippedStepCount: true,
      attemptCount: true,
      operatorRetryCount: true,
      nextAttemptAt: true,
      lastErrorCode: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      steps: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          position: true,
          action: true,
          failurePolicy: true,
          status: true,
          attemptCount: true,
          operatorRetryCount: true,
          nextAttemptAt: true,
          lastErrorCode: true,
          effectKey: true,
          effectState: true,
          startedAt: true,
          completedAt: true,
          attempts: {
            orderBy: { attemptNumber: "desc" },
            take: 8,
            select: {
              id: true,
              attemptNumber: true,
              state: true,
              errorCode: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
      },
    },
  });

  return runs.map((run) => {
    const target = recoveryTarget(run);
    return {
      id: run.id,
      automationId: run.automationId,
      automationName: run.automationName,
      triggerType: run.triggerType,
      status: run.status,
      stepCount: run.stepCount,
      succeededStepCount: run.succeededStepCount,
      failedStepCount: run.failedStepCount,
      skippedStepCount: run.skippedStepCount,
      attemptCount: run.attemptCount,
      operatorRetryCount: run.operatorRetryCount,
      nextAttemptAt: iso(run.nextAttemptAt),
      lastErrorCode: run.lastErrorCode,
      createdAt: run.createdAt.toISOString(),
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      recoverable:
        (RECOVERABLE_RUN_STATES as readonly string[]).includes(run.status) &&
        Boolean(target.step),
      recoveryBlockCode: target.blockCode,
      steps: run.steps.map((step) => ({
        id: step.id,
        position: step.position,
        action: step.action,
        failurePolicy: step.failurePolicy,
        status: step.status,
        attemptCount: step.attemptCount,
        operatorRetryCount: step.operatorRetryCount,
        nextAttemptAt: iso(step.nextAttemptAt),
        lastErrorCode: step.lastErrorCode,
        effectKey: step.effectKey,
        effectState: step.effectState,
        startedAt: iso(step.startedAt),
        completedAt: iso(step.completedAt),
        attempts: step.attempts.map((attempt) => ({
          id: attempt.id,
          attemptNumber: attempt.attemptNumber,
          state: attempt.state,
          errorCode: attempt.errorCode,
          startedAt: attempt.startedAt.toISOString(),
          completedAt: iso(attempt.completedAt),
        })),
      })),
    };
  });
}

/**
 * Reopen the first recoverable database step and any downstream steps skipped
 * by its stop policy. Provider-bound effects remain under WhatsApp recovery
 * authority and cannot be replayed through this path.
 */
export async function retryAutomationRun(
  context: ServiceContext,
  input: RetryAutomationRunInput,
): Promise<{
  runId: string;
  status: "queued";
  targetStepId: string;
  operatorRetryCount: number;
}> {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new SahelFlowError(
      "Automation retry reason must contain 3 to 500 characters",
      "VALIDATION_ERROR",
      400,
    );
  }
  const reasonHash = createHash("sha256").update(reason).digest("hex");

  return context.prisma.$transaction(async (tx) => {
    const run = await tx.automationRun.findUnique({
      where: { id: input.runId },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    if (!run) {
      throw new SahelFlowError("Automation run not found", "NOT_FOUND", 404);
    }
    if (!(RECOVERABLE_RUN_STATES as readonly string[]).includes(run.status)) {
      throw new ConflictError(
        `Automation run in state '${run.status}' cannot be retried`,
      );
    }

    const target = recoveryTarget(run);
    if (!target.step) {
      throw new ConflictError(
        target.blockCode === "AUTOMATION_EFFECT_RECOVERY_REQUIRED"
          ? "This run is bound to a durable WhatsApp effect and must be reconciled through WhatsApp recovery"
          : target.blockCode === "AUTOMATION_EFFECT_AMBIGUOUS"
            ? "An ambiguous provider effect cannot be repeated without duplicate-risk reconciliation"
            : "No recoverable automation step was found",
      );
    }

    const now = new Date();
    const nextRunRetryCount = run.operatorRetryCount + 1;
    const nextStepRetryCount = target.step.operatorRetryCount + 1;
    await tx.automationStepRun.update({
      where: { id: target.step.id },
      data: {
        status: "queued",
        operatorRetryCount: nextStepRetryCount,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
        resultJson: null,
        completedAt: null,
        deadLetteredAt: null,
      },
    });
    await tx.automationStepRun.updateMany({
      where: {
        runId: run.id,
        position: { gt: target.step.position },
        status: "skipped",
        lastErrorCode: BLOCKED_STEP_ERROR,
      },
      data: {
        status: "queued",
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
        resultJson: null,
        completedAt: null,
        deadLetteredAt: null,
      },
    });

    const currentSteps = await tx.automationStepRun.findMany({
      where: { runId: run.id },
      select: { status: true },
    });
    const succeeded = currentSteps.filter(
      (step) => step.status === "succeeded",
    ).length;
    const failed = currentSteps.filter((step) =>
      ["failed", "dead_letter", "ambiguous"].includes(step.status),
    ).length;
    const skipped = currentSteps.filter(
      (step) => step.status === "skipped",
    ).length;

    await tx.automationRun.update({
      where: { id: run.id },
      data: {
        status: "queued",
        operatorRetryCount: nextRunRetryCount,
        succeededStepCount: succeeded,
        failedStepCount: failed,
        skippedStepCount: skipped,
        nextAttemptAt: null,
        lockedAt: null,
        leaseToken: null,
        lastErrorCode: null,
        completedAt: null,
        deadLetteredAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "automation.run.retry_requested",
        entity: "automation-run",
        entityId: run.id,
        actor: input.auditActor,
        before: JSON.stringify({
          status: run.status,
          operatorRetryCount: run.operatorRetryCount,
          targetStepId: target.step.id,
          targetStepStatus: target.step.status,
          targetStepOperatorRetryCount: target.step.operatorRetryCount,
        }),
        after: JSON.stringify({
          status: "queued",
          operatorRetryCount: nextRunRetryCount,
          targetStepId: target.step.id,
          targetStepStatus: "queued",
          targetStepOperatorRetryCount: nextStepRetryCount,
          requestedAt: now.toISOString(),
        }),
        metadata: JSON.stringify({
          reasonHash,
          reasonLength: reason.length,
        }),
      },
    });

    return {
      runId: run.id,
      status: "queued" as const,
      targetStepId: target.step.id,
      operatorRetryCount: nextRunRetryCount,
    };
  });
}
