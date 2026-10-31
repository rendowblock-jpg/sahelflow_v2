process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * W3-E CHAIN TEST (w166). Held send -> Discard, end to end over a REAL SQLite: the real guard holds the send, the REAL
 * discard route function (owner / member / forbidden, twice), the REAL history route function that the Inbox reads, the
 * Inbox's own projection (toInboxMessageFromWhatsApp) and heldSendView, then the real worker/drain/approve. Only the
 * WhatsApp transport call (sidecar.send / receipt / status) and the trust check are replaced; the spool is never touched.
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  send: vi.fn(),
  receipt: vi.fn(),
  role: "owner" as string,
  denied: false,
}));

vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>();
  return { ...actual, sidecar: { ...actual.sidecar, send: h.send, receipt: h.receipt, status: vi.fn().mockResolvedValue({}) } };
});
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  const { shopContext: shop } = await import("@/lib/db");
  const { SahelFlowError } = await import("@/types/errors");
  return {
    ...actual,
    requireTrustedAction: vi.fn(async () => {
      if (h.denied) throw new SahelFlowError("Forbidden", "FORBIDDEN", 403);
      return {
        version: 1,
        shop,
        actor: {
          kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32),
          deviceId: "7".repeat(32), sessionId: "session-chain-e", role: h.role, policyVersion: 1,
        },
      };
    }),
  };
});

import { POST as discardRoute } from "@/app/api/whatsapp/outbox/[id]/discard-held/route";
import { GET as historyRoute } from "@/app/api/whatsapp/chats/[jid]/messages/route";
import { systemBusinessPrincipal, testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { toInboxMessageFromWhatsApp } from "@/lib/inbox/message-projection";
import {
  approveHeldWhatsAppSend,
  drainDueWhatsAppEffects,
  processWhatsAppEffect,
  queueWhatsAppText,
} from "@/lib/whatsapp/durable-send";
import { heldSendView, isHeldOutboxIntent } from "@/lib/whatsapp/held-send";
import { SEND_GUARD_HOLD_ERROR_CODE } from "@/lib/whatsapp/send-guard";

const ACCOUNT = "213555999000:12@s.whatsapp.net";
const ownerContext = { prisma: db, shop: shopContext, businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("chain-e-session"), whatsAppProviderAccountId: ACCOUNT };
const automationContext = { ...ownerContext, businessPrincipal: systemBusinessPrincipal("automation-worker") };

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
  h.role = "owner";
  h.denied = false;
  h.send.mockReset().mockResolvedValue({ ok: true, id: "WA-CHAIN-1", status: "sent" });
  h.receipt.mockReset().mockResolvedValue(null);
});
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

async function chat(n: number) {
  const created = await db.conversation.create({
    data: { channel: "whatsapp", contactName: "c" + n, contactPhone: "213555000" + (100 + n), sourceId: "213555000" + (100 + n) + "@s.whatsapp.net", lastMessageAt: new Date() },
    select: { id: true, sourceId: true },
  });
  return { id: created.id, to: "0555000" + (100 + n), jid: created.sourceId as string };
}

/** The 6th chat to get the same text in 15 minutes: the real guard holds it. */
async function makeHeld(offset: number, text: string): Promise<{ key: string; jid: string }> {
  for (let n = offset + 1; n <= offset + 5; n += 1) {
    const target = await chat(n);
    await db.message.create({
      data: { id: randomUUID(), conversationId: target.id, body: text, direction: "outbound", timestamp: new Date(Date.now() - 120_000), deliveryStatus: "sent" },
    });
  }
  const sixth = await chat(offset + 6);
  const held = await queueWhatsAppText(automationContext, { clientMessageId: randomUUID(), to: sixth.to, conversationId: sixth.id, text });
  return { key: held.effectKey, jid: sixth.jid };
}

const discard = (key: string) =>
  discardRoute(new NextRequest(`http://localhost/api/whatsapp/outbox/${encodeURIComponent(key)}/discard-held`, { method: "POST" }), {
    params: Promise.resolve({ id: key }),
  });

