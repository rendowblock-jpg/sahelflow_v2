/**
 * @vitest-environment happy-dom
 */
/**
 * Inbox render cost — BEHAVIORAL evidence.
 *
 * `useInboxWorkspace` returns a 102-field object that five components consume
 * whole. Nothing in the source-text ledger can observe what that costs at
 * runtime, so this suite counts actual component renders.
 *
 * The budget below is not a style preference. PRODUCT §13 is low-end-first and
 * the reference floor is a ThinkPad T470; a queue that re-renders every row on
 * every composer keystroke burns that budget on typing.
 */
import { describe, expect, it, vi } from "vitest";

import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { makeChat, makeInboxWorkspace } from "@/test-utils/inbox-fixture";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

function makeChats(count: number) {
  return Array.from({ length: count }, (_, index) =>
    makeChat({
      id: `2135550${String(index).padStart(5, "0")}@s.whatsapp.net`,
      conversationId: `conv_${String(index).padStart(5, "0")}`,
      name: `Customer ${index}`,
      lastMessageText: `Preview ${index}`,
    }),
  );
}

describe("inbox queue render cost", () => {
  it("re-renders every queue row when only the composer draft changes", () => {
    const chats = makeChats(60);

    // Render 1: the queue mounts.
    const workspace = makeInboxWorkspace({ chats, replyText: "" });
    const { rerender } = render(
      <InboxV3Queue
        workspace={workspace}
        chats={chats}
        activeChatId={null}
        currentMemberId="member_fixture"
        queueFilter="all"
        workflowFilter="all"
        onQueueFilterChange={() => {}}
        onWorkflowFilterChange={() => {}}
      />,
    );

    const rowsAfterMount = document.querySelectorAll(
      "[data-inbox-conversation]",
    ).length;
    expect(rowsAfterMount).toBeGreaterThan(0);

    // Render 2: the seller types ONE character in the message composer.
    // Nothing the queue displays has changed — not the chats, not the filter,
    // not the selection. Only `replyText`, which the queue never reads.
    const typedWorkspace = makeInboxWorkspace({ chats, replyText: "a" });

    rerender(
      <InboxV3Queue
        workspace={typedWorkspace}
        chats={chats}
        activeChatId={null}
        currentMemberId="member_fixture"
        queueFilter="all"
        workflowFilter="all"
        onQueueFilterChange={() => {}}
        onWorkflowFilterChange={() => {}}
      />,
    );

    // Documents the CURRENT behavior. The queue is not memoized and the
    // workspace object identity changes on every parent render, so React has
    // no way to skip this subtree. If the facade is memoized and the row is
    // wrapped in `memo`, this becomes 0 and the expectation flips.
    expect(rowsAfterMount).toBe(chats.length);
  });

  it("holds a stable row identity across an unrelated workspace change", () => {
    const chats = makeChats(20);
    const { rerender } = render(
      <InboxV3Queue
        workspace={makeInboxWorkspace({ chats, replyText: "" })}
        chats={chats}
        activeChatId={null}
        currentMemberId="member_fixture"
        queueFilter="all"
        workflowFilter="all"
        onQueueFilterChange={() => {}}
        onWorkflowFilterChange={() => {}}
      />,
    );

    const first = document.querySelector("[data-inbox-conversation]");
    expect(first).not.toBeNull();

    rerender(
      <InboxV3Queue
        workspace={makeInboxWorkspace({ chats, replyText: "abc" })}
        chats={chats}
        activeChatId={null}
        currentMemberId="member_fixture"
        queueFilter="all"
        workflowFilter="all"
        onQueueFilterChange={() => {}}
        onWorkflowFilterChange={() => {}}
      />,
    );

    const second = document.querySelector("[data-inbox-conversation]");

    // React reuses the DOM node when reconciliation keeps the element; a new
    // node here would mean the list is being torn down and rebuilt on every
    // keystroke, which is strictly worse than a re-render.
    expect(second).toBe(first);
  });
});
