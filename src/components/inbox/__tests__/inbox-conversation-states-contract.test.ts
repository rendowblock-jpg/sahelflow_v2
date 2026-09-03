import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const LOCALES = ["en", "fr", "ar"] as const;

/**
 * Ledger INB-12 — pin / mute / archive conversation states: additive schema
 * columns, server-projected state truth, an ownership-gated partial PATCH,
 * archive-aware queue counts with an archive pill, pinned-first ordering and
 * an honest per-row state menu.
 */
describe("inbox conversation states (INB-12)", () => {
  it("adds the three state columns with an archive index and an additive migration", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("pinnedAt      DateTime?");
    expect(schema).toContain("mutedUntil    DateTime?");
    expect(schema).toContain("archivedAt    DateTime?");
    expect(schema).toContain("@@index([archivedAt])");

    const migration = source(
      "prisma/migrations/20260902010000_conversation_pin_mute_archive/migration.sql",
    );
    expect(migration).toContain('ADD COLUMN "pinnedAt" DATETIME');
    expect(migration).toContain('ADD COLUMN "mutedUntil" DATETIME');
    expect(migration).toContain('ADD COLUMN "archivedAt" DATETIME');
    expect(migration).toContain(
      'CREATE INDEX "Conversation_archivedAt_idx"',
    );
  });

  it("projects state truth server-side with a mute horizon", () => {
    const chatsRoute = source("src/app/api/whatsapp/chats/route.ts");
    expect(chatsRoute).toContain("pinnedAt: true");
    expect(chatsRoute).toContain("mutedUntil: true");
    expect(chatsRoute).toContain("archivedAt: true");
    expect(chatsRoute).toContain("conversation.mutedUntil.getTime() > Date.now()");
    expect(chatsRoute).toContain("states: {");
  });

  it("patches states through the gated partial route", () => {
    const route = source("src/app/api/conversations/[id]/state/route.ts");
    expect(route).toContain('requireTrustedAction("conversations.update")');
    expect(route).toContain("pinned: z.boolean().optional()");
    expect(route).toContain("muted: z.boolean().optional()");
    expect(route).toContain("archived: z.boolean().optional()");
    expect(route).toContain('code: "CONVERSATION_NOT_FOUND"');
    expect(route).toContain("Object.keys(data).length === 0");
  });

  it("sorts pinned first and isolates the archive queue", () => {
    const hook = source("src/hooks/use-inbox-workspace.ts");
    expect(hook).toContain("Number(b.pinned) - Number(a.pinned)");
    expect(hook).toContain('queueFilter === "archived"');
    expect(hook).toContain("const setConversationState = useCallback(");
    const workspace = source("src/components/inbox/inbox-v3-workspace.tsx");
    expect(workspace).toContain('queueFilter === "archived" ? chat.archived : !chat.archived');
    const queue = source("src/components/inbox/inbox-v3-queue.tsx");
    expect(queue).toContain('data-inbox-state-pin="true"');
    expect(queue).toContain('data-inbox-state-mute="true"');
    expect(queue).toContain('data-inbox-state-archive="true"');
    expect(queue).toContain('"all", "mine", "unread", "archived"');
    expect(queue).toContain("chat.archived");
  });

  it("ships the state copy in en/fr/ar", () => {
    expect(getInboxWorkspaceCopy("en", "pinChat")).toBe("Pin conversation");
    expect(getInboxWorkspaceCopy("fr", "queueArchived")).toBe("Archivées");
    expect(getInboxWorkspaceCopy("ar", "archiveChat")).toBe("أرشفة المحادثة");
    for (const key of [
      "conversationState",
      "pinChat",
      "unpinChat",
      "muteChat",
      "unmuteChat",
      "archiveChat",
      "unarchiveChat",
      "queueArchived",
    ] as const) {
      for (const locale of LOCALES) {
        expect(getInboxWorkspaceCopy(locale, key), `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
