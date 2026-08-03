process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import { drainDueWhatsAppIngress } from "../inbound-worker";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const ingressContext = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};
const workerContext = { prisma: db, shop: shopContext };

function envelope(id: string, timestamp: number): WhatsAppInboundEnvelope {
  return {
    spoolId: id.toLowerCase().replace(/[^a-f0-9]/g, "a").padEnd(64, "a").slice(0, 64),
    accountId: ACCOUNT_ID,
    receivedAt: new Date(timestamp * 1_000).toISOString(),
    message: {
      key: {
        remoteJid: "213555000444@s.whatsapp.net",
        fromMe: false,
        id,
      },
      message: { conversation: `Inbound ${id}` },
      messageTimestamp: timestamp,
      pushName: "Worker Client",
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
});

describe("WhatsApp inbound restart worker", () => {
  it("drains received and due retrying events in provider order", async () => {
    const first = await persistWhatsAppInbound(
      ingressContext,
      envelope("WORKER-INBOUND-1", 1_786_000_300),
    );
    const second = await persistWhatsAppInbound(
      ingressContext,
      envelope("WORKER-INBOUND-2", 1_786_000_301),
    );
    await db.providerIngressEvent.update({
      where: { id: second.ingressEventId },
      data: {
        status: "retrying",
        nextAttemptAt: new Date(0),
        lastErrorCode: "TRANSIENT_TEST",
      },
    });

    await expect(drainDueWhatsAppIngress(workerContext, 20)).resolves.toBe(2);

    const events = await db.providerIngressEvent.findMany({
      orderBy: { providerTimestamp: "asc" },
      select: { id: true, status: true, messageId: true },
    });
    expect(events).toEqual([
      { id: first.ingressEventId, status: "applied", messageId: first.ingressEventId },
      { id: second.ingressEventId, status: "applied", messageId: second.ingressEventId },
    ]);
    await expect(db.message.count()).resolves.toBe(2);
    await expect(
      db.conversation.findFirstOrThrow({ select: { unreadCount: true } }),
    ).resolves.toEqual({ unreadCount: 2 });
  });

  it("leaves future retry work untouched", async () => {
    const ingress = await persistWhatsAppInbound(
      ingressContext,
      envelope("WORKER-FUTURE-1", 1_786_000_400),
    );
    const future = new Date(Date.now() + 60_000);
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "retrying",
        nextAttemptAt: future,
        lastErrorCode: "WAIT_FOR_BACKOFF",
      },
    });

    await expect(drainDueWhatsAppIngress(workerContext, 20)).resolves.toBe(0);
    await expect(
      db.providerIngressEvent.findUniqueOrThrow({
        where: { id: ingress.ingressEventId },
        select: { status: true, nextAttemptAt: true, attemptCount: true },
      }),
    ).resolves.toEqual({
      status: "retrying",
      nextAttemptAt: future,
      attemptCount: 0,
    });
    await expect(db.message.count()).resolves.toBe(0);
  });

  it("recovers an expired processing lease after app restart", async () => {
    const ingress = await persistWhatsAppInbound(
      ingressContext,
      envelope("WORKER-LEASE-1", 1_786_000_500),
    );
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(0),
        leaseToken: "worker-expired-lease",
      },
    });
    await db.providerIngressAttempt.create({
      data: {
        id: "worker-expired-attempt",
        ingressEventId: ingress.ingressEventId,
        attemptNumber: 1,
        leaseToken: "worker-expired-lease",
        state: "processing",
      },
    });

    await expect(drainDueWhatsAppIngress(workerContext, 20)).resolves.toBe(1);

    const attempts = await db.providerIngressAttempt.findMany({
      where: { ingressEventId: ingress.ingressEventId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ state: "lease_expired" });
    expect(attempts[1]).toMatchObject({ state: "succeeded", attemptNumber: 2 });
  });
});
