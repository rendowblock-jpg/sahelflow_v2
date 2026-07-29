process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { FrozenAutomationSnapshot } from "../automation-outbox";
import { getBusinessEnvelopeKey } from "../envelope-key";
import { processAutomationOutbox } from "../outbox-worker";
import { sealBusinessPayloadWithKey } from "../payload-codec";

const context = { prisma: rawDb as never };
let sequence = 0;

interface InsertIntentOptions {
  trigger?: "order.created" | "order.confirmed";
  eventPayload?: Record<string, unknown>;
  automation?: FrozenAutomationSnapshot;
  effectType?: "automation.dispatch.v2" | "automation.dispatch";
  status?: "queued" | "processing" | "dispatching" | "retrying";
  attemptCount?: number;
  stale?: boolean;
  rawPayloadJson?: string;
}

async function createAutomation(
  overrides: Partial<{
    name: string;
    trigger: string;
    action: string;
    config: string | null;
    conditions: string | null;
    steps: string | null;
    isActive: boolean;
    dryRun: boolean;
  }> = {},
) {
  return rawDb.automation.create({
    data: {
      name: overrides.name ?? "Frozen automation",
      trigger: overrides.trigger ?? "order.created",
      action: overrides.action ?? "send_notification",
      config: overrides.config ?? JSON.stringify({ messageTemplate: "Original" }),
      conditions: overrides.conditions ?? null,
      steps: overrides.steps ?? null,
      isActive: overrides.isActive ?? true,
      dryRun: overrides.dryRun ?? false,
    },
  });
}

function snapshotOf(automation: Awaited<ReturnType<typeof createAutomation>>): FrozenAutomationSnapshot {
  return {
    id: automation.id,
    name: automation.name,
    action: automation.action,
    config: automation.config,
    conditions: automation.conditions,
    steps: automation.steps,
    dryRun: automation.dryRun,
  };
}

