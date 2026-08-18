import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("Inbox workspace contract", () => {
  it("preserves the saved-history source contract", () => {
    const route = read("src/app/api/whatsapp/chats/route.ts");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    expect(route).toContain("getStoredConversationSummaries");
    expect(route).toContain('source: "database"');
    expect(hook).toContain("savedHistory");
  });

  it("keeps desktop/mobile conversation selection explicit", () => {
    const workspace = read("src/components/inbox/inbox-v3-workspace.tsx");
    expect(workspace).toContain("useMobile()");
    expect(workspace).toContain("activeChat");
    expect(workspace).toContain("clearActiveChat");
    expect(workspace).toContain("InboxV3Queue");
    expect(workspace).toContain("InboxV3Thread");
  });

  it("keeps degraded transport from destroying durable workspace state", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(hook).toContain("transport");
    expect(hook).toContain("dataDegraded");
    expect(thread).toContain("canSend");
    expect(thread).toContain("WhatsAppPairingDialog");
    expect(thread).toContain("Textarea");
  });

  it("preserves mixed-direction user content at the message boundary", () => {
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(thread).toContain('dir="auto"');
    expect(thread).toContain('data-sf-user-content="true"');
  });

  it("preserves assignment versions and coalesced live refresh at the authority boundary", () => {
    const route = read("src/app/api/whatsapp/chats/route.ts");
    const assignment = read("src/lib/inbox/conversation-assignment.ts");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    expect(route).toContain("getConversationAssignmentVersions");
    expect(route).toContain("{ prisma: db, shop: shopContext }");
    expect(route).not.toContain("$queryRaw");
    expect(assignment).toContain("Prisma.join(unique)");
    expect(assignment).toContain('FROM "BusinessAggregateVersion"');
    expect(hook).toContain("CHAT_REFRESH_COALESCE_MS");
    expect(hook).toContain("scheduleChatsRefresh");
  });

  it("opens search and command results through canonical persisted conversation ids", () => {
    const search = read("src/lib/search/universal-search-server.ts");
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const queue = read("src/components/inbox/inbox-v3-queue.tsx");

    expect(search).toContain(
      'href: `/inbox?conversation=${encodeURIComponent(conversation.id)}`',
    );
    expect(hook).toContain('searchParams.get("conversation")');
    expect(hook).toContain("pinnedDeepLinkChatRef");
    expect(queue).toContain("/api/conversations/search?q=");
    expect(queue).toContain("selectChat(canonical ?? chat)");
    expect(queue).toContain(
      "router.replace(`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`)",
    );
  });

  it("keeps transport and durable outbox authority in the existing workspace hook", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(hook).toContain("sendReply");
    expect(hook).toContain("retryFailedMessage");
    expect(hook).toContain("disconnectWhatsApp");
    expect(thread).toContain("sendReply");
    expect(thread).toContain("retryFailedMessage");
  });
});
