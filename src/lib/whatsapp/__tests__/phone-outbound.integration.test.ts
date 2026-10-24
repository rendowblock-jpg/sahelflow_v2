process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import { persistWhatsAppPhoneOutbound } from "../phone-outbound";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const JID = "213555000333@s.whatsapp.net";
const PROVIDER_ID = "PHONEWAMID0001";

const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

function envelope(id = PROVIDER_ID) {
  return {
    spoolId: "c".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt: "2026-08-03T12:00:00.000Z",
    message: {
      key: { remoteJid: JID, fromMe: true as const, id },
      message: { conversation: "Sent from the phone" },
      messageTimestamp: 1_786_020_000,
      pushName: "Seller",
    },
  };
}

async function clean(): Promise<void> {
  await db.whatsAppOutboundEffect.deleteMany();
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("phone-sent fromMe messages", () => {
  it("persists one outbound row and never a second inbound", async () => {
    const first = await persistWhatsAppPhoneOutbound(context, envelope());
    const second = await persistWhatsAppPhoneOutbound(context, envelope());

    expect(first).toMatchObject({
      messageId: PROVIDER_ID,
      created: true,
      replayed: false,
    });
    expect(second).toMatchObject({
      messageId: PROVIDER_ID,
      created: false,
      replayed: true,
    });
    expect(await db.message.count()).toBe(1);
    expect(await db.providerIngressEvent.count()).toBe(0);
    await expect(
      db.message.findUniqueOrThrow({ where: { id: PROVIDER_ID } }),
    ).resolves.toMatchObject({
      direction: "outbound",
      body: "Sent from the phone",
      deliveryStatus: "sent",
    });
    const conversation = await db.conversation.findFirstOrThrow({
      where: { sourceId: JID },
    });
    expect(conversation.channel).toBe("whatsapp");
  });

  it("uses the received time when the phone message has no provider time (MSG-15)", async () => {
    const noTime = envelope("PHONEWAMID-NOTIME");
    noTime.message.messageTimestamp = 0;

    await persistWhatsAppPhoneOutbound(context, noTime);
    const again = await persistWhatsAppPhoneOutbound(context, {
      ...noTime,
      receivedAt: "2026-08-09T09:00:00.000Z",
    });

    expect(again.replayed).toBe(true);
    const message = await db.message.findUniqueOrThrow({
      where: { id: "PHONEWAMID-NOTIME" },
    });
    expect(message.timestamp.toISOString()).toBe("2026-08-03T12:00:00.000Z");
    const conversation = await db.conversation.findFirstOrThrow({
      where: { sourceId: JID },
    });
    expect(conversation.lastMessageAt?.toISOString()).toBe(
      "2026-08-03T12:00:00.000Z",
    );
  });

  it("keeps the real provider time of a phone message", async () => {
    await persistWhatsAppPhoneOutbound(context, envelope("PHONEWAMID-REAL"));

    const message = await db.message.findUniqueOrThrow({
      where: { id: "PHONEWAMID-REAL" },
    });
    expect(message.timestamp.getTime()).toBe(1_786_020_000 * 1_000);
  });

  it("does not create a second message when the app already owns the provider id", async () => {
    const conversation = await db.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: "Existing",
        sourceId: JID,
        lastMessageAt: new Date(0),
      },
    });
    const message = await db.message.create({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        conversationId: conversation.id,
        body: "Sent from SahelFlow",
        direction: "outbound",
        timestamp: new Date(0),
      },
    });
    await db.whatsAppOutboundEffect.create({
      data: {
        effectKey: "wa:existing-phone-echo",
        messageId: message.id,
        providerMessageId: PROVIDER_ID,
      },
    });

    const stored = await persistWhatsAppPhoneOutbound(context, envelope());

    expect(stored).toMatchObject({
      messageId: message.id,
      created: false,
      replayed: true,
    });
    expect(await db.message.count()).toBe(1);
    expect(await db.providerIngressEvent.count()).toBe(0);
    await expect(
      db.message.findUniqueOrThrow({ where: { id: message.id } }),
    ).resolves.toMatchObject({ direction: "outbound" });
  });
});
