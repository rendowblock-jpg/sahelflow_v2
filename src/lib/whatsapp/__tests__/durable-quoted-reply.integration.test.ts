process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { queueWhatsAppText } from "../durable-send";
import { normalizeWhatsAppJid } from "../types";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("phase3-test-session"),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const jid = normalizeWhatsAppJid("0555000111");

async function clean(): Promise<void> {
  await db.whatsAppOutboundEffect.deleteMany();
  await db.providerIngressEvent.deleteMany();
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
afterEach(async () => {
  await clean();
  await db.$disconnect();
});

async function seedInboundTarget(providerEventId: string): Promise<string> {
  const conversation = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Quoted customer",
      sourceId: jid,
      lastMessageAt: new Date(0),
    },
  });
  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      body: "Inbound question about delivery",
      direction: "inbound",
      timestamp: new Date(0),
      messageType: "text",
    },
  });
  await db.providerIngressEvent.create({
    data: {
      id: `ingress-${providerEventId}`,
      ingressKey: `ingress-key-${providerEventId}`,
      provider: "whatsapp",
      environment: "test",
      providerAccountHash: "0".repeat(64),
      eventType: "message",
      sourceId: jid,
      providerEventId,
      payloadJson: "{}",
      payloadHash: "0".repeat(64),
      status: "applied",
      messageId: message.id,
    },
  });
  return message.id;
}

describe("durable WhatsApp quoted replies", () => {
  it("binds the provider quote context and persists the reply projection", async () => {
    const targetId = await seedInboundTarget("WASTANZA0001");
    const queued = await queueWhatsAppText(context, {
      clientMessageId: "22222222-2222-4222-8222-222222222222",
      to: jid,
      text: "Reply with visible context",
      quotedMessageId: targetId,
    });
    const sender = vi.fn(async () => ({
      ok: true,
      id: "WA-QUOTED-RECEIPT",
      status: "sent",
    }));

    await expect(
      processAndAssert(queued.effectKey, sender),
    ).resolves.toBeUndefined();

    expect(sender).toHaveBeenCalledWith(
      jid,
      "Reply with visible context",
      queued.effectKey,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.objectContaining({
        stanzaId: "WASTANZA0001",
        fromMe: false,
        participant: jid,
        stubKind: "text",
        stubText: "Inbound question about delivery",
      }),
    );
    await expect(
      db.message.findUniqueOrThrow({
        where: { id: "22222222-2222-4222-8222-222222222222" },
      }),
    ).resolves.toMatchObject({ quotedMessageId: targetId });
  });

  it("rejects quoting a message from a different conversation", async () => {
    const otherConversation = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: "Other chat",
        sourceId: normalizeWhatsAppJid("0555000222"),
        lastMessageAt: new Date(0),
      },
    });
    const foreign = await db.message.create({
      data: {
        conversationId: otherConversation.id,
        body: "Foreign message",
        direction: "inbound",
        timestamp: new Date(0),
      },
    });
    await expect(
      queueWhatsAppText(context, {
        clientMessageId: "33333333-3333-4333-8333-333333333333",
        to: jid,
        text: "Cross-conversation quote",
        quotedMessageId: foreign.id,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });

  it("refuses outbound quote targets that WhatsApp has not confirmed", async () => {
    const conversation = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: "Own pending message",
        sourceId: jid,
        lastMessageAt: new Date(0),
      },
    });
    const pendingOutbound = await db.message.create({
      data: {
        conversationId: conversation.id,
        body: "Still sending",
        direction: "outbound",
        timestamp: new Date(0),
      },
    });
    await expect(
      queueWhatsAppText(context, {
        clientMessageId: "44444444-4444-4444-8444-444444444444",
        to: jid,
        text: "Quote of pending send",
        quotedMessageId: pendingOutbound.id,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps unquoted text authority identical to the legacy binding", async () => {
    const queued = await queueWhatsAppText(context, {
      clientMessageId: "55555555-5555-4555-8555-555555555555",
      to: jid,
      text: "Plain reply",
    });
    const sender = vi.fn(async () => ({
      ok: true,
      id: "WA-PLAIN-RECEIPT",
      status: "sent",
    }));
    await expect(
      processAndAssert(queued.effectKey, sender),
    ).resolves.toBeUndefined();
    expect(sender).toHaveBeenLastCalledWith(
      jid,
      "Plain reply",
      queued.effectKey,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      null,
    );
  });
});

async function processAndAssert(
  effectKey: string,
  sender: ReturnType<typeof vi.fn>,
): Promise<void> {
  const { processWhatsAppEffect } = await import("../durable-send");
  const status = await processWhatsAppEffect(
    context,
    effectKey,
    sender as unknown as Parameters<typeof processWhatsAppEffect>[2],
  );
  expect(status.state).toBe("succeeded");
}
