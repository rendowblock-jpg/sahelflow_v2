import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Class-AAA Inbox composition contract", () => {
  it("uses the live V3 immersive workspace while replacing the rejected legacy composition", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    const workspace = read("src/components/inbox/inbox-v3-workspace.tsx");
    const foundation = read("src/app/phase5.css");

    expect(page).toContain('className="app-workspace-content flex flex-col"');
    expect(page).toContain("InboxV3Workspace");
    expect(page).not.toContain("InboxOperationsDesk");
    expect(page).not.toContain("InboxDesktopPrimer");
    expect(workspace).toContain('data-inbox-workspace="v2"');
    expect(workspace).toContain('data-inbox-version="v3"');
    expect(workspace).toContain('data-inbox-operations-desk="true"');
    expect(foundation).not.toContain("data-inbox-operations-desk");
  });

  it("keeps the common desktop path two-pane and mounts context only at its active breakpoint", () => {
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(thread).toContain("InboxCustomerWorkPanel");
    expect(thread).toContain("key={activeChat.conversationId}");
    expect(thread).toContain("<Sheet>");
    expect(thread).toContain('side="end"');
    expect(thread).not.toContain('side={locale === "ar" ? "left" : "right"}');
    expect(thread).not.toContain('className="min-[1500px]:hidden"');
  });

  it("defaults member work to Mine without auto-opening another assignee's queue", () => {
    const workspace = read("src/components/inbox/inbox-v3-workspace.tsx");
    expect(workspace).toContain(
      "const [defaultQueueResolved, setDefaultQueueResolved] = useState(false)",
    );
    expect(workspace).toContain("const currentMemberId = authority.currentMemberId");
    expect(workspace).toContain("if (!queueTouchedRef.current)");
    expect(workspace).toContain("setDefaultQueueResolved(true)");
    expect(workspace).toContain("const first = visibleQueueChats[0]");
    expect(workspace).not.toContain("visibleQueueChats[0] ?? chats[0]");
  });

  it("uses task-shaped queues instead of five equal workflow tabs", () => {
    const queue = read("src/components/inbox/inbox-v3-queue.tsx");
    expect(queue).toContain("WorkflowFilter");
    expect(queue).toContain("queueFilter === \"mine\"");
    expect(queue).toContain("queueFilter === \"unassigned\"");
    expect(queue).toContain("/api/conversations/search?q=");
    expect(queue).toContain("selectChat(canonical ?? chat)");
    expect(queue).toContain(
      "`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`",
    );
    expect(queue).not.toContain("if (!canonical)");
  });

  it("keeps operational typography above legacy microcopy sizes", () => {
    const context = read("src/components/inbox/inbox-customer-work-panel.tsx");

    expect(context).not.toContain('text-[10px]');
    expect(context).not.toContain('text-[11px]');
  });

  it("preserves bounded thread scrolling and mobile queue-first navigation", () => {
    const hook = read("src/hooks/use-inbox-workspace.ts");
    const workspace = read("src/components/inbox/inbox-v3-workspace.tsx");
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");

    expect(hook).toContain("messages?limit=200");
    expect(hook).toContain("isNearBottomRef");
    expect(workspace).toContain("!isMobile || !activeChat");
    expect(workspace).toContain("!isMobile || activeChat");
    expect(workspace).toContain("onBackToQueue={handleBackToQueue}");
    expect(thread).toContain("onBackToQueue: () => void");
    expect(thread).toContain("onClick={onBackToQueue}");
    expect(thread).not.toContain("clearActiveChat");
  });

  it("keeps a localized semantic work-surface heading without consuming layout space", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    expect(page).toContain("const { t } = await getI18n();");
    expect(page).toContain('<h1 className="sr-only">{t("metadata.title.inbox")}</h1>');
  });

  it("closes adversarial Inbox review gaps at their authority boundaries", () => {
    const queue = read("src/components/inbox/inbox-v3-queue.tsx");
    const deskTypes = read("src/components/inbox/inbox-desk-types.ts");
    const header = read("src/components/inbox/inbox-v3-header.tsx");
    const panel = read("src/components/inbox/inbox-customer-work-panel.tsx");
    const collaboration = read(
      "src/components/inbox/conversation-collaboration-inline.tsx",
    );
    const contextRoute = read("src/app/api/inbox/context/[id]/route.ts");

    expect(panel).toContain(
      'key={`${chat.conversationId}:${orderCandidate.id}`}',
    );
    expect(panel).toContain('dir="ltr"');
    expect(panel).toContain("[unicode-bidi:isolate]");

    expect(contextRoute).toContain('"risk.read"');
    expect(contextRoute).toContain("const canReadRisk =");
    expect(contextRoute).toContain("risk: canReadRisk");
    expect(panel).toContain("context.fieldAccess.risk");

    expect(collaboration).toContain("useRef<AbortController | null>(null)");
    expect(collaboration).toContain("loadRequest.current?.abort()");
    expect(collaboration).toContain("signal: controller.signal");

    expect(queue).toContain("function matchesDeskFilters(");
    expect(queue).toContain("searchState.results.filter((chat) =>");
    expect(queue).toContain(
      "matchesDeskFilters(chat, queueFilter, workflowFilter, currentMemberId)",
    );
    expect(deskTypes).toContain("id: transportId ?? result.id");
    expect(deskTypes).toContain("...(transportId ? { transportId } : {})");
    expect(header).toContain('if (transport.status === "connected" && transport.wsOpen)');
    expect(header).toContain('copy("transportConnected")');
  });
});
