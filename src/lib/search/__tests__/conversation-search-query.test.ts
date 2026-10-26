import { describe, expect, it } from "vitest";

import { legacyConversationMatch } from "@/lib/search/conversation-search-legacy";
import {
  searchConversationIndex,
  type QueryPorts,
  type SearchConversation,
} from "@/lib/search/conversation-search-query";
import { normalizeSearchText } from "@/lib/search/universal-search";

/**
 * PB-CONV-SEARCH-LOAD, slice 4: the query path with stand-in ports (no database). The real index, real keys and
 * the 40-query equivalence run are in conversation-search-query.equivalence.test.ts.
 */
function conversation(id: string, name: string, phone: string | null, bodies: string[]): SearchConversation {
  return {
    id,
    channel: "whatsapp",
    contactName: name,
    contactPhone: phone,
    sourceId: `source-${id}`,
    lastMessageAt: new Date("2026-10-20T10:00:00Z"),
    unreadCount: 0,
    status: "open",
    assigneeId: null,
    priority: null,
    labels: null,
    snoozedUntil: null,
    waitingSince: null,
    firstReplyAt: null,
    messages: bodies.map((body, at) => ({
      body,
      direction: "inbound",
      timestamp: new Date(Date.UTC(2026, 9, 20, 10, 0, 0) - at * 60_000),
    })),
  };
}

type Script = {
  covered?: string[];
  candidates?: string[];
  deriveNull?: boolean;
  throwOnQuery?: boolean;
  throwOnDrain?: boolean;
};

function fakePorts(data: SearchConversation[], script: Script = {}) {
  const calls = { sql: 0, loaded: [] as string[][], drained: 0, derived: 0 };
  const ports: QueryPorts = {
    client: {
      $queryRawUnsafe: async <T,>(sql: string, ...values: unknown[]): Promise<T> => {
        calls.sql += 1;
        if (script.throwOnQuery) throw new Error("index is busy");
        const answer = sql.includes("NOT EXISTS") ? (script.covered ?? []) : (script.candidates ?? []);
        return answer.filter((id) => values.includes(id)).map((id) => ({ id })) as T;
      },
    },
    derive: async (values) => {
      calls.derived += 1;
      return script.deriveNull ? null : values.map(() => "0123456789ab");
    },
    listWindowIds: async () => data.map((entry) => entry.id),
    loadConversations: async (ids) => {
      calls.loaded.push([...ids]);
      return data.filter((entry) => ids.includes(entry.id)).reverse(); // the loader may answer in any order
    },
    drain: async () => {
      calls.drained += 1;
      if (script.throwOnDrain) throw new Error("queue is busy");
    },
  };
  return { ports, calls };
}

const shop = () => [
  conversation("a", "Amine Benali", "0555123456", ["salam", "livraison à Oran"]),
  conversation("b", "Karim Bensalem", "0661000000", ["merci", "colis arrivé"]),
  conversation("c", "Sofiane Boudiaf", null, ["bghit 2 coques samsung"]),
];
const ask = (ports: QueryPorts, query: string, canReadContact = true) =>
  searchConversationIndex(ports, { query: normalizeSearchText(query), canReadContact });
const summary = (rows: Array<{ id: string; matchType: string }>) => rows.map((row) => `${row.id}:${row.matchType}`);
const oldWay = (data: SearchConversation[], query: string, canReadContact = true) =>
  data.flatMap((entry) => {
    const matchType = legacyConversationMatch({
      query: normalizeSearchText(query),
      canReadContact,
      contactName: entry.contactName,
      contactPhone: entry.contactPhone,
      messageBodies: entry.messages.map((message) => message.body),
    });
    return matchType === null ? [] : [`${entry.id}:${matchType}`];
  });

