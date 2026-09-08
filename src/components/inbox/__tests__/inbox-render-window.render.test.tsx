/**
 * @vitest-environment happy-dom
 */
/**
 * INB-11 render window — BEHAVIORAL evidence.
 *
 * The sibling `inbox-render-window-contract.test.ts` asserts that the strings
 * `RENDER_WINDOW_INITIAL = 80`, `IntersectionObserver` and
 * `messages.slice(visibleStart)` appear in the thread source. That is a
 * spelling check: pinning `visibleStart = 0` disables virtualization entirely
 * and every one of those assertions still passes.
 *
 * These tests count the message elements the component actually commits to the
 * DOM. They fail when the feature is broken, and they survive a rename.
 */
import { describe, expect, it, vi } from "vitest";

import { InboxV3Thread } from "@/components/inbox/inbox-v3-thread";
import {
  makeInboxWorkspace,
  makeThread,
} from "@/test-utils/inbox-fixture";
import { render, screen, triggerIntersection } from "@/test-utils/render";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));

// The thread's status control reaches `useI18n` → `useRouter`. Outside the App
// Router runtime that invariant throws, so the navigation surface is stubbed.
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

const RENDER_WINDOW_INITIAL = 80;
const RENDER_WINDOW_STEP = 60;

function renderThread(messageCount: number) {
  const workspace = makeInboxWorkspace({ messages: makeThread(messageCount) });
  return render(
    <InboxV3Thread
      workspace={workspace}
      selectedCandidate={null}
      onBackToQueue={() => {}}
      onSelectCandidate={() => {}}
    />,
  );
}

/**
 * Count committed message rows. The thread tags each rendered message with its
 * canonical id, which is the same identity the projection and quote-jump paths
 * use — so this counts real materialization, not a test-only marker.
 */
function committedMessageCount(): number {
  return document.querySelectorAll("[data-message-id]").length;
}

describe("inbox thread render window — behavior (INB-11)", () => {
  it("materializes every message when the thread is smaller than the window", () => {
    renderThread(12);
    expect(committedMessageCount()).toBe(12);
  });

  it("commits ONLY the window for a thread larger than the initial window", () => {
    const total = 400;
    renderThread(total);

    const committed = committedMessageCount();

    // The load-bearing assertion: the DOM must not hold the whole thread.
    expect(committed).toBeLessThan(total);
    expect(committed).toBe(RENDER_WINDOW_INITIAL);
  });

  it("keeps the NEWEST messages — the window is bottom-anchored", () => {
    renderThread(400);

    // WhatsApp opens at the reading position: the tail, never the head.
    expect(screen.getByText("Message number 399")).toBeInTheDocument();
    expect(screen.queryByText("Message number 0")).not.toBeInTheDocument();
  });

  it("grows by one step when the top sentinel enters the viewport", () => {
    renderThread(400);
    expect(committedMessageCount()).toBe(RENDER_WINDOW_INITIAL);

    triggerIntersection(true);

    expect(committedMessageCount()).toBe(
      RENDER_WINDOW_INITIAL + RENDER_WINDOW_STEP,
    );
  });

  it("never grows past the real thread length", () => {
    renderThread(100);
    for (let step = 0; step < 10; step += 1) {
      triggerIntersection(true);
    }
    expect(committedMessageCount()).toBe(100);
  });
});
