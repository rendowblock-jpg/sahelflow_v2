import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The inbox queue shows five pulsing rows while the chat list loads. The wrapper
 * carried an accessible name (aria-label) but no role, and ARIA forbids a name on
 * a generic element (axe rule aria-prohibited-attr, serious). The CI browser sweep
 * (axe on every route and language) caught it on /inbox right after load.
 * Fix: the wrapper is a status region, which may carry a name.
 */
describe("inbox queue loading skeleton accessible name", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/inbox/inbox-v3-queue.tsx"),
    "utf8",
  );

  it("names the loading skeleton only on an element that has a role", () => {
    const at = source.indexOf('aria-label={t("common.loading")}');
    expect(at).toBeGreaterThan(-1);
    const openTagStart = source.lastIndexOf("<div", at);
    const openTagEnd = source.indexOf(">", at);
    const openTag = source.slice(openTagStart, openTagEnd + 1);
    expect(openTag).toContain('role="status"');
  });

  it("has no aria-label on a bare div in the queue file", () => {
    const bare = /<div\b(?![^>]*\brole=)[^>]*\baria-label=/g;
    expect(source.match(bare) ?? []).toEqual([]);
  });
});
