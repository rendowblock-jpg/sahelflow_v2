import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { TEST_SHOP_CONTEXT, createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";
import { insertSyntheticShop, type ShopFacts } from "@/lib/search/__tests__/conversation-search-synthetic-shop";
import { CONVERSATION_TOKEN_REFERENCE } from "@/lib/search/conversation-search-tokens";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, slice 4: GET /api/conversations/search answers byte for byte what the route answered before
 * the index existed, on the synthetic shop (plain rows, so the plain test client reads them like the app's client).
 */
const state = vi.hoisted(() => ({ canReadContact: true, asked: [] as string[] }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  return { db: new Client(), shopContext: helpers.TEST_SHOP_CONTEXT };
});
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async (permission: string) => {
    state.asked.push(permission);
    return { shop: { shopId: "test" } };
  }),
  trustedActionAllowed: vi.fn((_context: unknown, permission: string) => (permission === "customers.contact.read" ? state.canReadContact : true)),
}));

import { GET } from "@/app/api/conversations/search/route";
import { runConversationSearchIndexTick } from "@/lib/search/conversation-search-runtime";

let seed: PrismaClient;
let facts: ShopFacts;

function parseLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** The route as it was before the index: verbatim, with the database taken from the seed client. */
async function oldResponseBody(rawQuery: string, canReadContact: boolean): Promise<string> {
  const query = normalizeSearchText(rawQuery);
  if (!query) return JSON.stringify({ results: [] });
  const conversations = await seed.conversation.findMany({
    include: { messages: { orderBy: { timestamp: "desc" }, take: 50 } },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  const results = conversations
    .filter((conversation) => {
      if (canReadContact && matchesSearchQuery(query, [conversation.contactName])) return true;
      if (canReadContact && matchesSearchQuery(query, [conversation.contactPhone])) return true;
      return conversation.messages.some((message) => normalizeSearchText(message.body ?? "").includes(query));
    })
    .slice(0, 100)
    .map((conversation) => {
      const lastMessage = conversation.messages[0];
      const matchType =
        canReadContact && matchesSearchQuery(query, [conversation.contactName])
          ? "name"
          : canReadContact && matchesSearchQuery(query, [conversation.contactPhone])
            ? "phone"
            : "message";
      return {
        id: conversation.id,
        conversationId: conversation.id,
        contactName: canReadContact ? conversation.contactName : null,
        contactPhone: canReadContact ? conversation.contactPhone : null,
        sourceId: canReadContact ? conversation.sourceId : null,
        channel: conversation.channel,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: conversation.unreadCount,
        lastMessage: lastMessage ? { body: lastMessage.body, direction: lastMessage.direction, timestamp: lastMessage.timestamp } : null,
        workflow: {
          status: conversation.status,
          assigneeId: conversation.assigneeId,
          priority: conversation.priority,
          labels: parseLabels(conversation.labels),
          snoozedUntil: conversation.snoozedUntil,
          waitingSince: conversation.waitingSince,
          firstReplyAt: conversation.firstReplyAt,
        },
        matchType,
        fieldAccess: { contact: canReadContact },
      };
    });
  return JSON.stringify({ results });
}

async function call(rawQuery: string): Promise<{ status: number; body: string }> {
  const request = new NextRequest(`http://localhost/api/conversations/search?q=${encodeURIComponent(rawQuery)}`);
  const handler = GET as unknown as (req: NextRequest, context?: unknown) => Promise<Response>;
  const response = await handler(request, {});
  return { status: response.status, body: await response.text() };
}

async function wipeIndex() {
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await seed.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

beforeAll(async () => {
  seed = await createTestPrisma();
  await wipeIndex();
  await seed.protectedKeyAuthority.deleteMany({ where: { purpose: "shop-blind-index" } });
  await deriveShopBlindIndexes(seed as never, ["probe"], CONVERSATION_TOKEN_REFERENCE, { shopContext: TEST_SHOP_CONTEXT, normalize: (v) => v });
  facts = await insertSyntheticShop(seed, { sealed: false });
  for (let tick = 1; ; tick += 1) {
    if (!(await runConversationSearchIndexTick()).changed) break;
    if (tick > 900) throw new Error("the indexer never went idle");
  }
}, 600_000);
afterAll(async () => {
  await wipeIndex();
  await disconnectTestPrisma(seed);
});
beforeEach(() => {
  state.canReadContact = true;
  state.asked.length = 0;
});

describe("GET /api/conversations/search on the synthetic shop", () => {
  it("answers byte for byte what the route answered before the index, with and without the right to read contacts", async () => {
    const queries = ["livraison", "benali", "الطلبية", "طلبية", "livraison alger", facts.phoneA, `+213${facts.phoneB.slice(1)}`, "sa", "ra", "sam", "zxqvw", "zorglub", "ferroudja", "tikjda", "2 coques"];
    let nonEmpty = 0;
    for (const canReadContact of [true, false]) {
      state.canReadContact = canReadContact;
      for (const query of queries) {
        // 2-character message queries without the contact right are a word start: pinned in the equivalence test.
        if (!canReadContact && normalizeSearchText(query).length === 2) continue;
        const answer = await call(query);
        expect(answer.status, query).toBe(200);
        const expected = await oldResponseBody(query, canReadContact);
        expect(answer.body === expected, `${canReadContact}:${query}`).toBe(true);
        if (expected !== JSON.stringify({ results: [] })) nonEmpty += 1;
      }
    }
    expect(nonEmpty).toBeGreaterThan(15);
  }, 300_000);

  it("keeps the permission, the empty-query answer and the hidden contact fields", async () => {
    expect(await call("")).toEqual({ status: 200, body: JSON.stringify({ results: [] }) });
    expect(await call("   ")).toEqual({ status: 200, body: JSON.stringify({ results: [] }) });
    expect(state.asked.every((permission) => permission === "conversations.read")).toBe(true);
    expect(state.asked.length).toBeGreaterThan(0);
    state.canReadContact = false;
    const hidden = JSON.parse((await call("livraison")).body) as { results: Array<Record<string, unknown>> };
    expect(hidden.results.length).toBeGreaterThan(0);
    for (const row of hidden.results) expect(row).toMatchObject({ contactName: null, contactPhone: null, sourceId: null, fieldAccess: { contact: false } });
  });
});
