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
    expect(route).toContain("const applied = await db.$transaction");
    expect(route).toContain("data: { draftRevision: revision }");
    expect(route).toContain("data: { draftBody: normalized || null }");
    expect(route).toContain("draftRevision: { lt: revision }");
    expect(workspace).toContain("DRAFT_SAVE_DELAY_MS");
    expect(workspace).toContain("draftReadyConversationRef");
    expect(workspace).toContain("draftWriteQueueRef");
    expect(workspace).toContain("draftRevisionRef");
    expect(workspace).toContain("DRAFT_LOAD_ATTEMPTS");
    expect(workspace).toContain("if (!response || !isCurrentDraft()) return");
    expect(workspace).toContain("return data.applied === true");
    const draftLoader = workspace.slice(
      workspace.indexOf("const loadDraft"),
      workspace.indexOf("const handleStatusChange"),
    );
    expect(draftLoader).not.toContain("finally");
    expect(draftLoader.indexOf("await response.json()"))
      .toBeLessThan(draftLoader.indexOf("draftReadyConversationRef.current ="));
    expect(workspace).toContain(
      "draftWriteQueueRef.current.get(chat.conversationId)",
    );
    expect(workspace).toContain('window.addEventListener("pagehide"');
    expect(workspace).toContain(
      'document.addEventListener("visibilitychange"',
    );
    expect(workspace).toContain("keepalive: true");
    const selectChat = workspace.indexOf("const selectChat");
    expect(
      workspace.indexOf(
        "previousChat?.conversationId === chat.conversationId",
        selectChat,
      ),
    ).toBeLessThan(workspace.indexOf("void persistDraft(", selectChat));
    expect(
      workspace.indexOf("void persistDraft(", selectChat),
    ).toBeLessThan(workspace.indexOf("activeChatRef.current = chat", selectChat));
    const sendReply = workspace.indexOf("const sendReply");
    const clearAcceptedDraft = workspace.indexOf(
      "const clearAcceptedDraft",
      sendReply,
    );
    expect(clearAcceptedDraft).toBeGreaterThan(sendReply);
    expect(
      workspace.indexOf(
        "activeChatRef.current?.conversationId === chat.conversationId",
        clearAcceptedDraft,
      ),
    ).toBeGreaterThan(clearAcceptedDraft);
    expect(workspace.indexOf("clearAcceptedDraft();", sendReply))
      .toBeGreaterThan(workspace.indexOf('fetch("/api/whatsapp/send"'));
  });

  it("marks unread without reducing an existing inbound unread count", () => {
    const route = source("src/app/api/conversations/[id]/unread/route.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(route).toContain("where: { id, unreadCount: 0 }");
    expect(route).toContain("data: { unreadCount: { increment: 1 } }");
    expect(thread).toContain('copy("markUnread")');
    expect(thread).toContain("if (updated) onBackToQueue()");
    expect(workspace).toContain("explicitUnreadHoldRef");
    expect(workspace).toContain("readStateWriteQueueRef");
    expect(workspace).toContain("messageLoadGenerationRef.current += 1");
    expect(workspace.indexOf("await readStateWriteQueueRef.current"))
      .toBeLessThan(workspace.indexOf('/unread`'));
  });

  it("never projects raw attachment ciphertext or provider paths to the Inbox", () => {
    const route = source("src/app/api/conversations/[id]/route.ts");
    const inbound = source("src/lib/whatsapp/inbound-processor.ts");
    const metadata = source("src/lib/whatsapp/message-attachments.ts");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(route).toContain("attachments: undefined");
    expect(route).toContain(
      "projectWhatsAppMessageAttachmentForContactAccess",
    );
    expect(metadata).toContain("Provider URLs, media");
    expect(metadata).not.toContain("source.directPath");
    expect(inbound).toContain("normalizeWhatsAppMessageContent");
    expect(inbound).toContain("extractWhatsAppMessageAttachment(messageContent)");
    expect(source("src/hooks/use-inbox-workspace.ts")).toContain(
      "void loadMessages(activeChat, { background: true })",
    );
    expect(thread).toContain("https://www.openstreetmap.org/");
    expect(thread).toContain('rel="noopener noreferrer"');
  });
});
