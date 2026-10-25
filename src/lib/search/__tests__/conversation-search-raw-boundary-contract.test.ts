import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

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
      .filter((path) => /\$(?:query|execute)RawUnsafe/u.test(read(path)) && /IndexerClient|SqlClient/u.test(read(path)));
    expect(users).toEqual([INDEX_FILE]);
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
