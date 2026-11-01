process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, dbRaw, shopContext } from "@/lib/db";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import { processWhatsAppInbound } from "../inbound-processor";

// MSG-15: a provider message with no time reaches the app as time 0. The app
// must then use the time it first received the message, not 1970, so the new
// thread does not sort last in the inbox.

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const JID = "213555000444@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

const RECEIVED_AT = "2026-08-03T10:00:00.000Z";
const REAL_PROVIDER_SECONDS = 1_786_000_100;

function envelope(
  id: string,
  messageTimestamp: number,
  receivedAt = RECEIVED_AT,
  remoteJid = JID,
): WhatsAppInboundEnvelope {
  return {
    spoolId: "d".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt,
    message: {
      key: { remoteJid, fromMe: false, id },
      message: { conversation: "salam" },
      messageTimestamp,
      pushName: "Client",
    },
  };
}

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
  await db.whatsAppOutboundEffect.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  // Another test file may have left alerts behind in this shared database, and an event cannot be deleted while an
  // alert still points at it, so the alerts (and their delivery attempts) go first, as in every other test that does this.
  await db.notificationDeliveryAttempt.deleteMany();
  await db.operationalNotification.deleteMany();
  await db.notificationEvent.deleteMany();
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

async function receive(input: WhatsAppInboundEnvelope) {
  const ingress = await persistWhatsAppInbound(context, input);
  const processed = await processWhatsAppInbound(
    context,
    ingress.ingressEventId,
  );
  expect(processed.state).toBe("applied");
  return ingress;
}

describe("inbound message with no provider time (MSG-15)", () => {
  it("stores the received time as the message time and the thread's lastMessageAt", async () => {
    const ingress = await receive(envelope("MISSING-TIME-1", 0));

    const message = await db.message.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
    });
    expect(message.timestamp.toISOString()).toBe(RECEIVED_AT);

    const conversation = await db.conversation.findFirstOrThrow({
      where: { sourceId: JID },
    });
    expect(conversation.lastMessageAt?.toISOString()).toBe(RECEIVED_AT);
    expect(conversation.waitingSince?.toISOString()).toBe(RECEIVED_AT);

    const notice = await db.notificationEvent.findFirstOrThrow({
      where: { sourceRecordId: ingress.ingressEventId },
    });
    expect(notice.occurredAt.toISOString()).toBe(RECEIVED_AT);
  });

  it("keeps the real provider time when there is one", async () => {
    const ingress = await receive(
      envelope("REAL-TIME-1", REAL_PROVIDER_SECONDS, "2026-09-09T09:09:09.000Z"),
    );

    const message = await db.message.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
    });
    expect(message.timestamp.getTime()).toBe(REAL_PROVIDER_SECONDS * 1_000);
    const conversation = await db.conversation.findFirstOrThrow({
      where: { sourceId: JID },
    });
    expect(conversation.lastMessageAt?.getTime()).toBe(
      REAL_PROVIDER_SECONDS * 1_000,
    );
  });

  it("gives the same time when the same record is processed twice", async () => {
    const ingress = await receive(envelope("MISSING-TIME-TWICE", 0));
    const before = await db.message.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
    });

    const again = await processWhatsAppInbound(
      context,
      ingress.ingressEventId,
    );

    expect(again.state).toBe("applied");
    expect(await db.message.count()).toBe(1);
    const after = await db.message.findUniqueOrThrow({
      where: { id: ingress.ingressEventId },
    });
    expect(after.timestamp.toISOString()).toBe(before.timestamp.toISOString());
    expect(after.timestamp.toISOString()).toBe(RECEIVED_AT);
  });

  it("keeps the first received time when the sidecar sends the event again later", async () => {
    const first = await persistWhatsAppInbound(
      context,
      envelope("MISSING-TIME-REPLAY", 0, RECEIVED_AT),
    );
    // Same provider content, new delivery metadata after a reconnect.
    const replay = await persistWhatsAppInbound(
      context,
      envelope("MISSING-TIME-REPLAY", 0, "2026-08-05T18:30:00.000Z"),
    );
    expect(replay).toMatchObject({
      ingressEventId: first.ingressEventId,
      replayed: true,
    });

    await processWhatsAppInbound(context, first.ingressEventId);

    const message = await db.message.findUniqueOrThrow({
      where: { id: first.ingressEventId },
    });
    expect(message.timestamp.toISOString()).toBe(RECEIVED_AT);
  });

  it("puts a new thread with no provider time ahead of an older thread", async () => {
    // 1_786_000_100 is 2026-08-06; the no-time message arrived after it.
    await receive(
      envelope(
        "OLDER-THREAD-1",
        REAL_PROVIDER_SECONDS,
        RECEIVED_AT,
        "213555000555@s.whatsapp.net",
      ),
    );
    await receive(envelope("NO-TIME-THREAD-1", 0, "2026-08-10T08:00:00.000Z"));

    const [first] = await db.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
    });
    expect(first?.sourceId).toBe(JID);
  });
});
