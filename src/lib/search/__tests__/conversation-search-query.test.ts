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
  /** Conversations the index names: all their messages as M documents and their contact as a C document. */
  candidates?: string[];
  contactCandidates?: string[];
  /** Conversations whose candidate messages tie at the 50th place. */
  tied?: string[];
  deriveNull?: boolean;
  throwOnQuery?: boolean;
  throwOnDrain?: boolean;
};

// Message ids in the stand-in are "<conversation>:<position, newest first>".
function fakePorts(data: SearchConversation[], script: Script = {}) {
  const calls = { sql: 0, loaded: [] as string[][], rows: [] as string[][], opened: [] as string[][], covered: [] as string[][], drained: 0, derived: 0 };
  const byId = new Map(data.map((entry) => [entry.id, entry] as const));
  const parse = (id: string) => ({ conversationId: id.slice(0, id.lastIndexOf(":")), index: Number(id.slice(id.lastIndexOf(":") + 1)) });
  const ports: QueryPorts = {
    client: {
      $queryRawUnsafe: async <T,>(sql: string, ...values: unknown[]): Promise<T> => {
        calls.sql += 1;
        if (script.throwOnQuery) throw new Error("index is busy");
        if (sql.includes("NOT EXISTS")) {
          calls.covered.push(values as string[]);
          return (script.covered ?? []).filter((id) => values.includes(id)).map((id) => ({ id })) as T;
        }
        if (sql.includes('"ConversationSearchToken"')) {
          const kind = values[values.length - 1];
          const named = kind === "M" ? (script.candidates ?? []) : (script.contactCandidates ?? script.candidates ?? []);
          return named.flatMap((id) =>
            kind === "M" ? (byId.get(id)?.messages ?? []).map((_, at) => ({ id: `${id}:${at}`, conversationId: id })) : [{ id, conversationId: id }],
          ) as T;
        }
        if (sql.includes('FROM "Message" m')) {
          return (values as string[]).map((id) => {
            const { conversationId, index } = parse(id);
            const tie = script.tied?.includes(conversationId) ?? false;
            return { id, conversationId, newer: tie ? 49 : index, atLeast: tie ? 51 : index + 1 };
          }) as T;
        }
        if (sql.includes("WITH wanted")) return (values as string[]).map((id) => ({ id: `${id}:0` })) as T;
        throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
      },
    },
    derive: async (values) => {
      calls.derived += 1;
      return script.deriveNull ? null : values.map((_, at) => (at + 1).toString(16).padStart(12, "0")); // one distinct number per token
    },
    listWindowIds: async () => data.map((entry) => entry.id),
    loadConversations: async (ids) => {
      calls.loaded.push([...ids]);
      // like the route: 50 newest messages; the loader may answer in any order
      return data.filter((entry) => ids.includes(entry.id)).map((entry) => ({ ...entry, messages: entry.messages.slice(0, 50) })).reverse();
    },
    loadConversationRows: async (ids) => {
      calls.rows.push([...ids]);
      return data.filter((entry) => ids.includes(entry.id)).map(({ messages: _messages, ...row }) => row).reverse();
    },
    openMessages: async (ids) => {
      calls.opened.push([...ids]);
      return ids
        .flatMap((id) => {
          const { conversationId, index } = parse(id);
          const message = byId.get(conversationId)?.messages[index];
          return message ? [{ id, conversationId, ...message }] : [];
        })
        .reverse();
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

  it("an index candidate is only a candidate: the message rule decides, uncovered conversations are read the old way", async () => {
    const { ports, calls } = fakePorts(shop(), { covered: ["a", "b"], candidates: ["b"] });
    // "colis": the index names b (true) and says nothing about a; c is not covered so it is read in full.
    expect(summary(await ask(ports, "colis"))).toEqual(["b:message"]);
    expect(calls.loaded).toEqual([["c"]]);
    expect(calls.opened.flat().filter((id) => id.startsWith("a"))).toEqual([]); // a is not named: no body of a is opened
    // A false candidate (the index says a, the text says no) never shows.
    const wrong = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a"] });
    expect(summary(await ask(wrong.ports, "colis"))).toEqual([]);
    expect(wrong.calls.loaded).toEqual([]);
    expect(wrong.calls.opened).toEqual([["a:0"], ["a:1"]]); // one body first, then the rest
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

  it("a 2-character query is judged on contacts alone plus the index; a 1-character query is not narrowable and asks the index nothing", async () => {
    // 2 characters with the right to read contacts: no contact token exists, so the contacts of the covered conversations
    // are judged with the contact rule (no body of theirs is opened for that) and the index serves the messages.
    const short = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a", "c"], contactCandidates: [] });
    expect(summary(await ask(short.ports, "sa"))).toEqual(oldWay(shop(), "sa"));
    expect(oldWay(shop(), "sa")).toEqual(["a:message", "b:name", "c:message"]);
    expect(short.calls.loaded).toEqual([]);
    expect(short.calls.rows[0]).toEqual(["a", "b", "c"]);
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

describe("searchConversationIndex checks candidates, not conversations", () => {
  it("walks the window in growing slices, stops once 100 conversations match and opens one body per conversation", async () => {
    const many = Array.from({ length: 300 }, (_, at) => conversation(`m${String(at).padStart(3, "0")}`, "Client", "0555000000", ["merci", "ok"]));
    const ids = many.map((entry) => entry.id);
    const { ports, calls } = fakePorts(many, { covered: ids, candidates: ids, contactCandidates: [] });
    const rows = await ask(ports, "merci");
    expect(rows.map((row) => row.id)).toEqual(ids.slice(0, 100));
    expect(calls.covered.map((batch) => batch.length)).toEqual([25, 50, 100]); // the last 125 conversations were never looked at
    expect(calls.opened.map((batch) => batch.length)).toEqual([25, 50, 100, 100]); // first body of each slice's conversations, then the newest message of the 100 answers
    expect(calls.loaded).toEqual([]);
    expect(rows[0]).toMatchObject({ matchType: "message", lastMessage: { body: "merci" } });
  });

  it("ignores a candidate message that is not among the 50 newest of its conversation, as the old route never read it", async () => {
    const bodies = (at: number) => Array.from({ length: 60 }, (_, index) => (index === at ? "zorglub ici" : `message ${index}`));
    const deep = conversation("z", "Client", null, bodies(55));
    const inside = conversation("y", "Client", null, bodies(49));
    const oldRoute = (entry: SearchConversation) => ({ ...entry, messages: entry.messages.slice(0, 50) });
    const data = [deep, inside];
    const { ports, calls } = fakePorts(data, { covered: ["z", "y"], candidates: ["z", "y"], contactCandidates: [] });
    expect(summary(await ask(ports, "zorglub"))).toEqual(oldWay(data.map(oldRoute), "zorglub"));
    expect(summary(await ask(fakePorts(data, { covered: ["z", "y"], candidates: ["z", "y"], contactCandidates: [] }).ports, "zorglub"))).toEqual(["y:message"]);
    expect(calls.opened.flat()).not.toContain("z:55");
  });

  it("a candidate tied at the 50th place cannot be ranked from the index: that conversation is judged in full", async () => {
    const { ports, calls } = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["b"], tied: ["b"], contactCandidates: [] });
    expect(summary(await ask(ports, "colis"))).toEqual(["b:message"]);
    expect(calls.loaded).toEqual([["b"]]);
  });

  it("judges the contact of the conversations the contact tokens name, and a contact hit keeps its type", async () => {
    const { ports, calls } = fakePorts(shop(), { covered: ["a", "b", "c"], candidates: ["a"], contactCandidates: ["a"] });
    expect(summary(await ask(ports, "benali"))).toEqual(["a:name"]);
    expect(calls.rows[0]).toEqual(["a"]);
    expect(calls.loaded).toEqual([]);
  });
});

describe("conversation search query path: stage timing (optional trace port)", () => {
  it("reports the time of every stage through ports.trace, and works the same without it", async () => {
    const script = { covered: ["a", "b", "c"], candidates: ["a"] };
    const expected = await ask(fakePorts(shop(), script).ports, "livraison");
    const traced = fakePorts(shop(), script);
    const seen: Array<[string, number]> = [];
    traced.ports.trace = (stage, ms) => seen.push([stage, ms]);
    expect(await ask(traced.ports, "livraison")).toEqual(expected);
    const stages = new Set(seen.map(([stage]) => stage));
    for (const stage of ["listWindowIds", "drain", "fullyIndexed", "hashing", "sqlM", "sqlC", "ranks", "openBodies", "contacts", "newestIds", "newest"]) {
      expect(stages.has(stage), `stage ${stage} is reported`).toBe(true);
    }
    for (const [, ms] of seen) expect(ms).toBeGreaterThanOrEqual(0);
  });
});
