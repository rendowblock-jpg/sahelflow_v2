process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, dbRaw, shopContext } from "@/lib/db";
import { drainDueAutomationRuns } from "../run-processor";
import { enqueueAutomationTrigger } from "../trigger-service";
import { drainDueAutomationTriggers } from "../trigger-processor";

const context = { prisma: db, shop: shopContext };

async function clean(): Promise<void> {
  await db.automationNotification.deleteMany();
  await db.automationStepAttempt.deleteMany();
  await db.automationStepRun.deleteMany();
  await db.automationRun.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.automationLog.deleteMany();
  await db.automation.deleteMany();
  await db.auditLog.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
  await dbRaw.$disconnect();
});

describe("durable automation wait lease recovery", () => {
  it("does not restart an already-due wait after a worker lease expires", async () => {
    await db.automation.create({
      data: {
        name: "Crash-safe wait",
        trigger: "order.created",
        action: "wait",
        config: JSON.stringify({ delayMinutes: 60 }),
        steps: JSON.stringify([
          {
            action: "wait",
            onFailure: "stop",
            config: { delayMinutes: 60 },
          },
        ]),
        conditions: null,
        isActive: true,
        dryRun: false,
        maxRetries: 0,
        retryDelayMs: 500,
        runCount: 0,
      },
    });

    await enqueueAutomationTrigger(
      context,
      "order.created",
      {
        orderId: "wait-recovery-order",
        orderNumber: "ORD-WAIT-RECOVERY",
        customerId: "wait-recovery-customer",
        customerName: "Wait Recovery",
        customerPhone: "0555000111",
        totalPrice: 4500,
        wilaya: "Alger",
      },
      { triggerKey: "order.created:wait-recovery" },
    );
    await expect(drainDueAutomationTriggers(context, 10)).resolves.toEqual([
      expect.objectContaining({ state: "succeeded" }),
    ]);

    const scheduled = await drainDueAutomationRuns(context, 10);
    expect(scheduled[0]).toMatchObject({ state: "waiting" });

    const run = await db.automationRun.findFirstOrThrow();
    const step = await db.automationStepRun.findFirstOrThrow();
    expect(step).toMatchObject({
      status: "waiting",
      attemptCount: 1,
      effectState: "delay_scheduled",
    });
    expect(step.nextAttemptAt).not.toBeNull();

    // Reproduce the exact crash window from the review finding: the persisted
    // wait became due, a worker claimed both run and step, then the process died
    // before the step could commit success. claimNextStep clears nextAttemptAt
    // but intentionally leaves the durable delay_scheduled marker in place.
    await db.automationRun.update({
      where: { id: run.id },
      data: {
        status: "processing",
        attemptCount: 2,
        nextAttemptAt: null,
        lockedAt: new Date(0),
        leaseToken: "expired-wait-run-lease",
      },
    });
    await db.automationStepRun.update({
      where: { id: step.id },
      data: {
        status: "processing",
        attemptCount: 2,
        nextAttemptAt: null,
        lockedAt: new Date(0),
        leaseToken: "expired-wait-step-lease",
        effectState: "delay_scheduled",
      },
    });
    await db.automationStepAttempt.create({
      data: {
        id: "expired-due-wait-attempt",
        stepRunId: step.id,
        attemptNumber: 2,
        leaseToken: "expired-wait-step-lease",
        state: "processing",
      },
    });

    const recovered = await drainDueAutomationRuns(context, 10);
    expect(recovered[0]).toMatchObject({ state: "succeeded" });

    await expect(
      db.automationRun.findUniqueOrThrow({ where: { id: run.id } }),
    ).resolves.toMatchObject({
      status: "succeeded",
      nextAttemptAt: null,
      failedStepCount: 0,
      succeededStepCount: 1,
    });
    await expect(
      db.automationStepRun.findUniqueOrThrow({ where: { id: step.id } }),
    ).resolves.toMatchObject({
      status: "succeeded",
      nextAttemptAt: null,
      attemptCount: 3,
      effectState: "delay_scheduled",
    });

    const attempts = await db.automationStepAttempt.findMany({
      where: { stepRunId: step.id },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => attempt.state)).toEqual([
      "waiting",
      "lease_expired",
      "succeeded",
    ]);
  });
});
