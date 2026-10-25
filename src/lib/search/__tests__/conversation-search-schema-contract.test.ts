import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PB-CONV-SEARCH-LOAD, slice 2: what the migration is allowed to do and where the erase puts the index.
 * Source contracts, the same style as command-search-contract.test.ts.
 */
const root = resolve(__dirname, "../../../..");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20261025030000_conversation_search_index/migration.sql"),
  "utf8",
);
const lifecycle = readFileSync(resolve(root, "src/lib/privacy/lifecycle.ts"), "utf8");
const MODELS = [
  "ConversationSearchDoc",
  "ConversationSearchToken",
  "ConversationSearchDirty",
  "ConversationSearchState",
] as const;

describe("conversation search migration", () => {
  it("only creates objects and seeds its one state row: no ALTER, no DROP, no copy out of existing tables", () => {
    expect(migration).not.toMatch(/^(ALTER|DROP|DELETE|UPDATE)\b/im);
    expect(migration).not.toMatch(/INSERT\s+(OR\s+\w+\s+)?INTO[^;]*\bSELECT\b/i);
    const topLevelInserts = migration.match(/^INSERT\b[^;]*;/gim) ?? [];
    expect(topLevelInserts).toHaveLength(1);
    expect(topLevelInserts[0]).toContain('"ConversationSearchState"');
    expect((migration.match(/^CREATE TABLE/gm) ?? []).length).toBe(4);
    for (const model of MODELS) expect(migration).toContain(`CREATE TABLE "${model}"`);
  });

  it("keeps the token rows small (WITHOUT ROWID) and indexed both ways", () => {
    expect(migration).toMatch(/CREATE TABLE "ConversationSearchToken"[\s\S]*?\) WITHOUT ROWID;/);
    expect(migration).toContain('PRIMARY KEY ("docId", "tokenHash")');
    expect(migration).toContain('ON "ConversationSearchToken"("tokenHash", "docId")');
  });

  it("has the six triggers, each on the column set that matters", () => {
    expect((migration.match(/^CREATE TRIGGER/gm) ?? []).length).toBe(6);
    expect(migration).toContain('AFTER INSERT ON "Message"');
    expect(migration).toContain('AFTER UPDATE OF "body", "conversationId" ON "Message"');
    expect(migration).toContain('AFTER DELETE ON "Message"');
    expect(migration).toContain('AFTER INSERT ON "Conversation"');
    expect(migration).toContain('AFTER UPDATE OF "contactName", "contactPhone" ON "Conversation"');
    expect(migration).toContain('AFTER DELETE ON "Conversation"');
    // A trigger may not read the sealed body or the contact fields: it only queues ids.
    expect(migration).not.toMatch(/(NEW|OLD)\."(body|contactName|contactPhone|draftBody)"/);
  });
});

describe("conversation search index and the privacy lifecycle", () => {
  it("keeps all four models out of the subject export", () => {
    const list = /const PRIVACY_EXPORT_EXCLUDED_MODELS = \[([\s\S]*?)\] as const;/.exec(lifecycle)?.[1] ?? "";
    for (const model of MODELS) expect(list, model).toContain(`"${model}"`);
  });

  it("wipes the index BEFORE deleting messages and conversations, so the delete triggers have nothing to do", () => {
    const wipeStart = lifecycle.indexOf("tx.conversationSearchToken.deleteMany");
    const docs = lifecycle.indexOf("tx.conversationSearchDoc.deleteMany");
    const dirty = lifecycle.indexOf("tx.conversationSearchDirty.deleteMany");
    const messages = lifecycle.indexOf("tx.message.deleteMany");
    const conversations = lifecycle.indexOf("tx.conversation.deleteMany");
    expect(wipeStart).toBeGreaterThan(-1);
    expect(docs).toBeGreaterThan(wipeStart);
    expect(dirty).toBeGreaterThan(-1);
    expect(Math.max(wipeStart, docs, dirty)).toBeLessThan(messages);
    expect(messages).toBeLessThan(conversations);
    // The state row (scheme number) is bookkeeping and survives an erase.
    expect(lifecycle).not.toContain("tx.conversationSearchState.deleteMany");
  });
});
