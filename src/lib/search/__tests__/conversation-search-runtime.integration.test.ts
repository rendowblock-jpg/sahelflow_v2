import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { TEST_SHOP_CONTEXT, createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";
import {
  CONVERSATION_TOKEN_REFERENCE,
  hashTokenStrings,
  tokenStringsOf,
  type BlindIndexDeriver,
} from "@/lib/search/conversation-search-tokens";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, slice 3: the REAL wiring of the indexer (conversation-search-runtime.ts) with the real
 * message codec and the real shop key, on a real SQLite database. The indexer's own tests use stand-ins for the
 * codec and the key; this file proves the stand-ins are not hiding a mismatch (sealed body, record id, key
 * derivation, salting) and that a missing key row, or one unreadable body, never stops the rest.
 */
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  return { db: new Client(), shopContext: helpers.TEST_SHOP_CONTEXT };
});

import { runConversationSearchIndexTick } from "@/lib/search/conversation-search-runtime";

let seed: PrismaClient;
let sequence = 0;

const rows = <T>(sql: string, ...args: unknown[]) => seed.$queryRawUnsafe<T[]>(sql, ...args);
async function count(table: string, where = "1=1", ...args: unknown[]): Promise<number> {
  const [row] = await rows<{ n: bigint | number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${where}`, ...args);
  return Number(row?.n ?? 0);
}
async function wipeIndex(): Promise<void> {
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await seed.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

// Same derivation the app uses to write (create the key row if it is missing), for the test's own expectations.
const writeDerive: BlindIndexDeriver = (values, reference) =>
  deriveShopBlindIndexes(seed as never, values, reference, { shopContext: TEST_SHOP_CONTEXT, normalize: (v) => v });

async function createConversation() {
  sequence += 1;
  return seed.conversation.create({
    data: { channel: "whatsapp", contactName: "Karim", contactPhone: "0555123456", sourceId: `runtime-test-${sequence}` },
  });
}

/** A message stored the way the app stores it: the body sealed under the message's own id. */
async function sealedMessage(conversationId: string, body: string, at = "2026-10-25T10:00:00Z") {
  sequence += 1;
  const id = `runtime-msg-${sequence}`;
  const codec = createProtectedPiiCodec(seed as never, TEST_SHOP_CONTEXT);
  const sealed = await codec.encryptFields({ id, body }, ["body"], "Message", id);
  return seed.message.create({
    data: { id, conversationId, body: String(sealed.body), direction: "inbound", timestamp: new Date(at) },
  });
}

async function runUntilIdle(limit = 30): Promise<number> {
  for (let tick = 1; tick <= limit; tick += 1) {
    const result = await runConversationSearchIndexTick();
    if (!result.changed) return tick;
  }
  throw new Error("the indexer never went idle");
}

beforeEach(async () => {
  seed = await createTestPrisma();
  await wipeIndex();
  await seed.protectedKeyAuthority.deleteMany({ where: { purpose: "shop-blind-index" } });
});
afterEach(async () => {
  await wipeIndex();
  await disconnectTestPrisma(seed);
});

describe("conversation-search indexer, real wiring", () => {
  it("does nothing, and does not throw, while the shop key row is missing", async () => {
    const conversation = await createConversation();
    await sealedMessage(conversation.id, "salam, bghit 2 coques samsung");
    await wipeIndex(); // the trigger queued the message: the point here is the missing key, not the queue

    await expect(runConversationSearchIndexTick()).resolves.toEqual({ changed: false });
    expect(await count("ConversationSearchDoc")).toBe(0);
    expect(await count("ConversationSearchToken")).toBe(0);
  });

  it("indexes sealed messages with the real key: documents, covered conversations, and the exact salted hashes", async () => {
    const first = await createConversation();
    const second = await createConversation();
    const kept = await sealedMessage(first.id, "salam, bghit 2 coques samsung");
    await sealedMessage(first.id, "livraison à Oran svp", "2026-10-25T10:05:00Z");
    await sealedMessage(second.id, "مرحبا، بغيت كوفرتة تاع سامسونج");
    await writeDerive(["probe"], CONVERSATION_TOKEN_REFERENCE); // the key row now exists
    await wipeIndex();
    await seed.$executeRawUnsafe(`DELETE FROM "ConversationSearchDirty"`);

    const ticks = await runUntilIdle();
    expect(ticks).toBeGreaterThan(1);

    expect(await count("ConversationSearchDoc", `"kind" = 'M'`)).toBe(3);
    expect(await count("ConversationSearchDoc", `"kind" = 'C'`)).toBe(2);
    expect(await count("ConversationSearchDirty")).toBe(0);

    // The token numbers the QUERY side will compute for a word of the first message are in the index.
    const wanted = await hashTokenStrings(tokenStringsOf(normalizeSearchText("coques")), first.id, writeDerive);
    expect(wanted).not.toBeNull();
    const [doc] = await rows<{ docId: bigint | number }>(
      `SELECT "docId" FROM "ConversationSearchDoc" WHERE "kind" = 'M' AND "entityId" = ?`,
      kept.id,
    );
    const stored = new Set(
      (await rows<{ tokenHash: bigint | number }>(`SELECT "tokenHash" FROM "ConversationSearchToken" WHERE "docId" = ?`, doc!.docId)).map(
        (row) => Number(row.tokenHash),
      ),
    );
    for (const hash of wanted!) expect(stored.has(hash)).toBe(true);

    // Salted per conversation: the same word hashes to other numbers in the other conversation.
    const elsewhere = await hashTokenStrings(tokenStringsOf(normalizeSearchText("coques")), second.id, writeDerive);
    expect(elsewhere).not.toEqual(wanted);

    // The stored body is really sealed (the test is not running on plaintext), and the index holds numbers only.
    const [raw] = await rows<{ body: string }>(`SELECT "body" FROM "Message" WHERE "id" = ?`, kept.id);
    expect(raw!.body).not.toContain("coques");
    const columns = await rows<{ name: string }>(`SELECT name FROM pragma_table_info('ConversationSearchToken')`);
    expect(columns.map((column) => column.name).sort()).toEqual(["docId", "tokenHash"]);
  });

  it("a message that cannot be opened leaves its conversation uncovered and does not stop the others", async () => {
    const broken = await createConversation();
    const fine = await createConversation();
    const bad = await sealedMessage(broken.id, "ce message sera abîmé", "2026-10-25T11:00:00Z");
    await sealedMessage(fine.id, "bonjour, un colis pour Alger", "2026-10-25T09:00:00Z");
    await writeDerive(["probe"], CONVERSATION_TOKEN_REFERENCE);
    await wipeIndex();
    // A value that declares the protected format but is malformed is corruption (the codec refuses it).
    await seed.$executeRawUnsafe(
      `UPDATE "Message" SET "body" = ? WHERE "id" = ?`,
      JSON.stringify({ format: "sahelflow-protected-value" }),
      bad.id,
    );
    await wipeIndex();

    await runUntilIdle();

    expect(await count("ConversationSearchDoc", `"kind" = 'C' AND "entityId" = ?`, fine.id)).toBe(1);
    expect(await count("ConversationSearchDoc", `"kind" = 'C' AND "entityId" = ?`, broken.id)).toBe(0);
    expect(await count("ConversationSearchDoc", `"kind" = 'M' AND "entityId" = ?`, bad.id)).toBe(0);
  });

  it("an old message that was never sealed (legacy plain text) is indexed too", async () => {
    const conversation = await createConversation();
    const legacy = await seed.message.create({
      data: {
        id: "runtime-legacy-1",
        conversationId: conversation.id,
        body: "ancien message en clair, livraison Blida",
        direction: "inbound",
        timestamp: new Date("2026-10-24T10:00:00Z"),
      },
    });
    await writeDerive(["probe"], CONVERSATION_TOKEN_REFERENCE);
    await wipeIndex();

    await runUntilIdle();

    expect(await count("ConversationSearchDoc", `"kind" = 'M' AND "entityId" = ?`, legacy.id)).toBe(1);
    expect(await count("ConversationSearchDoc", `"kind" = 'C' AND "entityId" = ?`, conversation.id)).toBe(1);
  });

  it("a message stored after the first pass is queued by the trigger and indexed by the next ticks", async () => {
    const conversation = await createConversation();
    await sealedMessage(conversation.id, "premier message");
    await writeDerive(["probe"], CONVERSATION_TOKEN_REFERENCE);
    await runUntilIdle();
    expect(await count("ConversationSearchDoc", `"kind" = 'C'`)).toBe(1);

    const late = await sealedMessage(conversation.id, "deuxième message, livraison demain", "2026-10-25T12:00:00Z");
    expect(await count("ConversationSearchDirty", `"entityId" = ?`, late.id)).toBeGreaterThan(0);

    await runUntilIdle();

    expect(await count("ConversationSearchDoc", `"kind" = 'M' AND "entityId" = ?`, late.id)).toBe(1);
    expect(await count("ConversationSearchDirty")).toBe(0);
  });
});
