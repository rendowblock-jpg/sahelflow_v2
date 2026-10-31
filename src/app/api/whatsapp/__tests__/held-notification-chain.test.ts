process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * W3-G1 round 3 CHAIN test for `whatsapp.held` (w169). It starts at the REAL trigger: the real send path
 * (queueWhatsAppText) and the real send guard hold the 6th identical text, on a REAL SQLite. It ends at what the
 * SELLER reads: the real sync + list routes of the notification centre, in ar (RTL), fr and en, with the catalog
 * sentence and the link. Then the real discard route / real release. Only the WhatsApp transport and the trust
 * check are replaced; the spool is never touched.
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ send: vi.fn(), receipt: vi.fn() }));

vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>();
  return { ...actual, sidecar: { ...actual.sidecar, send: h.send, receipt: h.receipt, status: vi.fn().mockResolvedValue({}) } };
});
vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/trusted-actor")>();
  const { shopContext: shop } = await import("@/lib/db");
  const context = {
    version: 1, shop,
    actor: { kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32), deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0 },
  };
  return { ...actual, requireTrustedActor: vi.fn(async () => context), isTrustedActorContext: vi.fn(() => true) };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity/authorization")>();
  const { shopContext: shop } = await import("@/lib/db");
  return {
    ...actual,
    requireTrustedAction: vi.fn(async () => ({
      version: 1,
      shop,
      actor: {
        kind: "person", personId: "5".repeat(32), workspaceMemberId: "6".repeat(32),
        deviceId: "7".repeat(32), sessionId: "session-chain-w169", role: "owner", policyVersion: 1, revocationEpoch: 0,
      },
    })),
  };
});
vi.mock("next/headers", async () => (await import("@/lib/notifications/__tests__/next-headers-mock")).nextHeadersMock());

