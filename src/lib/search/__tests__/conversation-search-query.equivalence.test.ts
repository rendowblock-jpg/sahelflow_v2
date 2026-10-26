import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createProtectedPiiCodec } from "@/lib/crypto/protected-pii";
import { deriveExistingShopBlindIndexes, deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { TEST_SHOP_CONTEXT, createTestPrisma, disconnectTestPrisma } from "@/lib/data/__tests__/helpers";
import { shopKeyRowPresent } from "@/lib/search/conversation-search-index";
import { searchConversationIndex, type QueryPorts, type SearchConversation } from "@/lib/search/conversation-search-query";
import { CONVERSATION_TOKEN_REFERENCE, type BlindIndexDeriver } from "@/lib/search/conversation-search-tokens";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";
import { WINDOW_SIZE, insertSyntheticShop, type ShopFacts } from "./conversation-search-synthetic-shop";

/**
 * PB-CONV-SEARCH-LOAD, slice 4 (T3, T7): the indexed search against the OLD route, on a synthetic shop of 60
 * conversations (about 1,600 sealed messages, French / Arabic / arabizi) plus 520 older fillers, written with sealed
 * contacts and bodies, indexed by the real tick until idle. The oracle below is a verbatim copy of what the route did
 * before the index existed (it does not use legacyConversationMatch). Message reads are counted at the codec.
 */
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  return { db: new Client(), shopContext: helpers.TEST_SHOP_CONTEXT };
});

import { runConversationSearchIndexTick } from "@/lib/search/conversation-search-runtime";

let seed: PrismaClient;
/** Numbers for the report: printed only (a test must not write outside the repository). */
function note(line: string): void {
  console.log(line);
}
let facts: ShopFacts;
type Counters = { bodies: number; contacts: number; conversations: number };
const fresh = (): Counters => ({ bodies: 0, contacts: 0, conversations: 0 });
type Loaded = Prisma.ConversationGetPayload<{ include: { messages: true } }>;

const readDerive: BlindIndexDeriver = async (values, reference) => {
  if (!(await shopKeyRowPresent(seed as never))) return null;
  return deriveExistingShopBlindIndexes(seed as never, values, reference, { shopContext: TEST_SHOP_CONTEXT, normalize: (v) => v });
};
const writeDerive: BlindIndexDeriver = (values, reference) =>
  deriveShopBlindIndexes(seed as never, values, reference, { shopContext: TEST_SHOP_CONTEXT, normalize: (v) => v });

async function open(row: Loaded, counters: Counters): Promise<SearchConversation> {
  const codec = createProtectedPiiCodec(seed as never, TEST_SHOP_CONTEXT);
  const contact = await codec.decryptFields({ id: row.id, contactName: row.contactName, contactPhone: row.contactPhone }, ["contactName", "contactPhone"], "Conversation");
  counters.conversations += 1;
  counters.contacts += 1;
  const messages = await Promise.all(
    row.messages.map(async (message) => {
      const opened = await codec.decryptFields({ id: message.id, body: message.body }, ["body"], "Message");
      counters.bodies += 1;
      return { ...message, body: (opened.body ?? null) as string | null };
    }),
  );
  return { ...row, contactName: String(contact.contactName), contactPhone: (contact.contactPhone ?? null) as string | null, messages };
}

const NEWEST_FIRST = [{ lastMessageAt: "desc" }, { updatedAt: "desc" }] as const;
const FIFTY = { orderBy: { timestamp: "desc" }, take: 50 } as const;

/** Verbatim copy of the old route: newest 500 with their 50 newest messages, filter, first 100, matchType. */
async function oldRoute(rawQuery: string, canReadContact: boolean, counters: Counters) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const rows = await seed.conversation.findMany({ include: { messages: FIFTY }, orderBy: [...NEWEST_FIRST], take: WINDOW_SIZE });
  const conversations = await Promise.all(rows.map((row) => open(row, counters)));
  return conversations
    .filter((conversation) => {
      if (canReadContact && matchesSearchQuery(query, [conversation.contactName])) return true;
      if (canReadContact && matchesSearchQuery(query, [conversation.contactPhone])) return true;
      return conversation.messages.some((message) => ((folded) => (query.length < 3 ? folded.split(" ").some((word) => word.startsWith(query)) : folded.includes(query)))(normalizeSearchText(message.body ?? "")));
    })
    .slice(0, 100)
    .map((conversation) => ({
      id: conversation.id,
      matchType:
        canReadContact && matchesSearchQuery(query, [conversation.contactName])
          ? "name"
          : canReadContact && matchesSearchQuery(query, [conversation.contactPhone])
            ? "phone"
            : "message",
    }));
}

