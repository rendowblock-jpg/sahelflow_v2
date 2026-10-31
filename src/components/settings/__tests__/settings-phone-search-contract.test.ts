import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Settings on a phone: the search stays at the top while the list scrolls under it, and its
 * controls are 44 px on a coarse pointer. Pinned on the source because the layout is class-driven.
 */
const source = readFileSync(path.resolve(__dirname, "../settings-workspace.tsx"), "utf8");

describe("settings workspace on a phone", () => {
  it("keeps the search row stuck to the top of the scrolling list", () => {
    expect(source).toMatch(/mobile\s*\?\s*"sticky top-0 z-10 bg-background/);
  });

  it("does not turn the full-page wrapper into a scroll box (that would stop the sticky search)", () => {
    expect(source).toContain('"min-h-[calc(100dvh-9rem)] overflow-clip"');
  });

  it("gives the search field and its clear button 44 px on a coarse pointer", () => {
    expect(source).toContain("[@media(pointer:coarse)]:h-11");
    expect(source).toContain("[@media(pointer:coarse)]:size-11");
  });

  it("lets the detail pane shrink inside its column (no sideways push from a long token)", () => {
    expect(source).toMatch(/"min-w-0",\s*\n\s*mobile/);
  });
});
