import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  TEST_SHOP_CONTEXT,
  createTestPrisma,
  disconnectTestPrisma,
} from "@/lib/data/__tests__/helpers";
import { searchProjectedConversations } from "@/lib/search/local-search-projection";

/**
 * F-0028: the command palette / global search labels a conversation with its
 * stored contact name. For an unnamed WhatsApp contact that name is the raw id
 * ("202460866064562@lid"). The palette must never print it.
 */
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  return { db: new Client(), shopContext: helpers.TEST_SHOP_CONTEXT };
});

const SHOP = TEST_SHOP_CONTEXT.shopId;
let seed: PrismaClient;

beforeAll(async () => {
  seed = await createTestPrisma();
  const at = new Date(1_700_000_000_000);
  await seed.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "202460866064562@lid",
      contactPhone: "202460866064562",
      sourceId: "202460866064562@lid",
      lastMessageAt: at,
    },
  });
  await seed.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "213791999157",
      contactPhone: "213791999157",
      sourceId: "213791999157@s.whatsapp.net",
      lastMessageAt: at,
    },
  });
  await seed.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Amel Rahmani",
      contactPhone: "213551234567",
      sourceId: "213551234567@s.whatsapp.net",
      lastMessageAt: at,
    },
  });
});
afterAll(async () => {
  await seed.conversation.deleteMany({});
  await disconnectTestPrisma(seed);
});

describe("conversation palette labels (F-0028)", () => {
  it("never labels or sublabels a conversation with a raw WhatsApp id", async () => {
    const rows = await searchProjectedConversations(SHOP, "whatsapp", 48);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.label).not.toMatch(/@/u);
      expect(row.label).not.toMatch(/\d{12,}/u);
      expect(row.sublabel ?? "").not.toMatch(/202460866064562/u);
    }
  });

  it("keeps a real name, and shows a phone-number contact as a formatted phone", async () => {
    const rows = await searchProjectedConversations(SHOP, "whatsapp", 48);
    const labels = rows.map((row) => row.label);
    expect(labels).toContain("Amel Rahmani");
    expect(labels).toContain("+213 791 99 91 57");
    // the unnamed LID contact keeps the neutral fallback, with no phone in the sublabel
    const lid = rows.find((row) => row.label.startsWith("Inbox · "));
    expect(lid).toBeDefined();
    expect(lid?.sublabel).toBe("whatsapp");
  });
});
