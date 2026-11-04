import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 lane tapb (Internal.50), pages outside the shared workspace rule: on a 390 px phone every
 * link, button, field and focusable control measures at least 40x40 css px (sweep rule in
 * audit/program/ui/sweep-lib.mjs). The sign-in pages, the onboarding wizard and the chart
 * scrubber are not reached by the zero-specificity block in responsive-system.css, so they carry
 * their own phone-only (`max-sm:`) sizes. Desktop must not change.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), "src/components", path), "utf8");

describe("sign-in pages and onboarding: phone tap targets", () => {
  it("EntryShell (login, setup, join) raises the shared control height to 44 px on a phone", () => {
    expect(read("system/entry-shell.tsx")).toMatch(/<main[\s\S]{0,200}max-sm:\[--control-height:2\.75rem\]/);
  });

  it("the narrow onboarding step strip has 44 px buttons on a phone", () => {
    const source = read("onboarding/onboarding-checklist.tsx");
    const strip = source.slice(source.indexOf("Narrow-screen marker strip"));
    // A button's opening tag ends on its own line (`>`), not at the `=>` of an onClick arrow function.
    const buttons = strip.match(/<button[\s\S]*?\n\s*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button).toContain("max-sm:size-11");
      expect(button).toContain("max-sm:inline-flex");
    }
  });
});

describe("chart scrubber: phone tap target", () => {
  it("the interactive sparkline slider is at least 40 px tall on a phone and keeps its drawing height inside", () => {
    const source = read("charts/sparkline.tsx");
    expect(source).toMatch(/role="slider"[\s\S]{0,700}max-sm:min-h-10/);
    expect(source).toMatch(/<div className="relative w-full" style=\{\{ height \}\}>/);
  });
});
