process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";

import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import { processWhatsAppInbound } from "../inbound-processor";

/**
 * F-0031. Prisma's interactive transaction waits 2 s for a connection and
 * rolls back after 5 s. On the Founder's Celeron (about 7x slower than the lab)
 * that rolls a message back with P2028 and the sidecar tries again, which costs
 * more CPU. The two interactive transactions of the inbound processor now say
 * how long they may wait and run: the same numbers the search index uses.
 * The work inside them is unchanged; these tests run the real processor on the
 * real database and only watch the options that reach $transaction.
 */
const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const EXPECTED = { maxWait: 10_000, timeout: 30_000 };

type Options = { maxWait?: number; timeout?: number } | undefined;

function watched(): { prisma: typeof db; seen: Options[] } {
  const seen: Options[] = [];
  const prisma = new Proxy(db, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (callback: unknown, options?: Options) => {
          seen.push(options);
          return (target.$transaction as unknown as (c: unknown, o?: Options) => unknown)(
            callback,
            options,
          );
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { prisma, seen };
}

function envelope(id: string): WhatsAppInboundEnvelope {
  return {
    spoolId: "e".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt: "2026-11-03T10:00:00.000Z",
    message: {
      key: { remoteJid: "213555000444@s.whatsapp.net", fromMe: false, id },
      message: { conversation: "transaction options" },
      messageTimestamp: 1_786_000_300,
      pushName: "Options",
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
  await db.notificationEvent.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("inbound processor transaction options (F-0031)", () => {
  it("the claim transaction states maxWait 10 s and timeout 30 s", async () => {
    const base = { prisma: db, shop: shopContext, whatsAppProviderAccountId: ACCOUNT_ID };
    const stored = await persistWhatsAppInbound(base, envelope("OPT-CLAIM"));
    const { prisma, seen } = watched();

    const result = await processWhatsAppInbound({ ...base, prisma }, stored.ingressEventId);

    expect(result.state).toBe("applied");
    // The first interactive transaction of the run is the claim.
    expect(seen[0]).toEqual(EXPECTED);
  });

  it("the failure-recording transaction states the same options", async () => {
    const base = { prisma: db, shop: shopContext, whatsAppProviderAccountId: ACCOUNT_ID };
    const stored = await persistWhatsAppInbound(base, envelope("OPT-FAIL"));
    // Make the stored envelope unreadable so the apply stage fails and the
    // processor must record the failure.
    await db.providerIngressEvent.update({
      where: { id: stored.ingressEventId },
      data: { payloadJson: "not a sealed payload" },
    });
    const { prisma, seen } = watched();

    const result = await processWhatsAppInbound({ ...base, prisma }, stored.ingressEventId);

    expect(["retrying", "quarantined"]).toContain(result.state);
    // claim, then the failure record: both carry the options.
    const processorCalls = seen.slice(0, 2);
    expect(processorCalls).toHaveLength(2);
    expect(processorCalls).toEqual([EXPECTED, EXPECTED]);
  });
});
