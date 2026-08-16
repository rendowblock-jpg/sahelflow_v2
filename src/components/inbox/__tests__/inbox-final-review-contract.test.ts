import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("Inbox final review invariants", () => {
  it("normalizes bounded Algerian phone variants before customer lookup", () => {
    const route = source("src/app/api/inbox/context/[id]/route.ts");

    expect(route).toContain("function algerianPhoneCandidates(value: string)");
    expect(route).toContain('`+213${national}`');
    expect(route).toContain('`00213${national}`');
    expect(route).toContain(
      "for (const phone of algerianPhoneCandidates(conversation.contactPhone))",
    );
    expect(route).toContain("phone,\n          deletedAt: null");
  });

  it("pins enriched search chats and keeps manual plus auto selections in the canonical URL", () => {
    const queue = source("src/components/inbox/inbox-work-queue.tsx");
    const desk = source("src/components/inbox/inbox-operations-desk.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");
    const deskTypes = source("src/components/inbox/inbox-desk-types.ts");

    expect(queue).toContain("selectChat(canonical ?? chat)");
    expect(queue).toContain(
      "router.replace(`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`)",
    );
    expect(queue).not.toContain("if (!canonical)");
    expect(desk).toContain("selectChat(first)");
    expect(desk).toContain(
      "router.replace(`/inbox?conversation=${encodeURIComponent(first.conversationId)}`)",
    );
    expect(workspace).toContain("pinnedDeepLinkChatRef.current = chat");
    expect(workspace).toContain(
      "(entry) => entry.conversationId === chat.conversationId",
    );
    expect(workspace).toContain("if (index === -1) return [chat, ...current]");
    expect(workspace).toContain("if (!existing) return [chat, ...current]");
    expect(workspace).toContain("next[index] = { ...existing, ...chat }");
    expect(deskTypes).toContain('result.channel === "whatsapp"');
    expect(deskTypes).toContain("id: transportId ?? result.id");
    expect(deskTypes).toContain("...(transportId ? { transportId } : {})");
  });

  it("defaults members to Mine without auto-opening another assignee's work", () => {
    const desk = source("src/components/inbox/inbox-operations-desk.tsx");

    expect(desk).not.toContain("defaultQueueResolvedRef");
    expect(desk).toContain(
      "const [defaultQueueResolved, setDefaultQueueResolved] = useState(false)",
    );
    expect(desk).toContain("const currentMemberId = authority.currentMemberId");
    expect(desk).toContain("if (!queueTouchedRef.current && currentMemberId)");
    expect(desk).toContain('setQueueFilter("mine")');
    expect(desk).toContain("setDefaultQueueResolved(true)");
    expect(desk).toContain("!defaultQueueResolved ||");
    expect(desk).toContain("const first = visibleQueueChats[0]");
    expect(desk).not.toContain("visibleQueueChats[0] ?? chats[0]");
    expect(desk).not.toContain("setQueueFilter(\"all\")");
  });

  it("clears the mobile conversation URL before clearing active thread state", () => {
    const desk = source("src/components/inbox/inbox-operations-desk.tsx");
    const thread = source("src/components/inbox/inbox-thread-workbench.tsx");

    expect(desk).toContain(
      "const [returningToQueue, setReturningToQueue] = useState(false)",
    );
    expect(desk).toContain("if (!returningToQueue || requestedConversationId) return");
    expect(desk).toContain('router.replace("/inbox")');
    expect(desk).toContain("clearActiveChat();");
    expect(desk).toContain("onBackToQueue={handleBackToQueue}");
    expect(thread).toContain("onBackToQueue: () => void");
    expect(thread).toContain("onClick={onBackToQueue}");
    expect(thread).not.toContain("onClick={clearActiveChat}");
  });

  it("waits for QR readiness and renders successful pairing instead of an endless loader", () => {
    const header = source("src/components/inbox/inbox-operations-header.tsx");

    expect(header).toContain('transport.status === "qr" ? (');
    expect(header).toContain('key={`${transport.status}:${qrKey}`}');
    expect(header).toContain('transport.status === "connected" ? (');
    expect(header).toContain('copy("transportConnected")');
    expect(header).toContain('copy("transportChecking")');
    expect(header).toContain("refreshQr();\n              void refreshChats();");
  });

  it("localizes recent order status instead of rendering raw provider values", () => {
    const panel = source("src/components/inbox/inbox-customer-work-panel.tsx");

    expect(panel).toContain("const ORDER_STATUS_COPY");
    expect(panel).toContain("function orderStatusLabel(");
    expect(panel).toContain("orderStatusLabel(order.status, locale)");
    expect(panel).toContain('refused: "Refused"');
    expect(panel).toContain('refused: "Refusée"');
    expect(panel).toContain('refused: "مرفوض"');
    expect(panel).not.toContain("{order.status}");
  });

  it("remounts the complete context surface when the canonical conversation changes", () => {
    const thread = source("src/components/inbox/inbox-thread-workbench.tsx");

    expect(thread).toContain("key={activeChat.conversationId}");
  });
});