async function insertIntent(options: InsertIntentOptions = {}) {
  sequence += 1;
  const commandId = `outbox-command-${sequence}`;
  const effectKey = `outbox-effect-${sequence}`;
  const effectType = options.effectType ?? "automation.dispatch.v2";

  await rawDb.$executeRaw`
    INSERT INTO "BusinessCommand" (
      "id", "idempotencyKey", "commandType", "aggregateType", "aggregateId",
      "requestHash", "status", "resultJson", "actor", "correlationId",
      "expectedVersion", "committedVersion", "createdAt", "committedAt"
    ) VALUES (
      ${commandId}, ${`outbox-key-${sequence}`}, 'test.outbox', 'test',
      ${`aggregate-${sequence}`}, ${`hash-${sequence}`}, 'committed', '{}',
      'test', ${`correlation-${sequence}`}, 0, 1, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;

  const opened = effectType === "automation.dispatch.v2"
    ? {
        version: 2,
        trigger: options.trigger ?? "order.created",
        eventPayload: options.eventPayload ?? {
          orderId: `order-${sequence}`,
          orderNumber: `ORD-${sequence}`,
        },
        automation: options.automation!,
      }
    : {
        trigger: options.trigger ?? "order.created",
        ...(options.eventPayload ?? {}),
      };
  const payloadJson = options.rawPayloadJson ?? sealBusinessPayloadWithKey(
    opened,
    {
      kind: "outbox-intent",
      recordKey: effectKey,
      recordType: effectType,
      commandId,
    },
    await getBusinessEnvelopeKey(context),
  );

  await rawDb.$executeRaw`
    INSERT INTO "OutboxIntent" (
      "id", "effectKey", "commandId", "effectType", "payloadJson", "status",
      "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
    ) VALUES (
      ${`outbox-intent-${sequence}`}, ${effectKey}, ${commandId}, ${effectType},
      ${payloadJson}, ${options.status ?? "queued"}, ${options.attemptCount ?? 0},
      NULL, CURRENT_TIMESTAMP,
      ${options.stale ? new Date(Date.now() - 10 * 60_000) : new Date()}
    )
  `;

  return { commandId, effectKey };
}

async function outboxStatus(effectKey: string) {
  const rows = await rawDb.$queryRaw<
    Array<{ status: string; attemptCount: number | bigint }>
  >`
    SELECT "status", "attemptCount"
    FROM "OutboxIntent"
    WHERE "effectKey" = ${effectKey}
  `;
  return {
    status: rows[0]?.status,
    attemptCount: Number(rows[0]?.attemptCount ?? 0),
  };
}

beforeEach(cleanDb);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("frozen automation outbox worker", () => {
  it("executes the command-time snapshot after the live automation is edited and disabled", async () => {
    const automation = await createAutomation();
    const { effectKey } = await insertIntent({ automation: snapshotOf(automation) });

    await rawDb.automation.update({
      where: { id: automation.id },
      data: {
        isActive: false,
        config: JSON.stringify({ messageTemplate: "Changed later" }),
      },
    });

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toEqual({
      claimed: 1,
      succeeded: 1,
      retrying: 0,
      deadLetter: 0,
    });
    expect(await outboxStatus(effectKey)).toEqual({
      status: "succeeded",
      attemptCount: 1,
    });
    expect(await rawDb.automationLog.findFirst({
      where: { automationId: automation.id },
    })).toMatchObject({
      status: "success",
      message: "Notification: Original",
    });
  });

  it("keeps malformed sealed payloads retryable instead of losing them", async () => {
    const automation = await createAutomation();
    const { effectKey } = await insertIntent({
      automation: snapshotOf(automation),
      rawPayloadJson: "not-json",
    });

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toMatchObject({
      claimed: 1,
      succeeded: 0,
      retrying: 1,
    });
    expect(await outboxStatus(effectKey)).toEqual({
      status: "retrying",
      attemptCount: 1,
    });
  });

  it("keeps ordinary provider outages retryable without exhausting a short attempt cap", async () => {
    const automation = await createAutomation({
      action: "send_whatsapp",
      config: JSON.stringify({ messageTemplate: "Order {{orderNumber}}" }),
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unhealthy", { status: 503 })));
    const { effectKey } = await insertIntent({
      automation: snapshotOf(automation),
      eventPayload: {
        orderId: "provider-down",
        orderNumber: "ORD-DOWN",
        customerPhone: "0555000111",
      },
      attemptCount: 20,
    });

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toEqual({
      claimed: 1,
      succeeded: 0,
      retrying: 1,
      deadLetter: 0,
    });
    expect(await outboxStatus(effectKey)).toEqual({
      status: "retrying",
      attemptCount: 21,
    });
  });

  it("requeues a stale frozen dispatch but dead-letters a stale legacy dispatch", async () => {
    const automation = await createAutomation();
    const frozen = await insertIntent({
      automation: snapshotOf(automation),
      status: "dispatching",
      attemptCount: 1,
      stale: true,
    });
    const legacy = await insertIntent({
      effectType: "automation.dispatch",
      eventPayload: { orderNumber: "LEGACY" },
      status: "dispatching",
      attemptCount: 1,
      stale: true,
    });

    expect(await processAutomationOutbox(context, { limit: 10 })).toMatchObject({
      claimed: 1,
      succeeded: 1,
    });
    expect(await outboxStatus(frozen.effectKey)).toEqual({
      status: "succeeded",
      attemptCount: 2,
    });
    expect(await outboxStatus(legacy.effectKey)).toEqual({
      status: "dead_letter",
      attemptCount: 1,
    });
  });

  it("applies a customer tag exactly once when the outbox receipt is replayed", async () => {
    const customer = await rawDb.customer.create({
      data: {
        name: "Tag Customer",
        phone: "0555000199",
        nameBlindIndex: "tag-customer",
      },
    });
    const automation = await createAutomation({
      action: "tag_customer",
      config: JSON.stringify({ noteText: "VIP" }),
    });
    const { effectKey } = await insertIntent({
      automation: snapshotOf(automation),
      eventPayload: {
        customerId: customer.id,
        orderNumber: "TAG-1",
      },
    });

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toMatchObject({
      succeeded: 1,
    });
    await rawDb.$executeRaw`
      UPDATE "OutboxIntent"
      SET "status" = 'retrying', "nextAttemptAt" = CURRENT_TIMESTAMP
      WHERE "effectKey" = ${effectKey}
    `;
    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toMatchObject({
      succeeded: 1,
    });

    expect(await rawDb.customer.findUnique({ where: { id: customer.id } })).toMatchObject({
      notes: "VIP",
    });
    expect(await rawDb.auditLog.count({
      where: {
        action: "automation.tag_customer.applied",
        entityId: customer.id,
        metadata: { contains: effectKey },
      },
    })).toBe(1);
  });
});
