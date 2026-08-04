process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  send: vi.fn(),
  receipt: vi.fn(),
}));

vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>();
  return {
    ...actual,
    sidecar: {
      ...actual.sidecar,
      send: provider.send,
      receipt: provider.receipt,
    },
  };
});

import { db, shopContext } from "@/lib/db";
import { queueDailyWhatsAppReport } from "@/lib/reports/durable-daily-whatsapp";

const context = {
  prisma: db,
  shop: shopContext,
  whatsAppProviderAccountId: "213555999000:12@s.whatsapp.net",
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
  provider.send.mockReset().mockResolvedValue({
    ok: true,
    id: "WA-DAILY-RECEIPT-1",
    status: "sent",
  });
  provider.receipt.mockReset().mockResolvedValue(null);
});

afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("durable daily WhatsApp report", () => {
  it("replays the confirmed receipt after marker loss without sending twice", async () => {
    const input = {
      reportDate: "2026-08-02",
      phone: "0555000111",
      text: "Rapport quotidien secret",
    };

    const first = await queueDailyWhatsAppReport(context, input);
    // Simulates a successful provider send followed by failure to persist the
    // legacy daily-report date marker: the same route work executes again.
    const replay = await queueDailyWhatsAppReport(context, input);

    expect(first).toMatchObject({
      reportDate: input.reportDate,
      replayed: false,
      effect: {
        state: "succeeded",
        providerMessageId: "WA-DAILY-RECEIPT-1",
      },
    });
    expect(replay).toMatchObject({
      messageId: first.messageId,
      effectKey: first.effectKey,
      replayed: true,
      effect: {
        state: "succeeded",
        providerMessageId: "WA-DAILY-RECEIPT-1",
      },
    });
    expect(provider.send).toHaveBeenCalledTimes(1);

    const outbox = await db.outboxIntent.findUniqueOrThrow({
      where: { effectKey: first.effectKey },
    });
    expect(outbox.payloadJson).not.toContain(input.phone);
    expect(outbox.payloadJson).not.toContain(input.text);
  });

  it("uses a distinct durable identity for a different report date", async () => {
    const first = await queueDailyWhatsAppReport(context, {
      reportDate: "2026-08-01",
      phone: "0555000111",
      text: "Rapport du premier jour",
    });
    provider.send.mockResolvedValueOnce({
      ok: true,
      id: "WA-DAILY-RECEIPT-2",
      status: "sent",
    });
    const second = await queueDailyWhatsAppReport(context, {
      reportDate: "2026-08-02",
      phone: "0555000111",
      text: "Rapport du deuxième jour",
    });

    expect(second.effectKey).not.toBe(first.effectKey);
    expect(second.messageId).not.toBe(first.messageId);
    expect(provider.send).toHaveBeenCalledTimes(2);
  });
});