import { POST as discardRoute } from "@/app/api/whatsapp/outbox/[id]/discard-held/route";
import { systemBusinessPrincipal, testAuthenticatedOwnerBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { LOCALES, expectWording, sellerRowsOf, syncCentre } from "@/lib/notifications/__tests__/seller-read";
import { approveHeldWhatsAppSend, queueWhatsAppText } from "@/lib/whatsapp/durable-send";
import { emitHeldSendNotice } from "@/lib/whatsapp/held-notice";
import { isHeldOutboxIntent } from "@/lib/whatsapp/held-send";

const ACCOUNT = "213555999000:12@s.whatsapp.net";
const ownerContext = { prisma: db, shop: shopContext, businessPrincipal: testAuthenticatedOwnerBusinessPrincipal("chain-w169-session"), whatsAppProviderAccountId: ACCOUNT };
const automationContext = { ...ownerContext, businessPrincipal: systemBusinessPrincipal("automation-worker") };

async function clean(): Promise<void> {
  await db.notificationDeliveryAttempt.deleteMany();
  await db.operationalNotification.deleteMany();
  await db.notificationEvent.deleteMany();
  await db.notificationPreference.deleteMany();
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
  h.send.mockReset().mockResolvedValue({ ok: true, id: "WA-CHAIN-W169", status: "sent" });
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
async function makeHeld(offset: number, text: string) {
  for (let n = offset + 1; n <= offset + 5; n += 1) {
    const target = await chat(n);
    await db.message.create({
      data: { id: randomUUID(), conversationId: target.id, body: text, direction: "outbound", timestamp: new Date(Date.now() - 120_000), deliveryStatus: "sent" },
    });
  }
  const sixth = await chat(offset + 6);
  const input = { clientMessageId: randomUUID(), to: sixth.to, conversationId: sixth.id, text };
  const held = await queueWhatsAppText(automationContext, input);
  return { key: held.effectKey, input };
}

const discard = (key: string) =>
  discardRoute(new NextRequest(`http://localhost/api/whatsapp/outbox/${encodeURIComponent(key)}/discard-held`, { method: "POST" }), {
    params: Promise.resolve({ id: key }),
  });
const heldEvents = () => db.notificationEvent.count({ where: { eventType: "whatsapp.held.v1" } });
const heldRows = async () => (await db.outboxIntent.findMany({ select: { status: true, outcomeState: true, lastErrorCode: true } })).filter(isHeldOutboxIntent).length;

describe("W3-G1 r3 chain: a send the guard HOLDS -> the seller is told (real send path, real SQLite, real routes)", () => {
  it("the guard holds the 6th identical text -> one 'waiting for your OK' row, read in ar (RTL), fr and en, linking to /inbox", async () => {
    await makeHeld(0, "Salam chain w169 one");
    expect(await heldRows()).toBe(1);
    expect(await heldEvents()).toBe(1);
    await syncCentre();
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "whatsapp.held");
      expect(rows, `one held row in ${locale}`).toHaveLength(1);
      expectWording(rows[0]!, locale, "whatsapp.held", 1, "/inbox");
    }
    const en = (await sellerRowsOf("en", "whatsapp.held"))[0]!;
    expect(en.title).toBe("Message waiting for your OK");
    expect(en.body).toBe("A WhatsApp message is waiting for your OK.");
    expect(en.severity).toBe("warning");
    expect((await sellerRowsOf("fr", "whatsapp.held"))[0]!.title).toBe("Message en attente de votre accord");
    expect((await sellerRowsOf("ar", "whatsapp.held"))[0]!.title).toBe("رسالة تنتظر موافقتك");
  });

  it("a normal send (not held) tells the seller nothing", async () => {
    const target = await chat(40);
    await queueWhatsAppText(ownerContext, { clientMessageId: randomUUID(), to: target.to, conversationId: target.id, text: "Bonjour w169 normal" });
    expect(await heldRows()).toBe(0);
    expect(await heldEvents()).toBe(0);
    await syncCentre();
    expect(await sellerRowsOf("fr", "whatsapp.held")).toHaveLength(0);
  });

  it("the same held send replayed (same client id) and a second sync never notify twice", async () => {
    const { input } = await makeHeld(0, "Salam chain w169 replay");
    await queueWhatsAppText(automationContext, input);
    await queueWhatsAppText(automationContext, input);
    await syncCentre();
    await syncCentre();
    expect(await heldEvents()).toBe(1);
    expect(await sellerRowsOf("en", "whatsapp.held")).toHaveLength(1);
  });

  it("raising the notice for one held row again (a retry, a re-queue) never makes a second event; a send that is not held makes none", async () => {
    const id = randomUUID();
    const hold = { decision: { action: "hold" } } as unknown as Parameters<typeof emitHeldSendNotice>[1];
    await emitHeldSendNotice(db, hold, id, shopContext.shopId);
    await emitHeldSendNotice(db, hold, id, shopContext.shopId);
    expect(await heldEvents()).toBe(1);
    await emitHeldSendNotice(db, { decision: { action: "allow" } } as unknown as Parameters<typeof emitHeldSendNotice>[1], randomUUID(), shopContext.shopId);
    expect(await heldEvents()).toBe(1);
  });

  it("a hold that is rolled back (the outbox row cannot be written) emits nothing", async () => {
    await db.$executeRawUnsafe(`CREATE TRIGGER w169_refuse_outbox BEFORE INSERT ON "OutboxIntent" BEGIN SELECT RAISE(ABORT, 'w169 forced rollback'); END`);
    try {
      await expect(makeHeld(0, "Salam chain w169 rollback")).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS w169_refuse_outbox`);
    }
    expect(await heldRows()).toBe(0);
    expect(await heldEvents()).toBe(0);
    await syncCentre();
    expect(await sellerRowsOf("en", "whatsapp.held")).toHaveLength(0);
  });

  it("Discard: two held -> count 2 on both rows -> real discard route -> live count 1 -> second discard -> 0, and no second event ever appears", async () => {
    const first = await makeHeld(0, "Salam chain w169 discard A");
    const second = await makeHeld(20, "Salam chain w169 discard B");
    await syncCentre();
    const two = await sellerRowsOf("en", "whatsapp.held");
    expect(two).toHaveLength(2);
    expect(two.map((row) => row.count)).toEqual([2, 2]);
    expect((await discard(first.key)).status).toBe(200);
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "whatsapp.held");
      expect(rows).toHaveLength(2);
      for (const row of rows) expectWording(row, locale, "whatsapp.held", 1, "/inbox");
    }
    expect((await discard(second.key)).status).toBe(200);
    await syncCentre();
    for (const locale of LOCALES) {
      const rows = await sellerRowsOf(locale, "whatsapp.held");
      expect(rows).toHaveLength(2);
      for (const row of rows) expectWording(row, locale, "whatsapp.held", 0, "/inbox");
    }
    expect(await heldRows()).toBe(0);
    expect(await heldEvents()).toBe(2);
  });

  it("Release: the count drops by itself and releasing notifies nothing new", async () => {
    const held = await makeHeld(0, "Salam chain w169 release");
    await syncCentre();
    expect((await sellerRowsOf("fr", "whatsapp.held"))[0]!.count).toBe(1);
    await approveHeldWhatsAppSend(ownerContext, held.key);
    await syncCentre();
    const rows = await sellerRowsOf("fr", "whatsapp.held");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(0);
    expect(await heldEvents()).toBe(1);
  });
});
