process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { FrozenAutomationSnapshot } from "../automation-outbox";
import { getBusinessEnvelopeKey } from "../envelope-key";
import { processAutomationOutbox } from "../outbox-worker";
import { sealBusinessPayloadWithKey } from "../payload-codec";

const context = { prisma: rawDb as never };
let sequence = 0;

beforeEach(cleanDb);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function insertFrozenIntent(options: {
  automation: FrozenAutomationSnapshot;
  eventPayload: Record<string, unknown>;
}) {
  sequence += 1;
  const commandId = `pii-command-${sequence}`;
  const effectKey = `${commandId}:automation:confirmed:${options.automation.id}`;
  await rawDb.$executeRaw`
    INSERT INTO "BusinessCommand" (
      "id", "idempotencyKey", "commandType", "aggregateType", "aggregateId",
      "requestHash", "status", "resultJson", "actor", "correlationId",
      "expectedVersion", "committedVersion", "createdAt", "committedAt"
    ) VALUES (
      ${commandId}, ${`pii-key-${sequence}`}, 'test.pii', 'test',
      ${`aggregate-${sequence}`}, ${`hash-${sequence}`}, 'committed', '{}',
      'test', ${`correlation-${sequence}`}, 0, 1, CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `;
  const payloadJson = sealBusinessPayloadWithKey(
    {
      version: 2,
      trigger: "order.confirmed",
      eventPayload: options.eventPayload,
      automation: options.automation,
    },
    {
      kind: "outbox-intent",
      recordKey: effectKey,
      recordType: "automation.dispatch.v2",
      commandId,
    },
    await getBusinessEnvelopeKey(context),
  );
  await rawDb.$executeRaw`
    INSERT INTO "OutboxIntent" (
      "id", "effectKey", "commandId", "effectType", "payloadJson", "status",
      "attemptCount", "createdAt", "updatedAt"
    ) VALUES (
      ${`pii-intent-${sequence}`}, ${effectKey}, ${commandId},
      'automation.dispatch.v2', ${payloadJson}, 'queued', 0,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `;
  return effectKey;
}

describe("frozen automation outbox PII boundary", () => {
  it("sends the real phone and effect key to the provider but never persists the phone", async () => {
    const phone = "0555123456";
    const automation = await rawDb.automation.create({
      data: {
        name: "Private WhatsApp",
        trigger: "order.confirmed",
        action: "send_whatsapp",
        config: JSON.stringify({
          messageTemplate: "Hello {{customerName}}, order {{orderNumber}} confirmed",
        }),
        isActive: true,
      },
    });
    const snapshot: FrozenAutomationSnapshot = {
      id: automation.id,
      name: automation.name,
      action: automation.action,
      config: automation.config,
      conditions: automation.conditions,
      steps: automation.steps,
      dryRun: automation.dryRun,
    };
    const effectKey = await insertFrozenIntent({
      automation: snapshot,
      eventPayload: {
        orderId: "private-order",
        orderNumber: "PRIVATE-001",
        customerName: "Private Customer",
        customerPhone: phone,
      },
    });

    let sentBody: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/status")) {
          return new Response(JSON.stringify({ connected: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        sentBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({ ok: true, id: "wa-private", status: "sent" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toMatchObject({
      claimed: 1,
      succeeded: 1,
    });
    expect(sentBody).toMatchObject({
      to: phone,
      idempotencyKey: effectKey,
    });
    expect(String(sentBody.text)).toContain("Private Customer");

    const log = await rawDb.automationLog.findFirst({
      where: { automationId: automation.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.payload).not.toContain(phone);
    expect(log?.message).not.toContain(phone);
    expect(log?.payload).not.toContain("Private Customer");
  });

  it("keeps the real phone available during condition evaluation", async () => {
    const automation = await rawDb.automation.create({
      data: {
        name: "Phone prefix condition",
        trigger: "order.confirmed",
        action: "send_notification",
        conditions: JSON.stringify({
          all: [
            {
              field: "customerPhone",
              operator: "starts_with",
              value: "0555",
            },
          ],
        }),
        config: JSON.stringify({ messageTemplate: "Matched" }),
        isActive: true,
      },
    });
    const effectKey = await insertFrozenIntent({
      automation: {
        id: automation.id,
        name: automation.name,
        action: automation.action,
        config: automation.config,
        conditions: automation.conditions,
        steps: automation.steps,
        dryRun: automation.dryRun,
      },
      eventPayload: {
        orderId: "condition-order",
        orderNumber: "CONDITION-1",
        customerPhone: "0555123456",
      },
    });

    expect(await processAutomationOutbox(context, { effectKey, limit: 1 })).toMatchObject({
      succeeded: 1,
    });
    expect(await rawDb.automationLog.findFirst({
      where: { automationId: automation.id },
    })).toMatchObject({
      status: "success",
      message: "Notification: Matched",
    });
  });
});