type HistoryMessage = Parameters<typeof toInboxMessageFromWhatsApp>[0] & { effectKey?: string };
/** What the Inbox shows for this send, read from the REAL history route and projected by the Inbox's own function. */
async function inboxRow(jid: string, key: string) {
  const response = await historyRoute(new NextRequest(`http://localhost/api/whatsapp/chats/${encodeURIComponent(jid)}/messages`), {
    params: Promise.resolve({ jid: encodeURIComponent(jid) }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { messages: HistoryMessage[] };
  const raw = body.messages.find((message) => message.effectKey === key);
  expect(raw, "the send is in the history route's answer").toBeDefined();
  return toInboxMessageFromWhatsApp(raw as HistoryMessage);
}

const heldCount = async () => (await db.outboxIntent.findMany({ select: { status: true, outcomeState: true, lastErrorCode: true } })).filter(isHeldOutboxIntent).length;
const discardAudits = () => db.auditLog.count({ where: { action: "whatsapp.held_send.discarded" } });

describe("held send -> Discard: route, DB, history route, Inbox row (real SQLite)", () => {
  it("held: the history route says held and the owner is offered Release; a member is told to ask the owner", async () => {
    const { key, jid } = await makeHeld(0, "Salam chain 1");
    const row = await inboxRow(jid, key);
    expect(row.outboxState).toBe("held");
    expect(row.outboxErrorCode).toBe(SEND_GUARD_HOLD_ERROR_CODE);
    expect(heldSendView(row, true)).toBe("owner_can_release");
    expect(heldSendView(row, false)).toBe("ask_owner");
    expect(await heldCount()).toBe(1);
  });

  it("a member (403 HELD_SEND_OWNER_ONLY) and a caller without the permission (403) change nothing", async () => {
    const { key, jid } = await makeHeld(0, "Salam chain 2");
    h.role = "operator";
    const member = await discard(key);
    expect(member.status).toBe(403);
    expect(((await member.json()) as { code: string }).code).toBe("HELD_SEND_OWNER_ONLY");
    h.role = "owner";
    h.denied = true;
    expect((await discard(key)).status).toBe(403);
    h.denied = false;
    expect((await inboxRow(jid, key)).outboxState).toBe("held");
    expect(await heldCount()).toBe(1);
    expect(await discardAudits()).toBe(0);
  });

  it("the owner discards: 200, the second press is 200 alreadyDiscarded with one audit row, the Inbox row reads discarded and the held count drops", async () => {
    const { key, jid } = await makeHeld(0, "Salam chain 3");
    const first = await discard(key);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, alreadyDiscarded: false });
    const second = await discard(key);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, alreadyDiscarded: true });
    expect(await discardAudits()).toBe(1);

    const row = await inboxRow(jid, key);
    expect(row.outboxState).toBe("discarded");
    expect(row.outboxErrorCode).toBe(SEND_GUARD_HOLD_ERROR_CODE);
    expect(heldSendView(row, true)).toBe("discarded");
    expect(heldSendView(row, false)).toBe("discarded");
    expect(await heldCount()).toBe(0);
  });

  it("after Discard the worker, the drain and a direct process call send nothing and Release is refused; the row stays dead_letter", async () => {
    const { key, jid } = await makeHeld(0, "Salam chain 4");
    expect((await discard(key)).status).toBe(200);
    const sender = vi.fn();
    const lookup = vi.fn().mockResolvedValue(null);
    expect((await processWhatsAppEffect(ownerContext, key, sender, lookup)).state).toBe("dead_letter");
    expect(await drainDueWhatsAppEffects(ownerContext, 10, sender, lookup)).toHaveLength(0);
    expect(await drainDueWhatsAppEffects(ownerContext, 10)).toHaveLength(0);
    await expect(approveHeldWhatsAppSend(ownerContext, key)).rejects.toThrow();
    expect(sender).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect((await db.outboxIntent.findUniqueOrThrow({ where: { effectKey: key } })).status).toBe("dead_letter");
    expect((await inboxRow(jid, key)).outboxState).toBe("discarded");
  });

  it("a held send that is released normally still goes out once, and then cannot be discarded (409); a second held send beside it can", async () => {
    const released = await makeHeld(0, "Salam chain 5");
    const other = await makeHeld(10, "Salam chain 6");
    await approveHeldWhatsAppSend(ownerContext, released.key);
    const late = await discard(released.key);
    expect(late.status).toBe(409);
    await processWhatsAppEffect(ownerContext, released.key);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect((await discard(other.key)).status).toBe(200);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(await heldCount()).toBe(0);
  });
});
