import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The skip link is `sr-only` (position: absolute, margin -1px). Without a positioned ancestor
 * the shell's `overflow-hidden` does not clip it, so it sat 1 px left of the page. In an RTL
 * page, content left of the origin is scrollable: /profile and /settings in Arabic scrolled
 * sideways by 1 px (sweep of 24 Oct, overflow culprit list). The shell must be the containing
 * block (`relative`) so its own `overflow-hidden` clips the link. jsdom has no layout; the proof
 * is the browser sweep of /profile, /settings and /dashboard in Arabic.
 */
describe("dashboard shell clips its absolutely positioned screen-reader text", () => {
  it("is a positioned box that hides overflow", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/layout/dashboard-layout.tsx"), "utf8").replace(/\r\n?/g, "\n");
    const match = /<div\s+dir=\{dir\}\s+className="([^"]+)"\s+data-sahelflow-shell="desktop"/.exec(source);
    const classes = (match?.[1] ?? "").split(/\s+/);
    expect(match, "the shell div was not found").not.toBeNull();
    expect(classes).toContain("overflow-hidden");
    expect(classes).toContain("relative");
  });
});