function portsFor(counters: Counters, overrides: Partial<QueryPorts> = {}): QueryPorts {
  return {
    client: seed as never,
    derive: readDerive,
    listWindowIds: async () =>
      (await seed.conversation.findMany({ select: { id: true }, orderBy: [...NEWEST_FIRST], take: WINDOW_SIZE })).map((row) => row.id),
    loadConversations: async (ids) => {
      const rows = await seed.conversation.findMany({ where: { id: { in: [...ids] } }, include: { messages: FIFTY } });
      return Promise.all(rows.map((row) => open(row, counters)));
    },
    loadConversationRows: async (ids) => {
      const rows = await seed.conversation.findMany({ where: { id: { in: [...ids] } } });
      const codec = createProtectedPiiCodec(seed as never, TEST_SHOP_CONTEXT);
      return Promise.all(
        rows.map(async (row) => {
          const contact = await codec.decryptFields({ id: row.id, contactName: row.contactName, contactPhone: row.contactPhone }, ["contactName", "contactPhone"], "Conversation");
          counters.contacts += 1;
          return { ...row, contactName: String(contact.contactName), contactPhone: (contact.contactPhone ?? null) as string | null };
        }),
      );
    },
    openMessages: async (ids) => {
      const rows = await seed.message.findMany({ where: { id: { in: [...ids] } } });
      const codec = createProtectedPiiCodec(seed as never, TEST_SHOP_CONTEXT);
      return Promise.all(
        rows.map(async (message) => {
          const opened = await codec.decryptFields({ id: message.id, body: message.body }, ["body"], "Message");
          counters.bodies += 1;
          return { id: message.id, conversationId: message.conversationId, body: (opened.body ?? null) as string | null, direction: message.direction, timestamp: message.timestamp };
        }),
      );
    },
    drain: async () => undefined,
    ...overrides,
  };
}
async function indexed(rawQuery: string, canReadContact: boolean, counters: Counters, overrides: Partial<QueryPorts> = {}) {
  const rows = await searchConversationIndex(portsFor(counters, overrides), { query: normalizeSearchText(rawQuery), canReadContact });
  return rows.map((row) => ({ id: row.id, matchType: row.matchType }));
}

async function runUntilIdle(limit = 900): Promise<number> {
  for (let tick = 1; tick <= limit; tick += 1) if (!(await runConversationSearchIndexTick()).changed) return tick;
  throw new Error("the indexer never went idle");
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
  await writeDerive(["probe"], CONVERSATION_TOKEN_REFERENCE); // the key row exists before the first message
  facts = await insertSyntheticShop(seed, { sealed: true });
  // The triggers queued every message and conversation; the real tick drains and backfills until idle.
  await runUntilIdle();
}, 600_000);
afterAll(async () => {
  await wipeIndex();
  await disconnectTestPrisma(seed);
});

const QUERIES = [
  "livraison", "coque", "samsung", "alger", "blida", "paiement", "stock", "colis", "confirmer", "wilaya", // Latin words
  "التوصيل", "توصيل", "الطلبية", "طلبية", "كوفرتة", "الكتاب", "كتاب", "الدفع", "سعر", // Arabic with and without al-
  "livraison alger", "bghit nechri", "wach kayen", "سعر التوصيل", "je voudrais commander", "paiement à la livraison", // phrases
  "benali", "amine", "محمد", "karim ben", // names
  "0555", "555 12", "2 coques", // digits
  "sa", "ra", "sam", "zxqvw", // 2 and 3 characters, a word that exists nowhere
  "zorglub", "ferroudja", "tikjda", // beyond message 50 of its conversation, outside the newest 500, the newest message
];

