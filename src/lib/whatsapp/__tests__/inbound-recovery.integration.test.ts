process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import { ConflictError } from "@/types/errors";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";
import { retryWhatsAppInbound } from "../inbound-recovery";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

function envelope(): WhatsAppInboundEnvelope {
  return {
    spoolId: "d".repeat(64),
    accountId: ACCOUNT_ID,
    receivedAt: "2026-08-03T10:15:00.000Z",
    message: {
      key: {
        remoteJid: "213555000333@s.whatsapp.net",
        fromMe: false,
        id: "PROVIDER-INBOUND-RECOVERY-1",
      },
      message: { conversation: "Recovered inbound" },
      messageTimestamp: 1_786_000_200,
      pushName: "Recovery Client",
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

describe("WhatsApp inbound operator recovery", () => {
  it("grants a new bounded budget without reusing attempt numbers", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "dead_letter",
        attemptCount: 6,
        operatorRetryCount: 0,
        lastErrorCode: "ATTEMPT_BUDGET_EXHAUSTED",
        deadLetteredAt: new Date(),
      },
    });
    await db.providerIngressAttempt.create({
      data: {
        id: "dead-letter-attempt",
        ingressEventId: ingress.ingressEventId,
        attemptNumber: 6,
        state: "dead_letter",
        errorCode: "ATTEMPT_BUDGET_EXHAUSTED",
        completedAt: new Date(),
      },
    });

    const reason = "Customer 0555000333 confirmed the message";
    const result = await retryWhatsAppInbound(context, {
      ingressEventId: ingress.ingressEventId,
      auditActor: "authenticated-owner:person:owner-1:session:session-1",
      reason,
    });

    expect(result.state).toBe("applied");
    await expect(
      db.providerIngressEvent.findUniqueOrThrow({
        where: { id: ingress.ingressEventId },
        select: {
          attemptCount: true,
          operatorRetryCount: true,
          status: true,
        },
      }),
    ).resolves.toEqual({
      attemptCount: 7,
      operatorRetryCount: 1,
      status: "applied",
    });
    const attempts = await db.providerIngressAttempt.findMany({
      where: { ingressEventId: ingress.ingressEventId },
      orderBy: { attemptNumber: "asc" },
    });
    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([6, 7]);
    expect(attempts[1]).toMatchObject({ state: "succeeded" });

    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "whatsapp.ingress.retry_requested" },
    });
    expect(audit.actor).toBe(
      "authenticated-owner:person:owner-1:session:session-1",
    );
    expect(audit.metadata).not.toContain("0555000333");
    expect(audit.metadata).not.toContain("confirmed the message");
    expect(JSON.parse(audit.metadata ?? "{}")).toEqual({
      reasonHash: createHash("sha256").update(reason).digest("hex"),
      reasonLength: reason.length,
    });
  });

  it("rejects recovery while a live processing lease owns the event", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(),
        leaseToken: "active-lease",
      },
    });

    await expect(
      retryWhatsAppInbound(context, {
        ingressEventId: ingress.ingressEventId,
        auditActor: "authenticated-owner:test",
        reason: "Retry after review",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(db.auditLog.count()).resolves.toBe(0);
  });

  it("rejects replay after canonical application", async () => {
    const ingress = await persistWhatsAppInbound(context, envelope());
    await db.providerIngressEvent.update({
      where: { id: ingress.ingressEventId },
      data: {
        status: "applied",
        conversationId: "conversation-existing",
        messageId: "message-existing",
        appliedAt: new Date(),
      },
    });

    await expect(
      retryWhatsAppInbound(context, {
        ingressEventId: ingress.ingressEventId,
        auditActor: "authenticated-owner:test",
        reason: "Retry after review",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
