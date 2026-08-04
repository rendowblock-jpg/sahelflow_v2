import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  listAutomationRunHistory,
  retryAutomationRun,
} from "@/lib/automations/recovery";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
} from "@/lib/data/__tests__/helpers";

let db: PrismaClient;

beforeEach(async () => {
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

async function seedFailedRun(options: { effectBound?: boolean } = {}) {
  const runId = randomUUID();
  const failedStepId = randomUUID();
  const skippedStepId = randomUUID();
  const automation = await db.automation.create({
    data: {
      name: "Recovery test",
      trigger: "order.created",
      action: options.effectBound ? "send_whatsapp" : "update_status",
      config: JSON.stringify(
        options.effectBound
          ? { messageTemplate: "Order {{orderNumber}}" }
          : { targetStatus: "cancelled" },
      ),
      isActive: true,
      runCount: 0,
    },
  });
  await db.automationRun.create({
    data: {
      id: runId,
      runKey: `run:${randomUUID()}`,
      automationId: automation.id,
      automationName: automation.name,
      triggerIntentId: randomUUID(),
      triggerEffectKey: `trigger:${randomUUID()}`,
      triggerType: "order.created",
      triggerKey: `order.created:${randomUUID()}`,
      definitionHash: "a".repeat(64),
      definitionJson: "encrypted-definition-secret",
      triggerPayloadJson: "encrypted-trigger-secret",
      triggerPayloadHash: "b".repeat(64),
      status: "dead_letter",
      stepCount: 2,
      failedStepCount: 1,
      skippedStepCount: 1,
      attemptCount: 1,
      completedAt: new Date(),
      deadLetteredAt: new Date(),
      steps: {
        create: [
          {
            id: failedStepId,
            stepKey: `step:${randomUUID()}`,
            position: 0,
            action: options.effectBound ? "send_whatsapp" : "update_status",
            failurePolicy: "stop",
            configJson: "encrypted-config-secret",
            configHash: "c".repeat(64),
            status: "dead_letter",
            attemptCount: 1,
            lastErrorCode: options.effectBound
              ? "WHATSAPP_DEAD_LETTER"
              : "ORDER_NOT_FOUND",
            effectKey: options.effectBound
              ? `whatsapp-effect:${randomUUID()}`
              : null,
            effectState: options.effectBound ? "dead_letter" : null,
            completedAt: new Date(),
            deadLetteredAt: new Date(),
            attempts: {
              create: {
                id: randomUUID(),
                attemptNumber: 1,
                state: "dead_letter",
                errorCode: options.effectBound
                  ? "WHATSAPP_DEAD_LETTER"
                  : "ORDER_NOT_FOUND",
                detailJson: "private-attempt-detail",
                completedAt: new Date(),
              },
            },
          },
          {
            id: skippedStepId,
            stepKey: `step:${randomUUID()}`,
            position: 1,
            action: "send_notification",
            failurePolicy: "continue",
            configJson: "encrypted-downstream-config",
            configHash: "d".repeat(64),
            status: "skipped",
            lastErrorCode: "BLOCKED_BY_FAILED_STEP",
            completedAt: new Date(),
          },
        ],
      },
    },
  });
  return { runId, failedStepId, skippedStepId };
}

describe("automation operator recovery", () => {
  it("returns sanitized history without encrypted payload or attempt details", async () => {
    await seedFailedRun();

    const history = await listAutomationRunHistory(makeContext(db), 10);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      automationName: "Recovery test",
      status: "dead_letter",
      recoverable: true,
    });
    expect(history[0]).not.toHaveProperty("definitionJson");
    expect(history[0]).not.toHaveProperty("triggerPayloadJson");
    expect(history[0]!.steps[0]).not.toHaveProperty("configJson");
    expect(history[0]!.steps[0]!.attempts[0]).not.toHaveProperty("detailJson");
  });

  it("queues the failed database step, unblocks downstream work and hashes the reason", async () => {
    const seeded = await seedFailedRun();
    const reason = "Order restored by the operator";

    const result = await retryAutomationRun(makeContext(db), {
      runId: seeded.runId,
      auditActor: "authenticated-owner:test-owner",
      reason,
    });

    expect(result).toMatchObject({
      runId: seeded.runId,
      status: "queued",
      targetStepId: seeded.failedStepId,
      operatorRetryCount: 1,
    });
    const run = await db.automationRun.findUniqueOrThrow({
      where: { id: seeded.runId },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    expect(run).toMatchObject({
      status: "queued",
      operatorRetryCount: 1,
      completedAt: null,
      deadLetteredAt: null,
    });
    expect(run.steps[0]).toMatchObject({
      status: "queued",
      operatorRetryCount: 1,
      lastErrorCode: null,
      completedAt: null,
    });
    expect(run.steps[1]).toMatchObject({
      status: "queued",
      lastErrorCode: null,
      completedAt: null,
    });

    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        action: "automation.run.retry_requested",
        entityId: seeded.runId,
      },
    });
    expect(audit.actor).toBe("authenticated-owner:test-owner");
    expect(audit.metadata).not.toContain(reason);
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({
      reasonLength: reason.length,
    });
  });

  it("refuses to repeat a provider-bound effect through automation recovery", async () => {
    const seeded = await seedFailedRun({ effectBound: true });
    const history = await listAutomationRunHistory(makeContext(db), 10);

    expect(history[0]).toMatchObject({
      recoverable: false,
      recoveryBlockCode: "AUTOMATION_EFFECT_RECOVERY_REQUIRED",
    });
    await expect(
      retryAutomationRun(makeContext(db), {
        runId: seeded.runId,
        auditActor: "authenticated-owner:test-owner",
        reason: "Try provider effect again",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
