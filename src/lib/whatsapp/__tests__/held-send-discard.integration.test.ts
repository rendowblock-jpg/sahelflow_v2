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
  discardHeldWhatsAppSend,
  drainDueWhatsAppEffects,
  getWhatsAppEffectStatus,
  processWhatsAppEffect,
  queueWhatsAppText,
} from "../durable-send";
import { isHeldOutboxIntent, projectOutboxEffectState } from "../held-send";
import { SEND_GUARD_HOLD_ERROR_CODE } from "../send-guard";

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

const DISCARD_ACTION = "whatsapp.held_send.discarded";
const discards = () => db.auditLog.count({ where: { action: DISCARD_ACTION } });
const approvals = () => db.auditLog.count({ where: { action: "whatsapp.message.hold_approved" } });
/** The same filter the phone's "WhatsApp held" number uses. */
const heldRows = () =>
  db.outboxIntent.count({
    where: { status: "failed", outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE },
  });

describe("discardHeldWhatsAppSend (route core)", () => {
  it("an automation can never discard a held send", async () => {
    const key = await makeHeld(0, "Salam discard 1");
    await expect(discardHeldWhatsAppSend(automationContext, key)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getWhatsAppEffectStatus(ownerContext, key)).state).toBe("held");
    expect(await discards()).toBe(0);
    expect(await heldRows()).toBe(1);
  });

  it("discards once: failed -> dead_letter, hold code kept, one audit row naming the owner and the key", async () => {
    const key = await makeHeld(0, "Salam discard 2");
    expect(await heldRows()).toBe(1);
    const first = await discardHeldWhatsAppSend(ownerContext, key);
    expect(first.alreadyDiscarded).toBe(false);

    const row = await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } });
    expect(row.status).toBe("dead_letter");
    expect(row.lastErrorCode).toBe(SEND_GUARD_HOLD_ERROR_CODE);
    expect(row.deadLetteredAt).not.toBeNull();
    expect(isHeldOutboxIntent(row)).toBe(false);
    expect(projectOutboxEffectState(row)).toBe("discarded");

    const audits = await db.auditLog.findMany({ where: { action: DISCARD_ACTION } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entity: "outbox-intent",
      entityId: row.id,
      actor: ownerContext.businessPrincipal.auditActor,
    });
    expect(JSON.parse(audits[0]?.metadata ?? "{}")).toMatchObject({ effectKey: key });
  });

  it("a second press is a no-op: already_discarded and no second audit row", async () => {
    const key = await makeHeld(0, "Salam discard 3");
    await discardHeldWhatsAppSend(ownerContext, key);
    const second = await discardHeldWhatsAppSend(ownerContext, key);
    expect(second.alreadyDiscarded).toBe(true);
    const third = await discardHeldWhatsAppSend(ownerContext, key);
    expect(third.alreadyDiscarded).toBe(true);
    expect(await discards()).toBe(1);
  });

  it("two presses at the same moment discard once and never throw", async () => {
    const key = await makeHeld(20, "Salam discard 4");
    const results = await Promise.all([
      discardHeldWhatsAppSend(ownerContext, key),
      discardHeldWhatsAppSend(ownerContext, key),
    ]);
    expect(results.filter((r) => !r.alreadyDiscarded)).toHaveLength(1);
    expect(await discards()).toBe(1);
  });

  it("a discarded send stops counting as held", async () => {
    const key = await makeHeld(0, "Salam discard 5");
    expect(await heldRows()).toBe(1);
    await discardHeldWhatsAppSend(ownerContext, key);
    expect(await heldRows()).toBe(0);
  });

  it("a discarded send is never sent: worker, drain and a direct process call all send nothing", async () => {
    const key = await makeHeld(0, "Salam discard 6");
    await discardHeldWhatsAppSend(ownerContext, key);

    const sender = vi.fn();
    const lookup = vi.fn().mockResolvedValue(null);
    const status = await processWhatsAppEffect(ownerContext, key, sender, lookup);
    expect(status.state).toBe("dead_letter");
    expect(await drainDueWhatsAppEffects(ownerContext, 10, sender, lookup)).toHaveLength(0);
    expect(await drainDueWhatsAppEffects(ownerContext, 10)).toHaveLength(0);

    expect(sender).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
    expect((await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } })).status).toBe("dead_letter");
  });

  it("a discarded send can never be released", async () => {
    const key = await makeHeld(0, "Salam discard 7");
    await discardHeldWhatsAppSend(ownerContext, key);
    await expect(approveHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({
      name: "ConflictError",
      statusCode: 409,
    });
    expect(await approvals()).toBe(0);
    expect((await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } })).status).toBe("dead_letter");
    await drainDueWhatsAppEffects(ownerContext, 10);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("a released send can never be discarded, before or after it went out", async () => {
    const key = await makeHeld(0, "Salam discard 8");
    await approveHeldWhatsAppSend(ownerContext, key);
    await expect(discardHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({
      name: "ConflictError",
      statusCode: 409,
    });
    await drainDueWhatsAppEffects(ownerContext, 10);
    expect(provider.send).toHaveBeenCalledTimes(1);
    await expect(discardHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({ statusCode: 409 });
    expect(await discards()).toBe(0);
    expect((await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } })).status).toBe("succeeded");
  });

  it("a row that looks held again after a release is still refused: the release proof wins", async () => {
    const key = await makeHeld(0, "Salam discard 10");
    await approveHeldWhatsAppSend(ownerContext, key);
    await db.outboxIntent.update({
      where: { effectKey: key },
      data: { status: "failed", outcomeState: "none", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE },
    });
    await expect(discardHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({ statusCode: 409 });
    expect(await discards()).toBe(0);
    expect((await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } })).status).toBe("failed");
  });

  it("an unknown key is 404", async () => {
    await expect(discardHeldWhatsAppSend(ownerContext, "wa:nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  const NOT_HELD: Array<[string, { status: string; outcomeState: string; lastErrorCode: string | null }]> = [
    ["queued", { status: "queued", outcomeState: "none", lastErrorCode: null }],
    ["processing", { status: "processing", outcomeState: "none", lastErrorCode: null }],
    ["retrying", { status: "retrying", outcomeState: "none", lastErrorCode: "SIDECAR_UNAVAILABLE" }],
    ["succeeded", { status: "succeeded", outcomeState: "none", lastErrorCode: null }],
    ["failed (other code)", { status: "failed", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" }],
    ["failed ambiguous", { status: "failed", outcomeState: "ambiguous", lastErrorCode: null }],
    ["failed ambiguous with the hold code", { status: "failed", outcomeState: "ambiguous", lastErrorCode: SEND_GUARD_HOLD_ERROR_CODE }],
    ["dead_letter (not discarded by a person)", { status: "dead_letter", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" }],
  ];
  it.each(NOT_HELD)("%s is refused with a typed 409 and nothing changes", async (_name, patch) => {
    const key = await makeHeld(40, "Salam discard 9");
    await db.outboxIntent.update({ where: { effectKey: key }, data: patch });
    await expect(discardHeldWhatsAppSend(ownerContext, key)).rejects.toMatchObject({
      name: "ConflictError",
      statusCode: 409,
    });
    const row = await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } });
    expect(row.status).toBe(patch.status);
    expect(row.lastErrorCode).toBe(patch.lastErrorCode);
    expect(await discards()).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });
});
