process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, dbRaw, shopContext } from "@/lib/db";
import {
  AUTOMATION_TRIGGER_EFFECT_TYPE,
  type AutomationStepDefinition,
} from "../contracts";
import { drainDueAutomationRuns } from "../run-processor";
import { enqueueAutomationTrigger } from "../trigger-service";
import { drainDueAutomationTriggers } from "../trigger-processor";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = { prisma: db, shop: shopContext };
const whatsAppContext = {
  ...context,
  whatsAppProviderAccountId: ACCOUNT_ID,
};
let recheckSequence = 0;

async function clean(): Promise<void> {
  await db.automationNotification.deleteMany();
  await db.automationStepAttempt.deleteMany();
  await db.automationStepRun.deleteMany();
  await db.automationRun.deleteMany();
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.automationLog.deleteMany();
  await db.automation.deleteMany();
  await db.auditLog.deleteMany();
  await dbRaw.order.deleteMany({
    where: { orderNumber: { startsWith: "ORD-AUTO-RECHECK-" } },
  });
  await dbRaw.customer.deleteMany({
    where: { name: { startsWith: "Automation Recheck" } },
  });
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
  await dbRaw.$disconnect();
});

function orderPayload(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "missing-order",
    orderNumber: "ORD-AUTO-1",
    customerId: "missing-customer",
    customerName: "Client Automation",
    customerPhone: "0555000111",
    totalPrice: 4500,
    wilaya: "Alger",
    ...overrides,
  };
}

