process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ send: vi.fn(), receipt: vi.fn() }));

vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>();
  return {
    ...actual,
    sidecar: { ...actual.sidecar, send: provider.send, receipt: provider.receipt },
  };
});

import {
  systemBusinessPrincipal,
  testAuthenticatedOwnerBusinessPrincipal,
} from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import {
  WHATSAPP_DOCUMENT_EFFECT_TYPE,
  WHATSAPP_IMAGE_EFFECT_TYPE,
  WHATSAPP_TEXT_EFFECT_TYPE,
  WHATSAPP_VIDEO_EFFECT_TYPE,
  WHATSAPP_VOICE_EFFECT_TYPE,
  approveHeldWhatsAppEffect,
  drainDueWhatsAppEffects,
  getWhatsAppEffectStatus,
  queueWhatsAppText,
} from "../durable-send";
import { WhatsAppSendGuardError } from "../send-guard";
import { SEND_GUARD_EFFECT_TYPES } from "../send-guard-store";

const ownerContext = {
  prisma: db,
  shop: shopContext,
  businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("phase3-test-session"),
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
};
const automationContext = {
  ...ownerContext,
  businessPrincipal: systemBusinessPrincipal("automation-worker"),
};

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

beforeEach(async () => {
  await clean();
  provider.send.mockReset().mockResolvedValue({ ok: true, id: "WA-GUARD-1", status: "sent" });
  provider.receipt.mockReset().mockResolvedValue(null);
});

afterAll(async () => {
  await clean();
  await db.$disconnect();
});

function phone(n: number): string {
  return "0555000" + String(100 + n);
}

async function chat(n: number): Promise<{ id: string; to: string }> {
  const created = await db.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "c" + n,
      contactPhone: "213555000" + (100 + n),
      sourceId: "213555000" + (100 + n) + "@s.whatsapp.net",
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });
  return { id: created.id, to: phone(n) };
}

/** Persisted history: what a restart would find on disk. */
async function seedOutbound(
  conversationId: string,
  count: number,
  opts: { body?: string; ageSeconds?: number; spacingSeconds?: number } = {},
): Promise<void> {
  const base = Date.now() - (opts.ageSeconds ?? 600) * 1000;
  await db.message.createMany({
    data: Array.from({ length: count }, (_unused, i) => ({
      id: randomUUID(),
      conversationId,
      body: opts.body ?? "history " + i,
      direction: "outbound",
      timestamp: new Date(base - i * (opts.spacingSeconds ?? 1) * 1000),
      deliveryStatus: "sent",
    })),
  });
}

function send(
  ctx: typeof ownerContext,
  target: { id: string; to: string },
  text: string,
  clientMessageId: string = randomUUID(),
) {
  return queueWhatsAppText(ctx, { clientMessageId, to: target.to, conversationId: target.id, text });
}

