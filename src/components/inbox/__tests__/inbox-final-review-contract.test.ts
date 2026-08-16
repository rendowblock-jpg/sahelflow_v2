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

  it("pins enriched persistent-search chats before selecting their provider thread", () => {
    const queue = source("src/components/inbox/inbox-work-queue.tsx");
    const workspace = source("src/hooks/use-inbox-workspace.ts");

    expect(queue).toContain("selectChat(canonical ?? chat)");
    expect(queue).toContain(
      "router.replace(`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`)",
    );
    expect(workspace).toContain("pinnedDeepLinkChatRef.current = chat");
    expect(workspace).toContain(
      "(entry) => entry.conversationId === chat.conversationId",
    );
    expect(workspace).toContain("if (index === -1) return [chat, ...current]");
    expect(workspace).toContain("next[index] = { ...existing, ...chat }");
  });

  it("resolves the default Mine or All queue before desktop auto-prime", () => {
    const desk = source("src/components/inbox/inbox-operations-desk.tsx");

    expect(desk).not.toContain("defaultQueueResolvedRef");
    expect(desk).toContain(
      "const [defaultQueueResolved, setDefaultQueueResolved] = useState(false)",
    );
    expect(desk).toContain("if (hasMine) setQueueFilter(\"mine\")");
    expect(desk).toContain("setDefaultQueueResolved(true)");
    expect(desk).toContain("!defaultQueueResolved ||");
  });

  it("re-probes QR readiness from the main refresh control", () => {
    const header = source("src/components/inbox/inbox-operations-header.tsx");

    expect(header).toContain("refreshQr,\n    canManageWhatsApp");
    expect(header).toContain("refreshQr();\n              void refreshChats();");
  });

  it("localizes recent order status instead of rendering raw provider values", () => {
    const panel = source("src/components/inbox/inbox-customer-work-panel.tsx");

    expect(panel).toContain("const ORDER_STATUS_COPY");
    expect(panel).toContain("function orderStatusLabel(");
    expect(panel).toContain("orderStatusLabel(order.status, locale)");
    expect(panel).not.toContain("{order.status}");
  });

  it("remounts the complete context surface when the canonical conversation changes", () => {
    const thread = source("src/components/inbox/inbox-thread-workbench.tsx");

    expect(thread).toContain("key={activeChat.conversationId}");
  });
});
