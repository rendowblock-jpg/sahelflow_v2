import { afterEach, describe, expect, it } from "vitest";

import { isProtectedValueEnvelope } from "@/lib/crypto/protected-value";
import { db, dbRaw } from "@/lib/db";

const customerIds: string[] = [];
const conversationIds: string[] = [];

function phone(seed: number): string {
  return `05${String(seed).padStart(8, "0").slice(-8)}`;
}

afterEach(async () => {
  if (conversationIds.length > 0) {
    await dbRaw.message.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await dbRaw.conversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
  }
  if (customerIds.length > 0) {
    await dbRaw.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  conversationIds.length = 0;
  customerIds.length = 0;
});

describe("record-bound protected upsert concurrency", () => {
  it("binds a competing conversation update to the actual unique winner", async () => {
    const sourceId = `phase4-race-${Date.now()}`;
    const firstPhone = phone(Date.now() % 100_000_000);
    const secondPhone = phone((Date.now() + 1) % 100_000_000);

    const [first, second] = await Promise.all([
      db.conversation.upsert({
        where: { channel_sourceId: { channel: "whatsapp", sourceId } },
        create: {
          channel: "whatsapp",
          sourceId,
          contactName: "First create",
          contactPhone: firstPhone,
        },
        update: {
          contactName: "First update",
          contactPhone: firstPhone,
          unreadCount: { increment: 1 },
        },
      }),
      db.conversation.upsert({
        where: { channel_sourceId: { channel: "whatsapp", sourceId } },
        create: {
          channel: "whatsapp",
          sourceId,
          contactName: "Second create",
          contactPhone: secondPhone,
        },
        update: {
          contactName: "Second update",
          contactPhone: secondPhone,
          unreadCount: { increment: 1 },
        },
      }),
    ]);

    expect(first.id).toBe(second.id);
    conversationIds.push(first.id);

    const raw = await dbRaw.conversation.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(isProtectedValueEnvelope(raw.contactName)).toBe(true);
    expect(isProtectedValueEnvelope(raw.contactPhone ?? "")).toBe(true);

    const reopened = await db.conversation.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(["First create", "First update", "Second create", "Second update"]).toContain(
      reopened.contactName,
    );
    expect([firstPhone, secondPhone]).toContain(reopened.contactPhone);
    expect(reopened.unreadCount).toBe(1);
  });

  it("resolves a concurrent customer by current and legacy phone indexes", async () => {
    const sharedPhone = phone((Date.now() + 2) % 100_000_000);
    const [first, second] = await Promise.all([
      db.customer.upsert({
        where: { phone: sharedPhone },
        create: { name: "Customer first create", phone: sharedPhone },
        update: { name: "Customer first update" },
      }),
      db.customer.upsert({
        where: { phone: sharedPhone },
        create: { name: "Customer second create", phone: sharedPhone },
        update: { name: "Customer second update" },
      }),
    ]);

    expect(first.id).toBe(second.id);
    customerIds.push(first.id);

    const reopened = await db.customer.findUniqueOrThrow({
      where: { phone: sharedPhone },
    });
    expect(reopened.id).toBe(first.id);
    expect([
      "Customer first create",
      "Customer first update",
      "Customer second create",
      "Customer second update",
    ]).toContain(reopened.name);
    expect(reopened.phone).toBe(sharedPhone);
  });
});
