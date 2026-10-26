process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deriveShopBlindIndexes } from "@/lib/crypto/protected-record";
import { db, dbRaw, shopContext } from "@/lib/db";
import { runConversationSearchIndexTick, searchConversationsIndexed } from "@/lib/search/conversation-search-runtime";
import { matchesSearchQuery, normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, the property that matters most: the index must never HIDE a conversation the old search shows.
 *
 * A random sequence of writes (new message, edit, delete, rename, new phone, new conversation, deleted conversation,
 * a few indexer ticks or none) is applied to a small shop through the app's own `db` (real sealing, real triggers,
 * real shop key). After every step the PRODUCTION function `searchConversationsIndexed` is compared with a verbatim
 * copy of the old route, for several queries and with and without the right to read contacts. Seeds are fixed, so a
 * failure names the seed, the step, the operation and the query and can be replayed. Synthetic data only.
 */

type ProtectedClient = Parameters<typeof deriveShopBlindIndexes>[0];
const ensureKey = (): Promise<string[]> =>
  deriveShopBlindIndexes(db as unknown as ProtectedClient, ["probe"], { recordType: "SearchProjection", field: "probe" }, {
    shopContext,
    normalize: (value) => value,
  });

const rawCount = async (sql: string): Promise<number> => {
  const [row] = await dbRaw.$queryRawUnsafe<Array<{ n: bigint | number }>>(sql);
  return Number(row?.n ?? 0);
};

