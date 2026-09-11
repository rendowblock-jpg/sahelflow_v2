/**
 * @vitest-environment happy-dom
 */
/**
 * AI canvas keyboard surface (Ledger AI-22) — BEHAVIORAL evidence.
 *
 * STR-01 extracted this window-level `keydown` handler out of
 * `ai-decision-canvas.tsx`. It was the only large block in that file no
 * contract test read — which made it the safe cut, and also left the AI-22
 * shortcut ledger with zero evidence of any kind.
 *
 * Per TEST-01, a rebuilt surface owes behaviour rather than spelling. A
 * `toContain("event.key === \"Escape\"")` assertion would pass on a handler
 * that was never registered, that read a stale session index, or that stopped
 * a stream while the seller was mid-edit. These tests fire real events at a
 * real DOM and assert what the seller experiences.
 *
 * Two of them cover orderings that source text cannot observe at all:
 *
 *   1. when the seller is editing a message AND a stream is running, Escape
 *      must cancel the edit and leave the stream alone — the handler returns
 *      after `cancelEditMessage`, so the two branches are mutually exclusive;
 *   2. when a Radix sheet or dialog is open it owns Escape, so the canvas must
 *      not also stop the stream behind it.
 *
 * The workspace is a stub cast at the boundary: this hook consumes eleven
 * fields of `useAiWorkspace` and nothing else, so constructing the real hook
 * (41KB, network + streaming) would test the harness instead of the handler.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAiCanvasShortcuts } from "@/hooks/use-ai-canvas-shortcuts";
import { fireEvent, renderHook } from "@/test-utils/render";

const SESSIONS = [{ id: "session_1" }, { id: "session_2" }, { id: "session_3" }];

function makeWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    activeSessionId: "session_2",
    approveProposal: vi.fn().mockResolvedValue(true),
    cancelEditMessage: vi.fn(),
    editingMessageId: null,
    inbox: [],
    proposals: [],
    selectSession: vi.fn(),
    sending: false,
    sessions: SESSIONS,
    stop: vi.fn(),
    ...overrides,
  };
}

/**
 * Mounts the hook with a real textarea as the composer handle, mirroring the
 * canvas: the ref is owned by the caller and passed in, never recreated here.
 */
function mount(workspace: ReturnType<typeof makeWorkspace>) {
  const composer = document.createElement("textarea");
  document.body.appendChild(composer);
  const composerRef = { current: composer };

  renderHook(() =>
    useAiCanvasShortcuts({
      workspace: workspace as never,
      composerRef,
    }),
  );

  return composer;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AI canvas keyboard surface (AI-22)", () => {
  it("focuses the composer on '/' so the seller can type without reaching for the mouse", () => {
    const workspace = makeWorkspace();
    const composer = mount(workspace);

    expect(document.activeElement).not.toBe(composer);

    fireEvent.keyDown(document.body, { key: "/" });

    expect(document.activeElement).toBe(composer);
  });

  it("leaves '/' to the field the seller is already typing in", () => {
    const workspace = makeWorkspace();
    const composer = mount(workspace);

    const search = document.createElement("input");
    document.body.appendChild(search);
    search.focus();

    fireEvent.keyDown(search, { key: "/" });

    // Stealing focus here would swallow a literal slash out of a search box.
    expect(document.activeElement).toBe(search);
    expect(document.activeElement).not.toBe(composer);
  });

  it("does not hijack '/' when it is part of a chord", () => {
    const workspace = makeWorkspace();
    const composer = mount(workspace);

    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "/", metaKey: true });

    expect(document.activeElement).not.toBe(composer);
  });

  it("stops an active stream on Escape", () => {
    const workspace = makeWorkspace({ sending: true });
    mount(workspace);

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(workspace.stop).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-progress edit on Escape and leaves the stream running", () => {
    // Both conditions true at once. Source text cannot show which wins.
    const workspace = makeWorkspace({
      editingMessageId: "message_9",
      sending: true,
    });
    mount(workspace);

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(workspace.cancelEditMessage).toHaveBeenCalledTimes(1);
    expect(workspace.stop).not.toHaveBeenCalled();
  });

  it("defers Escape to an open dialog instead of stopping the stream behind it", () => {
    const workspace = makeWorkspace({ sending: true });
    mount(workspace);

    // Radix renders sheets and dialogs with role="dialog" and owns Escape.
    const sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    document.body.appendChild(sheet);

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(workspace.stop).not.toHaveBeenCalled();
  });

  it("walks to the next session on Alt+ArrowDown", () => {
    const workspace = makeWorkspace();
    mount(workspace);

    fireEvent.keyDown(document.body, { key: "ArrowDown", altKey: true });

    expect(workspace.selectSession).toHaveBeenCalledWith("session_3");
  });

  it("walks to the previous session on Alt+ArrowUp", () => {
    const workspace = makeWorkspace();
    mount(workspace);

    fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });

    expect(workspace.selectSession).toHaveBeenCalledWith("session_1");
  });

  it("does not wrap around past either end of the session list", () => {
    const atLast = makeWorkspace({ activeSessionId: "session_3" });
    mount(atLast);
    fireEvent.keyDown(document.body, { key: "ArrowDown", altKey: true });
    expect(atLast.selectSession).not.toHaveBeenCalled();

    document.body.innerHTML = "";

    const atFirst = makeWorkspace({ activeSessionId: "session_1" });
    mount(atFirst);
    fireEvent.keyDown(document.body, { key: "ArrowUp", altKey: true });
    expect(atFirst.selectSession).not.toHaveBeenCalled();
  });

  it("approves the focused proposal on Ctrl+Enter", () => {
    const handle = { proposal: { id: "proposal_7" } };
    const workspace = makeWorkspace({ proposals: [handle] });
    mount(workspace);

    const card = document.createElement("div");
    card.setAttribute("data-ai-proposal-id", "proposal_7");
    card.tabIndex = 0;
    document.body.appendChild(card);
    card.focus();

    fireEvent.keyDown(card, { key: "Enter", ctrlKey: true });

    expect(workspace.approveProposal).toHaveBeenCalledWith(handle);
  });

  it("resolves a focused inbox proposal when it is not in the canvas list", () => {
    const handle = { proposal: { id: "proposal_inbox" } };
    const workspace = makeWorkspace({ proposals: [], inbox: [handle] });
    mount(workspace);

    const card = document.createElement("div");
    card.setAttribute("data-ai-proposal-id", "proposal_inbox");
    card.tabIndex = 0;
    document.body.appendChild(card);
    card.focus();

    fireEvent.keyDown(card, { key: "Enter", ctrlKey: true });

    expect(workspace.approveProposal).toHaveBeenCalledWith(handle);
  });

  it("approves nothing when Ctrl+Enter is pressed with no proposal focused", () => {
    const workspace = makeWorkspace({
      proposals: [{ proposal: { id: "proposal_7" } }],
    });
    mount(workspace);

    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    // An irreversible business mutation must never fire from an ambient chord.
    expect(workspace.approveProposal).not.toHaveBeenCalled();
  });

  it("stops listening once the canvas unmounts", () => {
    const workspace = makeWorkspace({ sending: true });
    const composer = document.createElement("textarea");
    document.body.appendChild(composer);

    const { unmount } = renderHook(() =>
      useAiCanvasShortcuts({
        workspace: workspace as never,
        composerRef: { current: composer },
      }),
    );

    unmount();
    fireEvent.keyDown(document.body, { key: "Escape" });

    // A leaked window listener would keep stopping streams from a dead canvas.
    expect(workspace.stop).not.toHaveBeenCalled();
  });
});
