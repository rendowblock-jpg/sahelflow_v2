import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { KEY_CANARY_STRING, contactTokenStringsOf, tokenStringsOf } from "@/lib/search/conversation-search-tokens";

/**
 * PB-CONV-SEARCH-LOAD, slice 3: the reviewed raw-SQL boundary of the conversation-search indexer.
 *
 * scripts/verify-protected-raw-access.ts only sees raw Prisma calls made on the imported `db`. The indexer gets its
 * client as a parameter (so its tests can use a plain client), which that script cannot follow. This test keeps the
 * same promise by other means: the raw SQL lives in ONE file, it touches only the four index tables for writing, it
 * only READS three columns of Message and the id of Conversation, and no value is ever pasted into the SQL text.
 */
const root = process.cwd();
const INDEX_FILE = "src/lib/search/conversation-search-index.ts";
const RUNTIME_FILE = "src/lib/search/conversation-search-runtime.ts";
const QUERY_FILE = "src/lib/search/conversation-search-query.ts";
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx)$/u.test(entry.name)) found.push(path);
  }
  return found;
}

describe("conversation-search indexer: raw SQL boundary", () => {
  const source = read(INDEX_FILE);

  it("is the only non-test file that makes raw calls on an injected index client", () => {
    const users = sourceFiles("src")
      .filter((path) => !path.includes("/__tests__/") && !/\.test\.[cm]?tsx?$/u.test(path))
      .filter((path) => /\$(?:query|execute)RawUnsafe/u.test(read(path)) && /IndexerClient|SqlClient|QueryClient/u.test(read(path)));
    expect(users).toEqual([INDEX_FILE, QUERY_FILE]);
  });

  it("is wired to the real database in exactly one place, which the idle gate loads on its first tick", () => {
    const importers = sourceFiles("src")
      .filter((path) => !path.includes("/__tests__/"))
      .filter((path) => /from "@\/lib\/search\/conversation-search-index"/u.test(read(path)))
      .map((path) => relative(root, join(root, path)).replaceAll("\\", "/"));
    expect(importers).toEqual([RUNTIME_FILE]);
    expect(read("src/lib/search/conversation-search-idle.ts")).toContain('await import("@/lib/search/conversation-search-runtime")');
  });

  it("never writes to Message or Conversation, only reads them", () => {
    expect(source).not.toMatch(/(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+"(?:Message|Conversation)"/iu);
  });

  it("writes only to the four index tables", () => {
    const written = [...source.matchAll(/(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/giu)].map((match) => match[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const table of written) {
      expect(["ConversationSearchToken", "ConversationSearchDoc", "ConversationSearchDirty", "ConversationSearchState"]).toContain(table);
    }
  });

  it("reads the sealed body only through the three reviewed SELECTs, and never any other Message column", () => {
    const reads = [...source.matchAll(/SELECT\s+([^`]*?)\s+FROM\s+"Message"/gu)].map((match) => match[1]!.replace(/\s+/gu, " "));
    expect(reads.sort()).toEqual(
      ['"id", "conversationId", "body"', 'm."id", m."conversationId", m."body"', "1 AS x"].sort(),
    );
  });

  it("pastes nothing into the SQL text except placeholders, constants and the fixed uncovered-conversations clause", () => {
    // Walk every ${ ... } of the file, nested braces included (some span several lines).
    const interpolations: string[] = [];
    for (let at = source.indexOf("${"); at >= 0; at = source.indexOf("${", at + 2)) {
      let depth = 1;
      let end = at + 2;
      while (depth > 0 && end < source.length) {
        depth += (source[end] === "{" ? 1 : 0) - (source[end] === "}" ? 1 : 0);
        end += 1;
      }
      interpolations.push(source.slice(at + 2, end - 1).replace(/\s+/gu, " ").trim());
    }
    expect(interpolations.length).toBeGreaterThan(0);
    const allowed = new Set([
      "marks(batch.length)",
      "UNCOVERED_CONVERSATIONS",
      "Math.max(1, Math.trunc(limit))",
      "BACKFILL_CHUNK_MESSAGES + 1",
      "BACKFILL_CANDIDATES",
      `batch .map(() => "('M', ?, ?)") .join(",")`,
      `new Array(batch.length / 2) .fill("(?, ?)") .join(",")`,
    ]);
    for (const expression of interpolations) expect(allowed.has(expression), expression).toBe(true);
  });

  it("the runtime hands the real client over and decrypts through the protected message codec", () => {
    const runtime = read(RUNTIME_FILE);
    expect(runtime).toContain('decryptFields({ id: message.id, body: message.body }, ["body"], "Message")');
    expect(runtime).toContain("deriveExistingShopBlindIndexes");
    expect(runtime).not.toMatch(/deriveShopBlindIndexes\(/u); // a read path must never create the key
  });
});

describe("conversation-search query path: raw SQL boundary", () => {
  const query = read(QUERY_FILE);

  it("imports no database, no index writer and no runtime", () => {
    expect(query).not.toMatch(/from "(?:@\/lib\/db|@prisma\/client|@\/lib\/search\/conversation-search-(?:index|runtime))"/u);
  });

  it("is imported by the runtime only, and the route reaches it through the runtime", () => {
    const importers = sourceFiles("src")
      .filter((path) => !path.includes("/__tests__/"))
      .filter((path) => /from "@\/lib\/search\/conversation-search-query"/u.test(read(path)));
    expect(importers).toEqual([RUNTIME_FILE]);
    const route = read("src/app/api/conversations/search/route.ts");
    expect(route).toContain('from "@/lib/search/conversation-search-runtime"');
    expect(route).not.toMatch(/from "@\/lib\/db"/u);
  });

  it("reads the index tables and, from Message, only ids, the conversation and timestamps (never a body, never Conversation), and writes nothing", () => {
    const tables = [...query.matchAll(/(?:FROM|JOIN)\s+"(\w+)"/gu)].map((match) => match[1]);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(["ConversationSearchDoc", "ConversationSearchToken", "ConversationSearchDirty", "Message"]).toContain(table);
    expect(tables).toContain("Message");
    const columns = [...query.matchAll(/\b[mx]\."(\w+)"/gu)].map((match) => match[1]);
    expect(columns.length).toBeGreaterThan(0);
    for (const column of columns) expect(["id", "conversationId", "timestamp"]).toContain(column);
    expect(query).not.toMatch(/\$executeRawUnsafe|INSERT\s|UPDATE\s+"|DELETE\s+FROM|REPLACE\s+INTO|CREATE\s|DROP\s/iu);
    expect(query).not.toMatch(/"Conversation"|"body"/u);
  });

  it("pastes nothing into the SQL text except placeholders: every value is a bound parameter", () => {
    const interpolations: string[] = [];
    for (let at = query.indexOf("${"); at >= 0; at = query.indexOf("${", at + 2)) {
      let depth = 1;
      let end = at + 2;
      while (depth > 0 && end < query.length) {
        depth += (query[end] === "{" ? 1 : 0) - (query[end] === "}" ? 1 : 0);
        end += 1;
      }
      interpolations.push(query.slice(at + 2, end - 1).replace(/\s+/gu, " ").trim());
    }
    const sqlInterpolations = interpolations.filter((expression) => /^(?:marks|singles)\(/u.test(expression));
    expect(sqlInterpolations.length).toBeGreaterThan(0);
    const allowed = new Set(["marks(batch.length)", "singles(batch.length)"]);
    for (const expression of sqlInterpolations) expect(allowed.has(expression), expression).toBe(true);
    expect(interpolations.filter((expression) => !/^(?:marks|singles)\(/u.test(expression))).toEqual([]);
  });
});

describe("conversation-search key canary: raw SQL boundary", () => {
  const index = read(INDEX_FILE);
  const query = read(QUERY_FILE);

  it("the index has exactly one document kind besides M and C: K, the key canary", () => {
    const kinds = [...new Set([...index.matchAll(/'([A-Z])'/gu)].map((match) => match[1]))].sort();
    expect(kinds).toEqual(["C", "K", "M"]);
  });

  it("the indexer writes the canary only in the one function that also purges what an old key left behind", () => {
    const start = index.indexOf("export async function ensureKeyCanary");
    expect(start).toBeGreaterThan(0);
    const body = index.slice(start, index.indexOf("\n}\n", start));
    expect(body).toMatch(/'K'/u);
    // outside that function nothing writes a K document
    expect(index.replace(body, "")).not.toMatch(/INSERT\s+INTO\s+"ConversationSearchDoc"[^;]*'K'/iu);
  });

  it("the query path reads the canary with ONE statement over the two index tables, the id and the hash bound, nothing pasted", () => {
    const statements = [...query.matchAll(/`([^`]*'K'[^`]*)`/gu)].map((match) => match[1]!.replace(/\s+/gu, " "));
    expect(statements).toHaveLength(1);
    const sql = statements[0]!;
    expect(sql).not.toContain("${");
    expect(sql).toMatch(/\bd\."entityId" = \?/u);
    expect(sql).toMatch(/\bt\."tokenHash" = \?/u);
    expect([...sql.matchAll(/(?:FROM|JOIN)\s+"(\w+)"/gu)].map((match) => match[1]).sort()).toEqual(["ConversationSearchDoc", "ConversationSearchToken"]);
    expect(query).toContain("hashKeyCanary");
  });

  it("the canary string is in no token family a message or a contact can produce", () => {
    for (const prefix of ["msg-p:", "msg-t:", "conv-n:", "conv-p:", "conv-c:"]) expect(KEY_CANARY_STRING.startsWith(prefix), prefix).toBe(false);
    // Whatever text a message or a contact holds, its tokens carry one of those prefixes, so none can equal the canary.
    const produced = new Set([...tokenStringsOf("key-canary:v1 key canary v1"), ...contactTokenStringsOf("Key Canary", "0555000000")]);
    expect(produced.has(KEY_CANARY_STRING)).toBe(false);
    for (const entry of produced) expect(/^(?:msg-[pt]|conv-[npc]):/u.test(entry), entry).toBe(true);
  });
});
