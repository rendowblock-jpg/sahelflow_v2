process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { openBusinessPayloadWithKey } from "@/lib/business-truth/payload-codec";
import { db, dbRaw, shopContext } from "@/lib/db";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import {
  AUTOMATION_TRIGGER_EFFECT_TYPE,
  processWhatsAppInbound,
} from "../inbound-processor";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

function envelope(id = "PROVIDER-INBOUND-PROCESS-1"): WhatsAppInboundEnvelope {
  return {
    spoolId: "c".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt: "2026-08-03T10:00:00.000Z",
    message: {
      key: {
        remoteJid: "213555000222@s.whatsapp.net",
        fromMe: false,
        id,
      },
      message: { conversation: "Message client durable" },
      messageTimestamp: 1_786_000_100,
      pushName: "Client Durable",
    },
  };
}

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.projectionInvalidation.deleteMany();
  await db.outboxIntent.deleteMany();
  await db.domainEvent.deleteMany();
  await db.businessCommand.deleteMany();
  await db.businessAggregateVersion.deleteMany();
  await db.auditLog.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
  await dbRaw.$disconnect();
});

describe("durable WhatsApp inbound normalization", () => {
  it("atomically creates canonical inbox truth and a durable trigger intent", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    const processed = await processWhatsAppInbound(context, ingress.ingressEventId);

    expect(processed).toMatchObject({
      state: "applied",
      messageId: ingress.ingressEventId,
      publish: true,
      errorCode: null,
    });
    const storedIngress = await db.providerIngressEvent.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
    });
    expect(storedIngress).toMatchObject({
      status: "applied",
      messageId: ingress.ingressEventId,
      attemptCount: 1,
      operatorRetryCount: 0,
      leaseToken: null,
      lastErrorCode: null,
    });
    await expect(
      db.providerIngressAttempt.findFirstOrThrow({
        where: { ingressEventId: ingress.ingressEventId },
      }),
    ).resolves.toMatchObject({ state: "succeeded", attemptNumber: 1 });

    const conversation = await db.conversation.findUniqueOrThrow({
      where: {
        channel_sourceId: {
          channel: "whatsapp",
          sourceId: envelope().message.key.remoteJid,
        },
      },
      include: { messages: true },
    });
    expect(conversation).toMatchObject({
      contactName: "Client Durable",
      contactPhone: "213555000222",
      unreadCount: 1,
      status: "open",
    });
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({
      id: ingress.ingressEventId,
      direction: "inbound",
      body: "Message client durable",
      messageType: "text",
    });

    const rawMessage = await dbRaw.message.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
      select: { body: true },
    });
    expect(rawMessage.body).not.toContain("Message client durable");

    const command = await db.businessCommand.findFirstOrThrow({
      where: { commandType: "whatsapp_message.receive.v1" },
    });
    expect(command.actor).toBe("provider:whatsapp");
    await expect(
      db.domainEvent.findFirstOrThrow({ where: { commandId: command.id } }),
    ).resolves.toMatchObject({ eventType: "whatsapp.message.received.v1" });

    const intent = await db.outboxIntent.findFirstOrThrow({
      where: { commandId: command.id, effectType: AUTOMATION_TRIGGER_EFFECT_TYPE },
    });
    expect(intent.payloadJson).not.toContain("Message client durable");
    expect(intent.payloadJson).not.toContain("213555000222");
    const payload = openBusinessPayloadWithKey<{
      trigger: string;
      customerPhone: string | null;
      messageId: string;
    }>(
      intent.payloadJson,
      {
        kind: "outbox-intent",
        recordKey: intent.effectKey,
        recordType: intent.effectType,
        commandId: command.id,
      },
      await getBusinessEnvelopeKey(context),
    );
    expect(payload).toMatchObject({
      trigger: "message.received",
      customerPhone: "213555000222",
      messageId: ingress.ingressEventId,
    });
  });

  it("replays applied ingress without duplicating message, unread count or trigger intent", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    const first = await processWhatsAppInbound(context, ingress.ingressEventId);
    const replay = await processWhatsAppInbound(context, ingress.ingressEventId);

    expect(replay).toEqual(first);
    await expect(db.message.count()).resolves.toBe(1);
    await expect(db.conversation.count()).resolves.toBe(1);
    await expect(db.outboxIntent.count()).resolves.toBe(1);
    await expect(db.businessCommand.count()).resolves.toBe(1);
    await expect(db.providerIngressAttempt.count()).resolves.toBe(1);
    await expect(
      db.conversation.findFirstOrThrow({ select: { unreadCount: true } }),
    ).resolves.toEqual({ unreadCount: 1 });
  });

  it("recovers an expired pre-application lease with truthful immutable attempt history", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(0),
        leaseToken: "expired-lease",
      },
    });
    await db.providerIngressAttempt.create({
      data: {
        id: "expired-attempt",
        ingressEventId: ingress.ingressEventId,
        attemptNumber: 1,
        leaseToken: "expired-lease",
        state: "processing",
      },
    });

    const recovered = await processWhatsAppInbound(context, ingress.ingressEventId);

    expect(recovered.state).toBe("applied");
    await expect(
      db.providerIngressEvent.findUniqueOrThrow({
        where: { id: ingress.ingressEventId },
        select: { attemptCount: true, status: true },
      }),
    ).resolves.toEqual({ attemptCount: 2, status: "applied" });
    const attempts = await db.providerIngressAttempt.findMany({
      where: { ingressEventId: ingress.ingressEventId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      state: "lease_expired",
      errorCode: "LEASE_EXPIRED",
    });
    expect(attempts[0]?.completedAt).not.toBeNull();
    expect(attempts[1]).toMatchObject({ attemptNumber: 2, state: "succeeded" });
  });
});
