import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Ledger INB-11 (residual) — render-window virtualization: the durable
 * composite-cursor page bounds what the server returns; the render window
 * bounds what the DOM materializes, bottom-anchored like the WhatsApp
 * reading position, with scroll-true anchoring on growth and full-thread
 * materialization for search/quote jumps.
 */
describe("inbox thread render window (INB-11)", () => {
  it("bottom-anchors a growing window with scroll-true anchoring", () => {
    const thread = source("src/components/inbox/inbox-v3-thread.tsx");
    const view = source("src/hooks/inbox/use-inbox-thread-view.ts");

    expect(view).toContain("RENDER_WINDOW_INITIAL = 80");
    expect(view).toContain("RENDER_WINDOW_STEP = 60");
    expect(view).toContain("const visibleMessages = useMemo(");
    expect(view).toContain("messages.slice(visibleStart)");
    // Only the window renders; the full array never reaches the DOM loop.
    expect(thread).toContain("visibleMessages.map((message, index) => {");
    expect(thread).not.toContain("{messages.map((message, index) => {");
    // The unread divider is offset into window coordinates.
    expect(thread).toContain("index + visibleStart === dividerIndex");
    // Growth is viewport-gated and re-anchors scroll by the height delta.
    expect(thread).toContain("data-inbox-render-window=\"true\"");
    expect(view).toContain("IntersectionObserver");
    expect(view).toContain(
      "top: viewport.scrollTop + (viewport.scrollHeight - anchor),",
    );
    // A conversation switch resets the window to the WhatsApp reading size.
    expect(view).toContain("setRenderWindow(RENDER_WINDOW_INITIAL);");
  });

  it("materializes hidden history for search and quote jumps", () => {
    const view = source("src/hooks/inbox/use-inbox-thread-view.ts");
    expect(view).toContain("pendingJumpRef.current = messageId;");
    expect(view).toContain("setRenderWindow(messages.length);");
    // The deferred jump completes only after the DOM commits.
    expect(view).toContain("const pending = pendingJumpRef.current;");
  });
});