async function seedRecheckOrder(status = "pending") {
  recheckSequence += 1;
  const suffix = `${Date.now().toString().slice(-7)}${recheckSequence}`;
  const customer = await dbRaw.customer.create({
    data: {
      name: `Automation Recheck ${suffix}`,
      phone: `0559${suffix}`,
      nameBlindIndex: `automation-recheck-${suffix}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Durable Automation Street",
    },
  });
  return dbRaw.order.create({
    data: {
      orderNumber: `ORD-AUTO-RECHECK-${suffix}`,
      status,
      customerId: customer.id,
      totalPrice: 4500,
      deliveryCost: 500,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "1 Durable Automation Street",
      phone: customer.phone,
      source: "storefront",
    },
  });
}

async function createAutomation(input: {
  name: string;
  steps: AutomationStepDefinition[];
  maxRetries?: number;
  retryDelayMs?: number;
}) {
  return db.automation.create({
    data: {
      name: input.name,
      trigger: "order.created",
      action: input.steps[0]!.action,
      config: JSON.stringify(input.steps[0]!.config),
      steps: JSON.stringify(input.steps),
      conditions: null,
      isActive: true,
      dryRun: false,
      maxRetries: input.maxRetries ?? 0,
      retryDelayMs: input.retryDelayMs ?? 500,
      runCount: 0,
    },
  });
}

async function materializeTrigger(
  triggerKey: string,
  payload = orderPayload(),
): Promise<string> {
  const queued = await enqueueAutomationTrigger(
    context,
    "order.created",
    payload,
    { triggerKey, occurredAt: new Date("2026-08-03T11:00:00.000Z") },
  );
  const drained = await drainDueAutomationTriggers(context, 10);
  expect(drained).toHaveLength(1);
  expect(drained[0]).toMatchObject({ state: "succeeded" });
  return queued.effectKey;
}

async function drainRunsUntilIdle(
  runtimeContext: typeof context = context,
  maxTicks = 20,
): Promise<void> {
  for (let index = 0; index < maxTicks; index += 1) {
    const results = await drainDueAutomationRuns(runtimeContext, 10);
    if (results.length === 0) return;
  }
  throw new Error("automation run drain did not become idle");
}

async function forceWaitDue(): Promise<void> {
  await db.automationStepRun.updateMany({
    where: { status: "waiting" },
    data: { nextAttemptAt: new Date(0) },
  });
  await db.automationRun.updateMany({
    where: { status: "waiting" },
    data: { nextAttemptAt: new Date(0) },
  });
}

describe("durable automation runtime", () => {
  it("stores one encrypted definition-bound run and exactly one visible Bell notification for trigger replay", async () => {
    await createAutomation({
      name: "Notification",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Order {{orderNumber}}" },
        },
      ],
    });

    const first = await enqueueAutomationTrigger(
      context,
      "order.created",
      orderPayload(),
      { triggerKey: "order.created:source:1" },
    );
    const replay = await enqueueAutomationTrigger(
      context,
      "order.created",
      orderPayload(),
      { triggerKey: "order.created:source:1" },
    );
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      effectKey: first.effectKey,
      replayed: true,
    });

    const triggerIntent = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: first.effectKey },
    });
    expect(triggerIntent.effectType).toBe(AUTOMATION_TRIGGER_EFFECT_TYPE);
    expect(triggerIntent.payloadJson).not.toContain("Client Automation");
    expect(triggerIntent.payloadJson).not.toContain("0555000111");

    await drainDueAutomationTriggers(context, 10);
    await drainDueAutomationTriggers(context, 10);
    const runs = await db.automationRun.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.definitionJson).not.toContain("messageTemplate");
    expect(runs[0]!.triggerPayloadJson).not.toContain("ORD-AUTO-1");

    await drainRunsUntilIdle();
    await expect(
      db.automationRun.findUniqueOrThrow({ where: { id: runs[0]!.id } }),
    ).resolves.toMatchObject({
      status: "succeeded",
      succeededStepCount: 1,
      failedStepCount: 0,
    });
    await expect(db.automationNotification.count()).resolves.toBe(1);
    await expect(db.automationNotification.findFirstOrThrow()).resolves.toMatchObject({
      automationName: "Notification",
      body: "Order ORD-AUTO-1",
      link: "/automations?tab=activity",
    });

    await expect(drainDueAutomationRuns(context, 10)).resolves.toEqual([]);
    await expect(db.automationNotification.count()).resolves.toBe(1);
  });

  it("waits durably without hot-looping, then re-checks live state and continues when it still matches", async () => {
    const order = await seedRecheckOrder("pending");
    await createAutomation({
      name: "Pending follow-up",
      steps: [
        {
          action: "wait",
          onFailure: "stop",
          config: { delayMinutes: 1 },
        },
        {
          action: "recheck_order_status",
          onFailure: "stop",
          config: { expectedStatus: "pending" },
        },
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Still pending {{orderNumber}}" },
        },
      ],
    });
    await materializeTrigger(
      "order.created:wait-recheck-match",
      orderPayload({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
      }),
    );

    const first = await drainDueAutomationRuns(context, 10);
    expect(first[0]).toMatchObject({ state: "waiting" });
    const waitStep = await db.automationStepRun.findFirstOrThrow({
      where: { position: 0 },
    });
    expect(waitStep.status).toBe("waiting");
    expect(waitStep.attemptCount).toBe(1);
    expect(waitStep.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    await expect(drainDueAutomationRuns(context, 10)).resolves.toEqual([]);
    await expect(
      db.automationStepRun.findUniqueOrThrow({ where: { id: waitStep.id } }),
    ).resolves.toMatchObject({ status: "waiting", attemptCount: 1 });

    await forceWaitDue();
    await drainRunsUntilIdle();

    const run = await db.automationRun.findFirstOrThrow({
      include: { steps: { orderBy: { position: "asc" } } },
    });
    expect(run.status).toBe("succeeded");
    expect(run.succeededStepCount).toBe(3);
    expect(run.failedStepCount).toBe(0);
    expect(run.skippedStepCount).toBe(0);
    expect(run.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    await expect(db.automationNotification.findFirstOrThrow()).resolves.toMatchObject({
      body: `Still pending ${order.orderNumber}`,
    });
  });

  it("neutral-skips downstream work when the live order state changed during the wait", async () => {
    const order = await seedRecheckOrder("pending");
    await createAutomation({
      name: "Pending follow-up guard",
      steps: [
        {
          action: "wait",
          onFailure: "stop",
          config: { delayMinutes: 1 },
        },
        {
          action: "recheck_order_status",
          onFailure: "stop",
          config: { expectedStatus: "pending" },
        },
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Must not appear {{orderNumber}}" },
        },
      ],
    });
    await materializeTrigger(
      "order.created:wait-recheck-mismatch",
      orderPayload({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
      }),
    );

    const first = await drainDueAutomationRuns(context, 10);
    expect(first[0]).toMatchObject({ state: "waiting" });
    await dbRaw.order.update({
      where: { id: order.id },
      data: { status: "confirmed" },
    });
    await forceWaitDue();
    await drainRunsUntilIdle();

    const run = await db.automationRun.findFirstOrThrow({
      include: { steps: { orderBy: { position: "asc" } } },
    });
    expect(run.status).toBe("skipped");
    expect(run.lastErrorCode).toBeNull();
    expect(run.failedStepCount).toBe(0);
    expect(run.skippedStepCount).toBe(2);
    expect(run.steps.map((step) => step.status)).toEqual([
      "succeeded",
      "skipped",
      "skipped",
    ]);
    expect(run.steps[1]!.lastErrorCode).toBe("AUTOMATION_GUARD_NOT_MATCHED");
    expect(run.steps[2]!.lastErrorCode).toBe("AUTOMATION_GUARD_NOT_MATCHED");
    await expect(db.automationNotification.count()).resolves.toBe(0);
  });

  it("stops after a required failed step and skips every downstream step", async () => {
    await createAutomation({
      name: "Stop on failure",
      steps: [
        {
          action: "update_status",
          onFailure: "stop",
          config: { targetStatus: "shipped" },
        },
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Must not run" },
        },
      ],
      maxRetries: 0,
    });
    await materializeTrigger("order.created:stop-failure");
    await drainRunsUntilIdle();

    const run = await db.automationRun.findFirstOrThrow({
      include: { steps: { orderBy: { position: "asc" } } },
    });
    expect(run.status).toBe("dead_letter");
    expect(run.succeededStepCount).toBe(0);
    expect(run.failedStepCount).toBe(1);
    expect(run.skippedStepCount).toBe(1);
    expect(run.steps.map((step) => step.status)).toEqual([
      "dead_letter",
      "skipped",
    ]);
    expect(run.steps[1]!.lastErrorCode).toBe("BLOCKED_BY_FAILED_STEP");
    await expect(
      db.automationLog.findFirstOrThrow({ where: { automationId: run.automationId } }),
    ).resolves.not.toMatchObject({ status: "success" });
  });

  it("continues only when declared and reports partial completion truthfully", async () => {
    await createAutomation({
      name: "Continue after failure",
      steps: [
        {
          action: "update_status",
          onFailure: "continue",
          config: { targetStatus: "shipped" },
        },
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Continued {{orderNumber}}" },
        },
      ],
      maxRetries: 0,
    });
    await materializeTrigger("order.created:continue-failure");
    await drainRunsUntilIdle();

    const run = await db.automationRun.findFirstOrThrow({
      include: { steps: { orderBy: { position: "asc" } } },
    });
    expect(run.status).toBe("partially_completed");
    expect(run.succeededStepCount).toBe(1);
    expect(run.failedStepCount).toBe(1);
    expect(run.steps.map((step) => step.status)).toEqual([
      "failed",
      "succeeded",
    ]);
    await expect(
      db.automationLog.findFirstOrThrow({ where: { automationId: run.automationId } }),
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("does not hot-loop a future retry or consume another attempt", async () => {
    await createAutomation({
      name: "Retry later",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Retry" },
        },
      ],
      maxRetries: 2,
      retryDelayMs: 60_000,
    });
    await materializeTrigger("order.created:retry-later");
    const step = await db.automationStepRun.findFirstOrThrow();
    await db.automationStepRun.update({
      where: { id: step.id },
      data: { configJson: "tampered-config" },
    });

    const first = await drainDueAutomationRuns(context, 10);
    expect(first[0]).toMatchObject({ state: "retrying" });
    const afterFirst = await db.automationStepRun.findUniqueOrThrow({
      where: { id: step.id },
    });
    expect(afterFirst.status).toBe("retrying");
    expect(afterFirst.attemptCount).toBe(1);
    expect(afterFirst.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    await expect(drainDueAutomationRuns(context, 10)).resolves.toEqual([]);
    await expect(
      db.automationStepRun.findUniqueOrThrow({ where: { id: step.id } }),
    ).resolves.toMatchObject({ status: "retrying", attemptCount: 1 });
  });

  it("closes an expired lease before creating the next immutable attempt", async () => {
    await createAutomation({
      name: "Lease recovery",
      steps: [
        {
          action: "send_notification",
          onFailure: "stop",
          config: { messageTemplate: "Recovered" },
        },
      ],
    });
    await materializeTrigger("order.created:lease-recovery");
    const run = await db.automationRun.findFirstOrThrow();
    const step = await db.automationStepRun.findFirstOrThrow();
    await db.automationRun.update({
      where: { id: run.id },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(0),
        leaseToken: "expired-run-lease",
      },
    });
    await db.automationStepRun.update({
      where: { id: step.id },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(0),
        leaseToken: "expired-step-lease",
      },
    });
    await db.automationStepAttempt.create({
      data: {
        id: "expired-step-attempt",
        stepRunId: step.id,
        attemptNumber: 1,
        leaseToken: "expired-step-lease",
        state: "processing",
      },
    });

    await drainRunsUntilIdle();
    const attempts = await db.automationStepAttempt.findMany({
      where: { stepRunId: step.id },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      state: "lease_expired",
    });
    expect(attempts[1]).toMatchObject({
      attemptNumber: 2,
      state: "succeeded",
    });
  });

  it("correlates one WhatsApp effect and waits for its durable receipt", async () => {
    await createAutomation({
      name: "WhatsApp effect",
      steps: [
        {
          action: "send_whatsapp",
          onFailure: "stop",
          config: { messageTemplate: "Bonjour {{customerName}}" },
        },
      ],
    });
    await materializeTrigger("order.created:whatsapp-effect");

    const first = await drainDueAutomationRuns(whatsAppContext, 10);
    expect(first[0]).toMatchObject({ state: "waiting_effect" });
    const step = await db.automationStepRun.findFirstOrThrow();
    expect(step.effectKey).toMatch(/^wa:/);
    expect(step.status).toBe("waiting_effect");
    await expect(
      db.outboxIntent.count({
        where: { effectType: "whatsapp.text.send.v1" },
      }),
    ).resolves.toBe(1);

    await db.outboxIntent.update({
      where: { effectKey: step.effectKey! },
      data: {
        status: "succeeded",
        outcomeState: "receipt",
        receiptJson: JSON.stringify({ id: "WA-AUTOMATION-1", status: "sent" }),
        succeededAt: new Date(),
      },
    });
    await db.whatsAppOutboundEffect.update({
      where: { effectKey: step.effectKey! },
      data: { providerMessageId: "WA-AUTOMATION-1" },
    });
    await db.automationStepRun.update({
      where: { id: step.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await db.automationRun.updateMany({
      where: { status: "waiting_effect" },
      data: { nextAttemptAt: new Date(0) },
    });

    await drainRunsUntilIdle(whatsAppContext);
    await expect(
      db.automationRun.findFirstOrThrow(),
    ).resolves.toMatchObject({ status: "succeeded", succeededStepCount: 1 });
    await expect(
      db.outboxIntent.count({
        where: { effectType: "whatsapp.text.send.v1" },
      }),
    ).resolves.toBe(1);
  });
});
