import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 lane tapb (Internal.50): on a 390 px phone every link/button/input/select of the public
 * store and of the store builder must have a hit rectangle of at least 40x40 css px (sweep rule
 * in audit/program/ui/sweep-lib.mjs). The sweep measured the public store inputs at 36 px
 * (var(--control-height) = 2.25rem outside the dashboard layout), the logo link at 36 px, the
 * builder's top-bar icon buttons at 36 px and the preview's own links at 22x10 px (scaled). The
 * fixes are phone-only (`max-sm:`): desktop must not change.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), "src/components/storefront", path), "utf8");

describe("public store: phone tap targets", () => {
  it("the hosted store root raises the shared control height to 44 px on a phone", () => {
    expect(read("storefront-view.tsx")).toMatch(/data-storefront-root="true"[\s\S]{0,200}max-sm:\[--control-height:2\.75rem\]/);
  });

  it("both landing-page <main> roots raise the shared control height to 44 px on a phone", () => {
    const source = read("landing-page-view.tsx");
    const mains = source.match(/<main className="[^"]*"/g) ?? [];
    expect(mains.length).toBeGreaterThanOrEqual(2);
    for (const main of mains) expect(main).toContain("max-sm:[--control-height:2.75rem]");
  });

  it("landing-page native selects are 44 px high with a 16 px font on a phone", () => {
    const source = read("landing-page-view.tsx");
    const selects = source.match(/<select[\s\S]*?<\/select>/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    for (const select of selects) {
      expect(select).toContain("max-sm:h-11");
      expect(select).toContain("max-sm:text-base");
    }
  });

  it("checkout native selects have a 16 px font on a phone (no iOS zoom)", () => {
    const source = read("storefront-view.tsx");
    const selects = source.match(/<select[\s\S]*?<\/select>/g) ?? [];
    expect(selects.length).toBeGreaterThanOrEqual(3);
    for (const select of selects) expect(select).toContain("max-sm:text-base");
  });

  it("the header logo link is at least 44 px high", () => {
    const source = read("storefront-parts.tsx");
    expect(source).toMatch(/<a href="#" className="[^"]*min-h-11[^"]*"/);
  });

  it("the header section links stay 44 px high when they show", () => {
    const source = read("storefront-parts.tsx");
    const links = source.match(/<a href="#storefront-(catalog|contact)" className="[^"]*"/g) ?? [];
    expect(links.length).toBe(2);
    for (const link of links) expect(link).toContain("min-h-11");
  });

  it("the remove-from-cart button is a 44 px target on a phone", () => {
    expect(read("storefront-view.tsx")).toMatch(/variant="ghost" className="h-8 w-8 max-sm:h-11 max-sm:w-11 text-destructive"/);
  });
});

describe("store builder: phone tap targets", () => {
  it("the studio preview page never takes the pointer for its own links, buttons and fields on a phone", () => {
    const source = read("studio/studio-canvas.tsx");
    for (const tag of ["a", "button", "input", "select", "textarea"]) {
      expect(source).toContain(`max-sm:[&_${tag}]:pointer-events-none`);
    }
  });

  it("the top bar icon buttons and the publish button are 44 px on a phone", () => {
    const source = read("studio/studio-top-bar.tsx");
    expect((source.match(/max-sm:size-11/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("max-sm:h-11");
  });

  it("the rail buttons keep a 44 px floor in width and height under md", () => {
    const source = read("studio/studio-rail.tsx");
    expect(source).toContain("max-md:min-h-11");
    // 56 px (min-w-14), not 44 px (min-w-11): with eight entries the French labels need it (see studio-rail-phone-fit.test.ts); still above the floor.
    expect(source).toContain("max-md:min-w-14");
  });

  it("the conflict-notice buttons are 44 px high on a phone", () => {
    const source = read("studio/storefront-studio.tsx");
    expect((source.match(/h-8 max-sm:h-11 rounded-control/g) ?? []).length).toBe(2);
  });
});