describe("conversation search: indexed path equals the old route (T3)", () => {
  it("has the shop the brief asks for", async () => {
    const [messages] = await seed.$queryRawUnsafe<Array<{ n: bigint | number }>>(`SELECT COUNT(*) AS n FROM "Message"`);
    const [conversations] = await seed.$queryRawUnsafe<Array<{ c: bigint | number }>>(`SELECT COUNT(*) AS c FROM "Conversation"`);
    expect(Number(messages?.n)).toBe(facts.messageCount);
    expect(Number(messages?.n)).toBeGreaterThan(1_400);
    expect(Number(conversations?.c)).toBe(60 + 520);
    const windowIds = await portsFor(fresh()).listWindowIds();
    expect(windowIds).toHaveLength(WINDOW_SIZE);
    expect(windowIds).not.toContain(facts.outsideWindowId);
    expect(windowIds).toContain(facts.beyondFiftyId);
  });

  it("returns the same ids, order and matchType as the old route for every query (with and without the right to read contacts)", async () => {
    const phones = [facts.phoneA, facts.phoneB];
    const queries = [...QUERIES, phones[0]!.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4"), `+213${phones[1]!.slice(1)}`];
    expect(queries.length).toBeGreaterThanOrEqual(40);
    const mismatches: string[] = [];
    const totals = { oldBodies: 0, newBodies: 0, runs: 0, nonEmpty: 0 };
    for (const canReadContact of [true, false]) {
      for (const query of queries) {
        // A 2-character message query is a word start in the index (decided by the lead): pinned in its own test.
        if (!canReadContact && normalizeSearchText(query).length === 2) continue;
        const oldCounters = fresh();
        const newCounters = fresh();
        const expected = await oldRoute(query, canReadContact, oldCounters);
        const actual = await indexed(query, canReadContact, newCounters);
        totals.runs += 1;
        totals.oldBodies += oldCounters.bodies;
        totals.newBodies += newCounters.bodies;
        if (expected.length > 0) totals.nonEmpty += 1;
        if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(`${canReadContact}:${query}`);
      }
    }
    note(`W54_EQUIV queries=${queries.length} runs=${totals.runs} nonEmpty=${totals.nonEmpty} mismatches=${mismatches.length} bodiesOld=${totals.oldBodies} bodiesNew=${totals.newBodies}`);
    expect(mismatches).toEqual([]);
    expect(totals.nonEmpty).toBeGreaterThan(30);
  }, 600_000);

  it("finds a phone typed with spaces and with +213, and reaches only what the old window reaches", async () => {
    const [spaced] = await indexed(facts.phoneA.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4"), true, fresh());
    expect(spaced?.matchType).toBe("phone");
    expect((await indexed(`+213${facts.phoneB.slice(1)}`, true, fresh()))[0]?.matchType).toBe("phone");
    expect(await indexed("zorglub", true, fresh())).toEqual([]); // message 71 of 71: outside the 50 the search reads
    expect(await indexed("ferroudja", true, fresh())).toEqual([]); // outside the newest 500
    expect((await indexed("tikjda", true, fresh())).map((row) => row.id)).toEqual([facts.newestId]);
  });

  it("reads far fewer message bodies than the old path for a selective query (the two numbers)", async () => {
    const oldCounters = fresh();
    const newCounters = fresh();
    const expected = await oldRoute("tikjda", true, oldCounters);
    const actual = await indexed("tikjda", true, newCounters);
    expect(actual).toEqual(expected);
    note(`W54_READS query=selective bodiesOld=${oldCounters.bodies} bodiesNew=${newCounters.bodies} conversationsOld=${oldCounters.conversations} conversationsNew=${newCounters.conversations}`);
    expect(oldCounters.bodies).toBeGreaterThan(1_000);
    expect(newCounters.bodies * 10).toBeLessThan(oldCounters.bodies);
  });

  it("a 1-2 character message query matches the START of a word, for every user, and the index gives the old route's answer", async () => {
    for (const query of ["sa", "ra", "bo", "li", "ال"]) {
      for (const right of [true, false]) {
        const oldCounters = fresh();
        const newCounters = fresh();
        expect(await indexed(query, right, newCounters), `${query} right=${right}`).toEqual(await oldRoute(query, right, oldCounters));
        if (query === "sa" && right) {
          note(`W56_SHORT sa contactsOpenedNew=${newCounters.contacts} bodiesNew=${newCounters.bodies} contactsOpenedOld=${oldCounters.contacts} bodiesOld=${oldCounters.bodies}`);
          expect(newCounters.bodies).toBeLessThan(oldCounters.bodies); // candidate bodies only, never a whole window
        }
      }
    }
  });
});

describe("conversation search: safety (T7)", () => {
  it("a message inserted with the raw client before any drain is found", async () => {
    const stamp = new Date("2026-10-21T08:00:00Z");
    await seed.message.create({ data: { id: "syn-late-1", conversationId: facts.someId, body: "mot zebdatrouvable arrivé", direction: "inbound", timestamp: stamp } });
    expect(await indexed("zebdatrouvable", true, fresh())).toEqual([{ id: facts.someId, matchType: "message" }]);
    await runUntilIdle();
    expect(await indexed("zebdatrouvable", true, fresh())).toEqual([{ id: facts.someId, matchType: "message" }]); // and after the drain
  });

  it("with the shop key row gone, the answer is the old path's answer, not an empty one", async () => {
    const saved = await seed.protectedKeyAuthority.findUnique({ where: { purpose: "shop-blind-index" } });
    expect(saved).not.toBeNull();
    await seed.protectedKeyAuthority.deleteMany({ where: { purpose: "shop-blind-index" } });
    try {
      for (const query of ["livraison", "benali", "0555"]) {
        const counters = fresh();
        const expected = await oldRoute(query, true, fresh());
        expect(expected.length).toBeGreaterThan(0);
        expect(await indexed(query, true, counters)).toEqual(expected);
        expect(counters.conversations).toBe(WINDOW_SIZE); // the whole window was read the old way
      }
    } finally {
      await seed.protectedKeyAuthority.create({ data: saved! });
    }
    expect(await indexed("tikjda", true, fresh())).toEqual([{ id: facts.newestId, matchType: "message" }]);
  });

  it("an index client, a deriver or a drain that throws gives the old path's answer", async () => {
    const boom = async (): Promise<never> => {
      throw new Error("injected");
    };
    for (const query of ["livraison", "كتاب", "0555"]) {
      const expected = await oldRoute(query, true, fresh());
      expect(expected.length).toBeGreaterThan(0);
      expect(await indexed(query, true, fresh(), { client: { $queryRawUnsafe: boom } })).toEqual(expected);
      expect(await indexed(query, true, fresh(), { derive: boom })).toEqual(expected);
      expect(await indexed(query, true, fresh(), { drain: boom })).toEqual(expected);
    }
  });

  it("without the right to read contacts nothing matches by name or phone and the contact fields are null", async () => {
    const withRight = await indexed(facts.phoneA, true, fresh());
    expect(withRight.some((row) => row.matchType === "phone")).toBe(true);
    const without = await searchConversationIndex(portsFor(fresh()), { query: normalizeSearchText(facts.phoneA), canReadContact: false });
    expect(without.every((row) => row.matchType === "message")).toBe(true);
    for (const query of ["benali", "amine", facts.phoneA]) {
      const rows = await searchConversationIndex(portsFor(fresh()), { query: normalizeSearchText(query), canReadContact: false });
      for (const row of rows) {
        expect(row).toMatchObject({ matchType: "message", contactName: null, contactPhone: null, sourceId: null, fieldAccess: { contact: false } });
      }
    }
  });
});

describe("conversation search: plan contract of the index queries", () => {
  it("answers every token lookup from the (tokenHash, docId) index and never scans the document or token table", async () => {
    const recorded: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        recorded.push({ sql, values });
        return seed.$queryRawUnsafe(sql, ...values);
      },
    };
    for (const [query, right] of [["livraison", true], ["livraison", false], ["paiement à la livraison", true], ["0555", true], ["benali", true], ["zxqvw", true]] as const) {
      await searchConversationIndex(portsFor(fresh(), { client: client as never }), { query: normalizeSearchText(query), canReadContact: right });
    }
    const lookups = recorded.filter(({ sql }) => sql.includes('"ConversationSearchToken"') && !sql.includes("'K'"));
    expect(lookups.length).toBeGreaterThan(0);
    for (const { sql, values } of lookups) {
      const plan = (await seed.$queryRawUnsafe(`EXPLAIN QUERY PLAN ${sql}`, ...values)) as Array<{ detail: string }>;
      const lines = plan.map((row) => row.detail);
      const text = lines.join(" // ");
      expect(text, `plan: ${text}`).toContain("ConversationSearchToken_tokenHash_docId_idx");
      expect(
        lines.filter((line) => /^SCAN (?:d|t|ConversationSearchDoc|ConversationSearchToken)\b/u.test(line)),
        `plan: ${text}`,
      ).toEqual([]);
      // The join must start from the token hits and fetch each Doc row by its rowid. When SQLite starts from the Doc
      // table instead ("SEARCH d USING INDEX ..._kind_entityId_key (kind=?)" + an automatic index on the hits) it reads
      // every document of that kind for every statement: 250,000 rows, ~24 ms each, 5 statements per query (w58).
      expect(lines.filter((line) => /^SEARCH d USING (?:COVERING )?INDEX|AUTOMATIC/u.test(line)), `plan: ${text}`).toEqual([]);
      expect(text, `plan: ${text}`).toContain("SEARCH d USING INTEGER PRIMARY KEY (rowid=?)");
    }
  });
});

