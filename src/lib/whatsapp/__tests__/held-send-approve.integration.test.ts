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
  approveHeldWhatsAppSend,
  drainDueWhatsAppEffects,
  getWhatsAppEffectStatus,
  queueWhatsAppText,
} from "../durable-send";

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
  provider.send.mockReset().mockResolvedValue({ ok: true, id: "WA-HELD-1", status: "sent" });
  provider.receipt.mockReset().mockResolvedValue(null);
});

afterAll(async () => {
  await clean();
  await db.$disconnect();
});

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
  return { id: created.id, to: "0555000" + (100 + n) };
}

/** The 6th chat to get the same text in 15 minutes: the guard holds it. */
async function makeHeld(offset: number, text: string): Promise<string> {
  for (let n = offset + 1; n <= offset + 5; n += 1) {
    const target = await chat(n);
    await db.message.create({
      data: {
        id: randomUUID(),
        conversationId: target.id,
        body: text,
        direction: "outbound",
        timestamp: new Date(Date.now() - 120_000),
        deliveryStatus: "sent",
      },
    });
  }
  const sixth = await chat(offset + 6);
  const held = await queueWhatsAppText(automationContext, {
    clientMessageId: randomUUID(),
    to: sixth.to,
    conversationId: sixth.id,
    text,
  });
  expect((await getWhatsAppEffectStatus(automationContext, held.effectKey)).state).toBe("held");
  return held.effectKey;
}

const approvals = () => db.auditLog.count({ where: { action: "whatsapp.message.hold_approved" } });

describe("approveHeldWhatsAppSend (route core)", () => {
  it("an automation can never release a held send", async () => {
    const key = await makeHeld(0, "Salam order 1");
    await expect(approveHeldWhatsAppSend(automationContext, key)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getWhatsAppEffectStatus(ownerContext, key)).state).toBe("held");
    expect(await approvals()).toBe(0);
  });

  it("releases once, a second press is a no-op, and the message is sent exactly once", async () => {
    const key = await makeHeld(0, "Salam order 2");
    const first = await approveHeldWhatsAppSend(ownerContext, key);
    expect(first.alreadyApproved).toBe(false);
    expect(first.effect.state).toBe("queued");
    expect(await approvals()).toBe(1);

    const second = await approveHeldWhatsAppSend(ownerContext, key);
    expect(second.alreadyApproved).toBe(true);
    expect(await approvals()).toBe(1);

    await drainDueWhatsAppEffects(ownerContext, 10);
    expect(provider.send).toHaveBeenCalledTimes(1);

    const third = await approveHeldWhatsAppSend(ownerContext, key);
    expect(third.alreadyApproved).toBe(true);
    expect(third.effect.state).toBe("succeeded");
    await drainDueWhatsAppEffects(ownerContext, 10);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(await approvals()).toBe(1);
  });

  it("two presses at the same moment release once and never throw", async () => {
    const key = await makeHeld(20, "Salam order 3");
    const results = await Promise.all([
      approveHeldWhatsAppSend(ownerContext, key),
      approveHeldWhatsAppSend(ownerContext, key),
    ]);
    expect(results.filter((r) => !r.alreadyApproved)).toHaveLength(1);
    expect(await approvals()).toBe(1);
    await drainDueWhatsAppEffects(ownerContext, 10);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("an unknown key is 404", async () => {
    await expect(approveHeldWhatsAppSend(ownerContext, "wa:nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  const NOT_HELD: Array<[string, { status: string; outcomeState: string; lastErrorCode: string | null }]> = [
    ["queued", { status: "queued", outcomeState: "none", lastErrorCode: null }],
    ["processing", { status: "processing", outcomeState: "none", lastErrorCode: null }],
    ["retrying", { status: "retrying", outcomeState: "none", lastErrorCode: "SIDECAR_UNAVAILABLE" }],
    ["succeeded", { status: "succeeded", outcomeState: "none", lastErrorCode: null }],
    ["failed (other code)", { status: "failed", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" }],
    ["failed ambiguous", { status: "failed", outcomeState: "ambiguous", lastErrorCode: null }],
    ["failed ambiguous with the hold code", { status: "failed", outcomeState: "ambiguous", lastErrorCode: "SEND_GUARD_BULK_SAME_TEXT" }],
    ["dead_letter", { status: "dead_letter", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" }],
  ];
  it.each(NOT_HELD)("%s is refused with a typed 409 and nothing changes", async (_name, patch) => {
    const key = await makeHeld(40, "Salam order 4");
    await db.outboxIntent.update({ where: { effectKey: key }, data: patch });
    await expect(approveHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({
      name: "ConflictError",
      statusCode: 409,
    });
    const row = await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } });
    expect(row.status).toBe(patch.status);
    expect(await approvals()).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });
});
