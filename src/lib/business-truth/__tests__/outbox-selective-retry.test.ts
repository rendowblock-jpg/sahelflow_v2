process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { FrozenAutomationSnapshot } from "../automation-outbox";
import { getBusinessEnvelopeKey } from "../envelope-key";
import { processAutomationOutbox } from "../outbox-worker";
import { sealBusinessPayloadWithKey } from "../payload-codec";

const context = { prisma: rawDb as never };
let sequence = 0;

async function insertFrozenIntent(options: {
  commandId: string;
  effectScope: string;
  trigger: "order.created";
  eventPayload: Record<string, unknown>;
  automation: FrozenAutomationSnapshot;
}) {
  sequence += 1;
  const effectKey = `${options.commandId}:automation:${options.effectScope}:${options.automation.id}`;
  const payloadJson = sealBusinessPayloadWithKey(
    {
      version: 2,
      trigger: options.trigger,
      eventPayload: options.eventPayload,
      automation: options.automation,
    },
    {
      kind: "outbox-intent",
      recordKey: effectKey,
      recordType: "automation.dispatch.v2",
      commandId: options.commandId,
    },
    await getBusinessEnvelopeKey(context),
  );
  await rawDb.$executeRaw`
    INSERT INTO "OutboxIntent" (
      "id", "effectKey", "commandId", "effectType", "payloadJson", "status",
      "attemptCount", "nextAttemptAt", "createdAt", "updatedAt"
    ) VALUES (
      ${`selective-intent-${sequence}`}, ${effectKey}, ${options.commandId},
      'automation.dispatch.v2', ${payloadJson}, 'queued', 0, NULL,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  return effectKey;
}

async function createCommand(): Promise<string> {
  sequence += 1;
  const commandId = `selective-command-${sequence}`;
  await rawDb.$executeRaw`
    INSERT INTO "BusinessCommand" (
      "id", "idempotencyKey", "commandType", "aggregateType", "aggregateId",
      "requestHash", "status", "resultJson", "actor", "correlationId",
      "expectedVersion", "committedVersion", "createdAt", "committedAt"
    ) VALUES (
      ${commandId}, ${`selective-key-${sequence}`}, 'test.outbox', 'test',
      ${`aggregate-${sequence}`}, ${`hash-${sequence}`}, 'committed', '{}',
      'test', ${`correlation-${sequence}`}, 0, 1, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;
  return commandId;
}

function snapshot(automation: {
  id: string;
  name: string;
  action: string;
  config: string | null;
  conditions: string | null;
  steps: string | null;
  dryRun: boolean;
}): FrozenAutomationSnapshot {
  return { ...automation };
}

async function makeRetryReady(effectKey: string): Promise<void> {
  await rawDb.$executeRaw`
    UPDATE "OutboxIntent"
    SET "status" = 'retrying', "nextAttemptAt" = CURRENT_TIMESTAMP
    WHERE "effectKey" = ${effectKey}
  `;
}

async function status(effectKey: string): Promise<string | undefined> {
  const rows = await rawDb.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "OutboxIntent" WHERE "effectKey" = ${effectKey}
  `;
  return rows[0]?.status;
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

describe("isolated frozen automation effects", () => {
  it("does not rerun a successful sibling while a provider sibling recovers", async () => {
    const notification = await rawDb.automation.create({
      data: {
        name: "Notification sibling",
        trigger: "order.created",
        action: "send_notification",
        config: JSON.stringify({ messageTemplate: "Created" }),
        isActive: true,
      },
    });
    const whatsapp = await rawDb.automation.create({
      data: {
        name: "WhatsApp sibling",
        trigger: "order.created",
        action: "send_whatsapp",
        config: JSON.stringify({ messageTemplate: "Order {{orderNumber}}" }),
        isActive: true,
      },
    });
    const commandId = await createCommand();
    const eventPayload = {
      orderId: "order-selective",
      orderNumber: "ORD-SELECTIVE",
      customerPhone: "0555000123",
    };
    const notificationKey = await insertFrozenIntent({
      commandId,
      effectScope: "created",
      trigger: "order.created",
      eventPayload,
      automation: snapshot(notification),
    });
    const whatsappKey = await insertFrozenIntent({
      commandId,
      effectScope: "created",
      trigger: "order.created",
      eventPayload,
      automation: snapshot(whatsapp),
    });

    let providerHealthy = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (!providerHealthy) return new Response("unhealthy", { status: 503 });
        if (url.endsWith("/status")) {
          return new Response(JSON.stringify({ connected: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ ok: true, id: "wa-1", status: "sent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    expect(await processAutomationOutbox(context, { limit: 10 })).toMatchObject({
      claimed: 2,
      succeeded: 1,
      retrying: 1,
    });
    expect(await status(notificationKey)).toBe("succeeded");
    expect(await status(whatsappKey)).toBe("retrying");
    expect(
      await rawDb.automation.findUnique({ where: { id: notification.id } }),
    ).toMatchObject({ runCount: 1 });

    providerHealthy = true;
    await makeRetryReady(whatsappKey);
    expect(
      await processAutomationOutbox(context, {
        effectKey: whatsappKey,
        limit: 1,
      }),
    ).toMatchObject({ succeeded: 1, retrying: 0 });
    expect(
      await rawDb.automation.findUnique({ where: { id: notification.id } }),
    ).toMatchObject({ runCount: 1 });
    expect(
      await rawDb.automationLog.count({
        where: { automationId: notification.id, trigger: "order.created" },
      }),
    ).toBe(1);
  });

  it("resumes a remaining provider step without applying the completed tag twice", async () => {
    const customer = await rawDb.customer.create({
      data: {
        name: "Multi Step Customer",
        phone: "0555000133",
        nameBlindIndex: "multi-step-customer",
      },
    });
    const automation = await rawDb.automation.create({
      data: {
        name: "Tag then WhatsApp",
        trigger: "order.created",
        action: "tag_customer",
        steps: JSON.stringify(["tag_customer", "send_whatsapp"]),
        config: JSON.stringify({
          noteText: "Tagged once",
          messageTemplate: "Order {{orderNumber}}",
        }),
        isActive: true,
      },
    });
    const commandId = await createCommand();
    const effectKey = await insertFrozenIntent({
      commandId,
      effectScope: "created",
      trigger: "order.created",
      eventPayload: {
        orderId: "order-multi",
        orderNumber: "ORD-MULTI",
        customerId: customer.id,
        customerPhone: "0555000133",
      },
      automation: snapshot(automation),
    });

    let providerHealthy = false;
    let sendCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (!providerHealthy) return new Response("unhealthy", { status: 503 });
        if (url.endsWith("/status")) {
          return new Response(JSON.stringify({ connected: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        sendCount += 1;
        return new Response(
          JSON.stringify({ ok: true, id: "wa-multi", status: "sent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    expect(
      await processAutomationOutbox(context, { effectKey, limit: 1 }),
    ).toMatchObject({
      claimed: 1,
      succeeded: 0,
      retrying: 1,
      deadLetter: 0,
    });
    expect(await status(effectKey)).toBe("retrying");
    expect(
      await rawDb.customer.findUnique({ where: { id: customer.id } }),
    ).toMatchObject({ notes: "Tagged once" });
    expect(
      await rawDb.auditLog.count({
        where: {
          action: "automation.tag_customer.applied",
          entityId: customer.id,
          metadata: { contains: `${effectKey}:step:0` },
        },
      }),
    ).toBe(1);

    providerHealthy = true;
    await makeRetryReady(effectKey);
    expect(
      await processAutomationOutbox(context, { effectKey, limit: 1 }),
    ).toMatchObject({
      claimed: 1,
      succeeded: 1,
      retrying: 0,
      deadLetter: 0,
    });
    expect(await status(effectKey)).toBe("succeeded");
    expect(sendCount).toBe(1);
    expect(
      await rawDb.customer.findUnique({ where: { id: customer.id } }),
    ).toMatchObject({ notes: "Tagged once" });
    expect(
      await rawDb.auditLog.count({
        where: {
          action: "automation.tag_customer.applied",
          entityId: customer.id,
          metadata: { contains: `${effectKey}:step:0` },
        },
      }),
    ).toBe(1);
  });
});
