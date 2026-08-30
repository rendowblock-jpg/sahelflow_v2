import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), file), "utf8")
    .replaceAll("\r\n", "\n");
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
    const queue = source("src/components/inbox/inbox-v3-queue.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");
    const deskTypes = source("src/components/inbox/inbox-desk-types.ts");

    expect(queue).toContain("selectChat(canonical ?? chat)");
    expect(queue).toContain(
      "`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`",
    );
    expect(queue).not.toContain("if (!canonical)");
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
    const workspace = source("src/components/inbox/inbox-v3-workspace.tsx");

    expect(workspace).not.toContain("defaultQueueResolvedRef");
    expect(workspace).toContain(
      "const [defaultQueueResolved, setDefaultQueueResolved] = useState(false)",
    );
    expect(workspace).toContain("const currentMemberId = authority.currentMemberId");
    expect(workspace).toContain("if (!queueTouchedRef.current)");
    expect(workspace).toContain("setDefaultQueueResolved(true)");
    expect(workspace).toContain("!defaultQueueResolved ||");
    expect(workspace).toContain("const first = visibleQueueChats[0]");
    expect(workspace).not.toContain("visibleQueueChats[0] ?? chats[0]");
  });

  it("clears the mobile conversation URL before clearing active thread state", () => {
    const workspace = source("src/components/inbox/inbox-v3-workspace.tsx");
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(workspace).toContain(
      "const [returningToQueue, setReturningToQueue] = useState(false)",
    );
    expect(workspace).toContain("if (!returningToQueue || requestedConversationId) return");
    expect(workspace).toContain('router.replace("/inbox")');
    expect(workspace).toContain("clearActiveChat();");
    expect(workspace).toContain("onBackToQueue={handleBackToQueue}");
    expect(thread).toContain("onBackToQueue: () => void");
    expect(thread).toContain("onClick={onBackToQueue}");
    expect(thread).not.toContain("onClick={clearActiveChat}");
  });

  it("waits for QR readiness and renders successful pairing instead of an endless loader", () => {
    const header = source("src/components/inbox/inbox-v3-header.tsx");
    const pairing = source("src/components/inbox/whatsapp-pairing-dialog.tsx");

    expect(pairing).toContain('fetch("/api/whatsapp/status"');
    expect(pairing).toContain('phase === "qr-ready" ? (');
    expect(pairing).toContain('key={`${qrKey}:${qrRevision}`}');
    expect(pairing).toContain('phase === "connected" ? (');
    expect(pairing).toContain('pairingCopy("connectedTitle")');
    expect(header).toContain('copy("transportChecking")');
    expect(header).toContain(
      "reconnect();\n              refreshQr();\n              void refreshChats();",
    );
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
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");

    expect(thread).toContain("key={activeChat.conversationId}");
  });
});
