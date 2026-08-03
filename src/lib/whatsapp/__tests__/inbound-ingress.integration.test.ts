process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, shopContext } from "@/lib/db";
import { ConflictError } from "@/types/errors";
import {
  persistWhatsAppInbound,
  type WhatsAppInboundEnvelope,
} from "../inbound-ingress";

const ACCOUNT_ID = "213555999000:12@s.whatsapp.net";
const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: ACCOUNT_ID,
};

function envelope(overrides?: {
  spoolId?: string;
  receivedAt?: string;
  text?: string;
  accountId?: string;
}): WhatsAppInboundEnvelope {
  return {
    spoolId: overrides?.spoolId ?? "a".repeat(64),
    accountId: overrides?.accountId ?? ACCOUNT_ID,
    receivedAt: overrides?.receivedAt ?? "2026-08-03T09:30:00.000Z",
    message: {
      key: {
        remoteJid: "213555000111@s.whatsapp.net",
        fromMe: false,
        id: "PROVIDER-INBOUND-1",
      },
      message: { conversation: overrides?.text ?? "Bonjour secret client" },
      messageTimestamp: 1_786_000_000,
      pushName: "Client secret",
    },
  };
}

async function clean(): Promise<void> {
  await db.providerIngressAttempt.deleteMany();
  await db.providerIngressEvent.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("durable WhatsApp inbound ingress", () => {
  it("commits encrypted provider evidence before acknowledging the sidecar", async () => {
    const result = await persistWhatsAppInbound(context, envelope());

    expect(result).toMatchObject({ status: "received", replayed: false });
    const stored = await db.providerIngressEvent.findUniqueOrThrow({
      where: { id: result.ingressEventId },
    });
    expect(stored.ingressKey).toMatch(/^wa-in:[0-9a-f]{32}:[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(stored.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.payloadJson).not.toContain("Bonjour secret client");
    expect(stored.payloadJson).not.toContain("Client secret");
    expect(stored.payloadJson).not.toContain("213555000111");
    expect(stored.payloadJson).not.toContain("213555999000");
    expect(stored.providerTimestamp.toISOString()).toBe(
      new Date(1_786_000_000 * 1_000).toISOString(),
    );
  });

  it("replays the same provider event even when sidecar-local metadata changes", async () => {
    const first = await persistWhatsAppInbound(context, envelope());
    const replay = await persistWhatsAppInbound(
      context,
      envelope({
        spoolId: "b".repeat(64),
        receivedAt: "2026-08-03T10:30:00.000Z",
      }),
    );

    expect(replay).toEqual({
      ingressEventId: first.ingressEventId,
      ingressKey: first.ingressKey,
      status: "received",
      replayed: true,
    });
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("rejects changed provider content under the same provider identity", async () => {
    await persistWhatsAppInbound(context, envelope());

    await expect(
      persistWhatsAppInbound(context, envelope({ text: "Changed content" })),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });

  it("rejects a message from a different paired WhatsApp account", async () => {
    await expect(
      persistWhatsAppInbound(
        context,
        envelope({ accountId: "213555888000:14@s.whatsapp.net" }),
      ),
    ).rejects.toThrow(/different paired account/i);
    await expect(db.providerIngressEvent.count()).resolves.toBe(0);
  });

  it("converges concurrent duplicate deliveries onto one stored ingress event", async () => {
    const [left, right] = await Promise.all([
      persistWhatsAppInbound(context, envelope()),
      persistWhatsAppInbound(context, envelope()),
    ]);

    expect(left.ingressEventId).toBe(right.ingressEventId);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    await expect(db.providerIngressEvent.count()).resolves.toBe(1);
  });
});
