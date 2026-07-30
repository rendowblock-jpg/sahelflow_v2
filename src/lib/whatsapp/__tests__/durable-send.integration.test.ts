process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { SidecarRequestError } from "../sidecar-client";
import {
  findWhatsAppEffectByMessageId,
  getWhatsAppEffectStatus,
  processWhatsAppEffect,
  queueWhatsAppText,
  retryWhatsAppEffect,
} from "../durable-send";

const context = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("phase3-test-session"),
};
const messageId = "11111111-1111-4111-8111-111111111111";

async function clean(): Promise<void> {
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

describe("durable WhatsApp text send", () => {
  it("queues encrypted content atomically and replays the original command", async () => {
    const first = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555 00 01 11",
      text: "Bonjour secret client",
    });
    const replay = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555 00 01 11",
      text: "Bonjour secret client",
    });
    expect(first.effectKey).toMatch(/^wa:[0-9a-f]{32}:text:/);
    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ effectKey: first.effectKey, replayed: true });

    const outbox = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: first.effectKey },
    });
    expect(outbox.payloadJson).not.toContain("0555000111");
    expect(outbox.payloadJson).not.toContain("Bonjour secret client");
    await expect(
      db.whatsAppOutboundEffect.findUniqueOrThrow({
        where: { effectKey: first.effectKey },
      }),
    ).resolves.toMatchObject({ messageId, providerMessageId: null });
    await expect(findWhatsAppEffectByMessageId(context, messageId)).resolves.toMatchObject({
      effectKey: first.effectKey,
      state: "queued",
    });
  });

  it("commits one provider receipt and never calls the provider on exact replay", async () => {
    const { effectKey } = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555000111",
      text: "Send once",
    });
    const sender = vi.fn(async () => ({
      ok: true,
      id: "WA-RECEIPT-1",
      status: "sent",
    }));
    await expect(processWhatsAppEffect(context, effectKey, sender)).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-RECEIPT-1",
    });
    await expect(processWhatsAppEffect(context, effectKey, sender)).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-RECEIPT-1",
    });
    expect(sender).toHaveBeenCalledTimes(1);
    await expect(
      db.whatsAppOutboundEffect.findUniqueOrThrow({ where: { effectKey } }),
    ).resolves.toMatchObject({ providerMessageId: "WA-RECEIPT-1" });
    await expect(db.message.findUniqueOrThrow({ where: { id: messageId } })).resolves.toMatchObject({
      deliveryStatus: "sent",
    });
  });

  it("schedules a safe retry for a deterministic pre-submit rejection", async () => {
    const { effectKey } = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555000111",
      text: "Retry safely",
    });
    const unavailable = vi.fn(async () => {
      throw new SidecarRequestError(
        "not connected",
        "WHATSAPP_NOT_CONNECTED",
        true,
        false,
        503,
      );
    });
    await expect(processWhatsAppEffect(context, effectKey, unavailable)).resolves.toMatchObject({
      state: "retrying",
      errorCode: "WHATSAPP_NOT_CONNECTED",
    });
    await db.outboxIntent.update({
      where: { effectKey },
      data: { nextAttemptAt: new Date(0) },
    });
    const sender = vi.fn(async () => ({ ok: true, id: "WA-RETRY-1", status: "sent" }));
    await expect(processWhatsAppEffect(context, effectKey, sender)).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-RETRY-1",
      attemptCount: 2,
    });
  });

  it("quarantines ambiguous outcomes until the operator confirms duplicate risk", async () => {
    const { effectKey } = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555000111",
      text: "Ambiguous send",
    });
    const ambiguous = vi.fn(async () => {
      throw new SidecarRequestError(
        "timed out after submit",
        "WHATSAPP_SEND_AMBIGUOUS",
        false,
        true,
        502,
      );
    });
    await expect(processWhatsAppEffect(context, effectKey, ambiguous)).resolves.toMatchObject({
      state: "ambiguous",
      requiresDuplicateConfirmation: true,
    });
    await expect(retryWhatsAppEffect(context, effectKey, false, ambiguous)).rejects.toThrow(
      /confirm duplicate risk/i,
    );
    const reconciled = vi.fn(async () => ({
      ok: true,
      id: "WA-RECOVERED-1",
      status: "sent",
    }));
    await expect(retryWhatsAppEffect(context, effectKey, true, reconciled)).resolves.toMatchObject({
      state: "succeeded",
      providerMessageId: "WA-RECOVERED-1",
    });
  });

  it("leases one worker so concurrent processors cannot duplicate the provider call", async () => {
    const { effectKey } = await queueWhatsAppText(context, {
      clientMessageId: messageId,
      to: "0555000111",
      text: "Concurrent send",
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sender = vi.fn(async () => {
      await held;
      return { ok: true, id: "WA-CONCURRENT-1", status: "sent" };
    });
    const first = processWhatsAppEffect(context, effectKey, sender);
    await vi.waitFor(() => expect(sender).toHaveBeenCalledTimes(1));
    await expect(processWhatsAppEffect(context, effectKey, sender)).resolves.toMatchObject({
      state: "processing",
    });
    release();
    await expect(first).resolves.toMatchObject({ state: "succeeded" });
    expect(sender).toHaveBeenCalledTimes(1);
    await expect(getWhatsAppEffectStatus(context, effectKey)).resolves.toMatchObject({
      state: "succeeded",
    });
  });
});