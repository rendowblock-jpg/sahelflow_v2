import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("WhatsApp Inbox parity source slice", () => {
  it("persists protected drafts and clears them only after a send is accepted", () => {
    const schema = source("prisma/schema.prisma");
    const protectedFields = source("src/lib/crypto/protected-pii.ts");
    const route = source("src/app/api/conversations/[id]/draft/route.ts");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(schema).toContain("draftBody     String?");
    expect(protectedFields).toContain('"draftBody"');
    expect(route).toContain('requireTrustedAction("conversations.reply")');
    expect(route).toContain("data: { draftBody: normalized || null }");
    expect(workspace).toContain("DRAFT_SAVE_DELAY_MS");
    expect(workspace).toContain("draftReadyConversationRef");
    expect(workspace.indexOf('setReplyText("");', workspace.indexOf("const sendReply")))
      .toBeGreaterThan(workspace.indexOf('fetch("/api/whatsapp/send"'));
  });

  it("marks unread without reducing an existing inbound unread count", () => {
    const route = source("src/app/api/conversations/[id]/unread/route.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(route).toContain("where: { id, unreadCount: 0 }");
    expect(route).toContain("data: { unreadCount: { increment: 1 } }");
    expect(thread).toContain('copy("markUnread")');
    expect(thread).toContain("if (updated) onBackToQueue()");
  });

  it("never projects raw attachment ciphertext or provider paths to the Inbox", () => {
    const route = source("src/app/api/conversations/[id]/route.ts");
    const metadata = source("src/lib/whatsapp/message-attachments.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(route).toContain("attachments: undefined");
    expect(metadata).toContain("Provider URLs, media");
    expect(metadata).not.toContain("source.directPath");
    expect(thread).toContain("https://www.openstreetmap.org/");
    expect(thread).toContain('rel="noopener noreferrer"');
  });
});