describe("conversation search: plan contract of the key canary probe", () => {
  it("is one point lookup by (kind, entityId) and then by (docId, tokenHash), asked before anything else, never a scan", async () => {
    const recorded: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        recorded.push({ sql, values });
        return seed.$queryRawUnsafe(sql, ...values);
      },
    };
    await searchConversationIndex(portsFor(fresh(), { client: client as never }), { query: normalizeSearchText("livraison"), canReadContact: true });
    const probes = recorded.filter(({ sql }) => sql.includes("'K'"));
    expect(probes).toHaveLength(1);
    expect(recorded[0]!.sql, "the canary is the first statement of the index path").toContain("'K'");
    const { sql, values } = probes[0]!;
    expect(values).toHaveLength(2); // the id and the hash, both bound
    const plan = (await seed.$queryRawUnsafe(`EXPLAIN QUERY PLAN ${sql}`, ...values)) as Array<{ detail: string }>;
    const text = plan.map((row) => row.detail).join(" // ");
    expect(text, `plan: ${text}`).toMatch(/SEARCH d USING (?:COVERING )?INDEX ConversationSearchDoc_kind_entityId_key \(kind=\? AND entityId=\?\)/u);
    expect(text, `plan: ${text}`).toMatch(/SEARCH t USING (?:COVERING )?(?:INDEX ConversationSearchToken_tokenHash_docId_idx|PRIMARY KEY) \((?:tokenHash=\? AND docId=\?|docId=\? AND tokenHash=\?)\)/u);
    expect(plan.filter((row) => /^SCAN\b/u.test(row.detail)), `plan: ${text}`).toEqual([]);
  });
});

describe("conversation search: plan contract of the message reads", () => {
  it("reads Message only through its primary key and its (conversationId, timestamp) index, never by scanning it", async () => {
    const recorded: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      $queryRawUnsafe: async (sql: string, ...values: unknown[]) => {
        recorded.push({ sql, values });
        return seed.$queryRawUnsafe(sql, ...values);
      },
    };
    for (const [query, right] of [["livraison", true], ["zorglub", false], ["tikjda", true]] as const) {
      await searchConversationIndex(portsFor(fresh(), { client: client as never }), { query: normalizeSearchText(query), canReadContact: right });
    }
    const reads = recorded.filter(({ sql }) => sql.includes('FROM "Message"'));
    expect(reads.length).toBeGreaterThan(0);
    for (const { sql, values } of reads) {
      const plan = (await seed.$queryRawUnsafe(`EXPLAIN QUERY PLAN ${sql}`, ...values)) as Array<{ detail: string }>;
      const lines = plan.map((row) => row.detail);
      expect(lines.filter((line) => /^SCAN (?:m|x|Message)\b/u.test(line)), `plan: ${lines.join(" // ")}`).toEqual([]);
    }
  });
});