describe("searchConversationIndex with stand-in ports", () => {
  it("drains up to the queue before it looks, and survives a drain that fails", async () => {
    const { ports, calls } = fakePorts(shop(), { throwOnDrain: true });
    expect(summary(await ask(ports, "livraison"))).toEqual(oldWay(shop(), "livraison"));
    expect(calls.drained).toBe(1);
  });

  it("an index candidate is only a candidate: the legacy predicate decides, uncovered conversations are read the old way", async () => {
    const { ports, calls } = fakePorts(shop(), { covered: ["a", "b"], candidates: ["b"] });
    // "colis": the index names b (true) and says nothing about a; c is not covered so it is read in full.
    expect(summary(await ask(ports, "colis"))).toEqual(["b:message"]);
    expect(calls.loaded).toEqual([["b", "c"]]);
    // A false candidate (the index says a, the text says no) never shows.
    const wrong = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a"] });
    expect(summary(await ask(wrong.ports, "colis"))).toEqual([]);
    expect(wrong.calls.loaded).toEqual([["a"]]);
  });

  it("falls back to the old path, never to an empty answer: a failing index query, a missing key row", async () => {
    const everything = ["a", "b", "c"];
    const failing = fakePorts(shop(), { covered: everything, throwOnQuery: true });
    expect(summary(await ask(failing.ports, "colis"))).toEqual(oldWay(shop(), "colis"));
    expect(failing.calls.loaded).toEqual([everything]);

    const noKey = fakePorts(shop(), { covered: everything, candidates: [], deriveNull: true });
    expect(summary(await ask(noKey.ports, "colis"))).toEqual(oldWay(shop(), "colis"));
    expect(noKey.calls.loaded).toEqual([everything]);
    expect(oldWay(shop(), "colis")).toEqual(["b:message"]);
  });

  it("a query the index cannot narrow runs the old path for every conversation and asks the index nothing", async () => {
    // 2 characters with the right to read contacts: the contact check has no tokens to ask for.
    const short = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: [] });
    expect(summary(await ask(short.ports, "sa"))).toEqual(oldWay(shop(), "sa"));
    expect(short.calls.sql).toBe(0);
    expect(short.calls.loaded).toEqual([["a", "b", "c"]]);
    // 1 character: not narrowable at all.
    const one = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: [] });
    expect(summary(await ask(one.ports, "a", false))).toEqual(oldWay(shop(), "a", false));
    expect(one.calls.sql).toBe(0);
  });

  it("keeps the window order, stops at 100 and builds the row the route always built", async () => {
    const many = Array.from({ length: 150 }, (_, at) => conversation(`m${String(at).padStart(3, "0")}`, "Client", "0555000000", ["merci"]));
    const { ports } = fakePorts(many, {});
    const rows = await ask(ports, "merci");
    expect(rows.map((row) => row.id)).toEqual(many.slice(0, 100).map((entry) => entry.id));

    const one = fakePorts([{ ...conversation("x", "Amine", "0555123456", ["salam", "ancien"]), labels: '["vip"]' }], {});
    const [row] = await ask(one.ports, "amine");
    expect(Object.keys(row!)).toEqual([
      "id", "conversationId", "contactName", "contactPhone", "sourceId", "channel", "lastMessageAt", "unreadCount",
      "lastMessage", "workflow", "matchType", "fieldAccess",
    ]);
    expect(row).toMatchObject({ matchType: "name", workflow: { labels: ["vip"] }, fieldAccess: { contact: true }, lastMessage: { body: "salam" } });
    const [hidden] = await ask(fakePorts([conversation("y", "Amine", "0555123456", ["amine ici"])], {}).ports, "amine", false);
    expect(hidden).toMatchObject({ matchType: "message", contactName: null, contactPhone: null, sourceId: null, fieldAccess: { contact: false } });
  });
});

describe("conversation search query path: stage timing (optional trace port)", () => {
  it("reports the time of every stage through ports.trace, and works the same without it", async () => {
    const plain = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a"] });
    const expected = await ask(plain.ports, "livraison");
    const traced = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a"] });
    const seen: Array<[string, number]> = [];
    traced.ports.trace = (stage, ms) => seen.push([stage, ms]);
    expect(await ask(traced.ports, "livraison")).toEqual(expected);
    const stages = new Set(seen.map(([stage]) => stage));
    for (const stage of ["listWindowIds", "drain", "fullyIndexed", "hashing", "sqlM", "sqlC", "loadConversations", "legacy"]) {
      expect(stages.has(stage), `stage ${stage} is reported`).toBe(true);
    }
    for (const [, ms] of seen) expect(ms).toBeGreaterThanOrEqual(0);
  });
});