async function wipe(): Promise<void> {
  await db.message.deleteMany({});
  await db.conversation.deleteMany({});
  for (const table of ["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty"]) {
    await dbRaw.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LATIN = ["livraison", "coque", "samsung", "alger", "blida", "paiement", "stock", "colis", "prix", "retour", "bonjour", "merci"];
const ARABIC = ["التوصيل", "الطلبية", "كوفرتة", "الدفع", "سعر", "شكرا"];
const ARABIZI = ["bghit", "nechri", "khoya", "wach", "kayen", "bzaf"];
const VOCABULARY = [...LATIN, ...ARABIC, ...ARABIZI];
const NAMES = ["Amine Benali", "Karim Bensalem", "محمد الأمين", "Yacine Cherif", "Nadia Merabet", "Lynda Hamidi", "Walid Slimani"];

const NEWEST_FIRST = [{ lastMessageAt: "desc" as const }, { updatedAt: "desc" as const }];

/** Verbatim copy of what the route did before the index existed. */
async function oldRoute(rawQuery: string, canReadContact: boolean) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];
  const conversations = await db.conversation.findMany({
    include: { messages: { orderBy: { timestamp: "desc" }, take: 50 } },
    orderBy: NEWEST_FIRST,
    take: 500,
  });
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

async function indexedRoute(rawQuery: string, canReadContact: boolean) {
  const rows = await searchConversationsIndexed({ query: normalizeSearchText(rawQuery), canReadContact });
  return rows.map((row) => ({ id: row.id, matchType: row.matchType }));
}

async function tick(times: number): Promise<void> {
  for (let turn = 0; turn < times; turn += 1) if (!(await runConversationSearchIndexTick()).changed) return;
}

async function tickUntilIdle(): Promise<void> {
  for (let turn = 1; turn <= 400; turn += 1) if (!(await runConversationSearchIndexTick()).changed) return;
  throw new Error("the indexer did not become idle in 400 turns");
}

type Run = { seed: number; steps: number };
const RUNS: Run[] = [
  { seed: 11, steps: 70 },
  { seed: 29, steps: 70 },
  { seed: 4242, steps: 70 },
];

beforeEach(async () => {
  await ensureKey();
  await wipe();
});
afterAll(async () => {
  await wipe();
  await db.$disconnect();
  await dbRaw.$disconnect();
});

describe("the indexed conversation search never hides what the old search shows (random writes)", () => {
  for (const run of RUNS) {
    it(`seed ${run.seed}: ${run.steps} random writes, every answer equals the old route's`, async () => {
      const next = random(run.seed);
      const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!;
      let clock = Date.parse("2026-10-20T10:00:00Z");
      let counter = 0;
      const fresh = (): string => `zq${run.seed}x${++counter}`;
      const rareWords: string[] = [];
      const conversations: string[] = [];
      const messages = new Map<string, string[]>(); // conversationId -> message ids
      const phones = new Map<string, string>();
      /** Words, names and phones written by the current step: the first queries after it probe exactly those. */
      let justWritten: string[] = [];

      const bodyOf = (): string => {
        const words: string[] = [];
        for (let count = 1 + Math.floor(next() * 3); count > 0; count -= 1) words.push(pick(VOCABULARY));
        if (next() < 0.25) {
          const rare = fresh();
          rareWords.push(rare);
          justWritten.push(rare);
          words.push(rare);
        }
        return words.join(" ");
      };
      const phoneOf = (): string => `0555${String(10_000 + counter * 37 + Math.floor(next() * 30)).padStart(6, "0")}`;

      const addConversation = async (messageCount: number): Promise<void> => {
        counter += 1;
        clock += 60_000;
        const name = pick(NAMES);
        const phone = next() < 0.9 ? phoneOf() : null;
        const conversation = await db.conversation.create({
          data: {
            channel: "whatsapp",
            contactName: name,
            contactPhone: phone,
            sourceId: `rand-${run.seed}-${counter}`,
            lastMessageAt: new Date(clock),
          },
        });
        conversations.push(conversation.id);
        if (phone) phones.set(conversation.id, phone);
        justWritten.push(name);
        if (phone) justWritten.push(phone);
        messages.set(conversation.id, []);
        for (let index = 0; index < messageCount; index += 1) await addMessage(conversation.id);
      };
      const addMessage = async (conversationId: string): Promise<void> => {
        clock += 1_000;
        const message = await db.message.create({
          data: {
            conversationId,
            body: bodyOf(),
            direction: next() < 0.5 ? "inbound" : "outbound",
            timestamp: new Date(clock),
          },
        });
        messages.get(conversationId)!.push(message.id);
      };

      // A conversation with more than 50 messages: the oldest ones are outside what the search reads.
      await addConversation(60);
      for (let index = 0; index < 14; index += 1) await addConversation(2 + Math.floor(next() * 5));
      await tickUntilIdle();
      const coveredAtStart = await rawCount(
        `SELECT COUNT(*) AS n FROM "ConversationSearchDoc" d WHERE d."kind" = 'C' AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDirty" y WHERE y."conversationId" = d."entityId")`,
      );
      expect(coveredAtStart).toBe(conversations.length); // the index is really in use, the test is not vacuous

      const queryPool = (): string[] => {
        const pool: string[] = [];
        for (let count = 0; count < 3; count += 1) {
          const word = pick(VOCABULARY);
          pool.push(word, word.slice(0, 3), word.slice(Math.max(0, Math.floor(word.length / 2) - 1), Math.floor(word.length / 2) + 2));
        }
        pool.push(`${pick(LATIN)} ${pick(LATIN)}`, `${pick(ARABIZI)} ${pick(ARABIZI)}`, pick(VOCABULARY).slice(0, 2));
        if (rareWords.length > 0) pool.push(pick(rareWords), pick(rareWords).slice(0, 4));
        const someName = pick(NAMES);
        pool.push(someName, someName.split(" ")[0]!, someName.replace(/\s+/gu, "").slice(1, 6));
        const phone = [...phones.values()][Math.floor(next() * Math.max(1, phones.size))];
        if (phone) pool.push(phone, phone.slice(-4), `+213${phone.slice(1)}`, `${phone.slice(0, 4)} ${phone.slice(4, 6)}`, "0555");
        return pool;
      };

      let coveredSeenDuringRun = 0;
      for (let step = 1; step <= run.steps; step += 1) {
        const roll = next();
        let operation: string;
        justWritten = [];
        const target = pick(conversations);
        if (roll < 0.22) {
          operation = `new message in ${target}`;
          await addMessage(target);
        } else if (roll < 0.36) {
          const ids = messages.get(target)!;
          const id = ids[Math.floor(next() * ids.length)];
          operation = `edit message ${id} of ${target}`;
          if (id) await db.message.update({ where: { id }, data: { body: bodyOf() } });
        } else if (roll < 0.46) {
          const ids = messages.get(target)!;
          const index = Math.floor(next() * ids.length);
          const id = ids[index];
          operation = `delete message ${id} of ${target}`;
          if (id) {
            await db.message.delete({ where: { id } });
            ids.splice(index, 1);
          }
        } else if (roll < 0.56) {
          const name = pick(NAMES);
          operation = `rename ${target} to ${name}`;
          await db.conversation.update({ where: { id: target }, data: { contactName: name } });
          justWritten.push(name);
        } else if (roll < 0.64) {
          const phone = next() < 0.85 ? phoneOf() : null;
          operation = `new phone for ${target}: ${phone}`;
          await db.conversation.update({ where: { id: target }, data: { contactPhone: phone } });
          if (phone) {
            phones.set(target, phone);
            justWritten.push(phone);
          } else phones.delete(target);
        } else if (roll < 0.72) {
          operation = "new conversation";
          await addConversation(1 + Math.floor(next() * 4));
        } else if (roll < 0.78 && conversations.length > 6) {
          operation = `delete conversation ${target}`;
          await db.conversation.delete({ where: { id: target } });
          conversations.splice(conversations.indexOf(target), 1);
          messages.delete(target);
          phones.delete(target);
        } else if (roll < 0.87) {
          const burst = 15 + Math.floor(next() * 16);
          operation = `burst of ${burst} new messages (more than one search can index)`;
          for (let index = 0; index < burst; index += 1) await addMessage(pick(conversations));
        } else if (roll < 0.92) {
          clock += 60_000;
          operation = `touch ${target} (moves it to the front of the window)`;
          await db.conversation.update({ where: { id: target }, data: { lastMessageAt: new Date(clock) } });
        } else {
          const turns = Math.floor(next() * 7);
          operation = `${turns} indexer tick(s)`;
          await tick(turns);
        }

        coveredSeenDuringRun = Math.max(
          coveredSeenDuringRun,
          await rawCount(
            `SELECT COUNT(*) AS n FROM "ConversationSearchDoc" d WHERE d."kind" = 'C' AND NOT EXISTS (SELECT 1 FROM "ConversationSearchDirty" y WHERE y."conversationId" = d."entityId")`,
          ),
        );
        const pool = queryPool();
        const queries = new Set([...justWritten.slice(-4), ...Array.from({ length: 6 }, () => pick(pool))]);
        for (const query of queries) {
          for (const canReadContact of [true, false]) {
            // A lone two-letter message query is a WORD START in the index and a substring in the old path; the
            // difference is documented and pinned in conversation-search-query.equivalence.test.ts.
            const expected = await oldRoute(query, canReadContact);
            const actual = await indexedRoute(query, canReadContact);
            expect(actual, `seed ${run.seed} step ${step} after "${operation}" query "${query}" contact=${canReadContact}`).toEqual(expected);
          }
        }
      }
      expect(coveredSeenDuringRun).toBeGreaterThan(5);
    }, 240_000);
  }
});