describe("send guard integration (counts come from persisted rows)", () => {
  it("pins the effect types the shell counts to the real constants", () => {
    expect([...SEND_GUARD_EFFECT_TYPES].sort()).toEqual(
      [
        WHATSAPP_TEXT_EFFECT_TYPE,
        WHATSAPP_IMAGE_EFFECT_TYPE,
        WHATSAPP_VIDEO_EFFECT_TYPE,
        WHATSAPP_DOCUMENT_EFFECT_TYPE,
        WHATSAPP_VOICE_EFFECT_TYPE,
      ].sort(),
    );
  });

  it("warns a person at 40 in an hour but still queues the message", async () => {
    const a = await chat(1);
    await seedOutbound(a.id, 39);
    expect((await send(ownerContext, a, "hello")).guard).toBeUndefined();
    const warned = await send(ownerContext, a, "hello again");
    expect(warned.guard).toMatchObject({ action: "warn", reason: "human_conversation_volume_warning" });
    expect(warned.replayed).toBe(false);
  });

  it("refuses a person at 90 and says when a slot frees; nothing is committed", async () => {
    const a = await chat(1);
    await seedOutbound(a.id, 90, { ageSeconds: 60, spacingSeconds: 30 });
    const id = randomUUID();
    const error = await send(ownerContext, a, "one more", id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppSendGuardError);
    const refused = error as WhatsAppSendGuardError;
    expect(refused.reason).toBe("human_conversation_hourly_limit");
    // the 90th newest message is 60 + 89 * 30 = 2730 s old: it leaves the hour in ~870 s
    expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(865);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(875);
    expect(await db.message.count({ where: { id } })).toBe(0);
    expect(await db.outboxIntent.count()).toBe(0);
  });

  it("refuses a person at 500 an hour for the whole shop", async () => {
    for (let n = 1; n <= 10; n += 1) await seedOutbound((await chat(n)).id, 50);
    const fresh = await chat(50);
    const error = await send(ownerContext, fresh, "hi").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppSendGuardError);
    expect((error as WhatsAppSendGuardError).reason).toBe("human_shop_hourly_limit");
  });

  it("refuses an automation at 20 in a chat while a person is not stopped there", async () => {
    const a = await chat(1);
    await seedOutbound(a.id, 20);
    const error = await send(automationContext, a, "auto").catch((e: unknown) => e);
    expect((error as WhatsAppSendGuardError).reason).toBe("automation_conversation_hourly_limit");
    await expect(send(ownerContext, a, "typed by hand")).resolves.toMatchObject({ replayed: false });
  });

  it("refuses an automation at 200 an hour for the shop", async () => {
    for (let n = 1; n <= 10; n += 1) await seedOutbound((await chat(n)).id, 19, { body: "h" + n });
    await seedOutbound((await chat(11)).id, 10);
    const error = await send(automationContext, await chat(60), "auto").catch((e: unknown) => e);
    expect((error as WhatsAppSendGuardError).reason).toBe("automation_shop_hourly_limit");
  });

  it("paces automatic sends 3 s apart: delayed, never dropped, and the outbox honours the time", async () => {
    const [a, b, c] = [await chat(1), await chat(2), await chat(3)];
    const first = await send(automationContext, a, "first message");
    const second = await send(automationContext, b, "second message");
    const third = await send(automationContext, c, "third message");
    expect(first.guard).toBeUndefined();
    expect(second.guard).toMatchObject({ action: "delay", reason: "automation_pacing" });
    expect(third.guard).toMatchObject({ action: "delay" });
    const s2 = await getWhatsAppEffectStatus(automationContext, second.effectKey);
    const s3 = await getWhatsAppEffectStatus(automationContext, third.effectKey);
    expect(s2.state).toBe("queued");
    const gap = new Date(s3.nextAttemptAt as string).getTime() - new Date(s2.nextAttemptAt as string).getTime();
    expect(gap).toBeGreaterThanOrEqual(2500);
    expect(gap).toBeLessThanOrEqual(3600);
    // Only the first is due now; the delayed two stay queued with their time.
    await drainDueWhatsAppEffects(automationContext, 10);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(await db.outboxIntent.count({ where: { status: "queued" } })).toBe(2);
  });

  it("holds the 6th chat that gets the same text in 15 minutes until a person approves", async () => {
    for (let n = 1; n <= 5; n += 1) {
      await seedOutbound((await chat(n)).id, 1, { body: "Salam, order " + n + "0 is ready", ageSeconds: 120 });
    }
    const sixth = await chat(6);
    const held = await send(automationContext, sixth, "  salam,   ORDER 99 is ready ");
    expect(held.guard).toMatchObject({ action: "hold", reason: "automation_bulk_same_text" });
    const row = await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: held.effectKey } });
    expect(row.status).toBe("failed");
    expect(row.lastErrorCode).toBe("SEND_GUARD_BULK_SAME_TEXT");
    await drainDueWhatsAppEffects(automationContext, 10);
    expect(provider.send).not.toHaveBeenCalled();
    expect((await getWhatsAppEffectStatus(automationContext, held.effectKey)).state).toBe("held");

    // a retry of the same client message is a replay, not a second judgement
    const replay = await queueWhatsAppText(automationContext, {
      clientMessageId: held.messageId,
      to: sixth.to,
      conversationId: sixth.id,
      text: "  salam,   ORDER 99 is ready ",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.guard).toBeUndefined();

    await expect(approveHeldWhatsAppEffect(automationContext, held.effectKey)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const approved = await approveHeldWhatsAppEffect(ownerContext, held.effectKey);
    expect(approved.state).toBe("succeeded");
    expect(provider.send).toHaveBeenCalledTimes(1);
    await expect(approveHeldWhatsAppEffect(ownerContext, held.effectKey)).rejects.toMatchObject({
      name: "ConflictError",
    });
  });

  it("does not hold at 5 chats, outside 15 minutes, for a person, or for a different text", async () => {
    for (let n = 1; n <= 4; n += 1) {
      await seedOutbound((await chat(n)).id, 1, { body: "same words", ageSeconds: 120 });
    }
    await seedOutbound((await chat(5)).id, 1, { body: "same words", ageSeconds: 16 * 60 });
    const sixth = await chat(6);
    expect((await send(automationContext, sixth, "same words")).guard).toBeUndefined();
    expect((await send(ownerContext, await chat(7), "same words")).guard).toBeUndefined();
    await seedOutbound((await chat(8)).id, 1, { body: "same words", ageSeconds: 120 });
    const other = await send(automationContext, await chat(9), "different words entirely");
    expect(other.guard?.action).not.toBe("hold");
  });
});
