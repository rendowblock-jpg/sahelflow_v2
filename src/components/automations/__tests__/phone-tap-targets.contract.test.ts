import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 lane tapb (Internal.50): the automation builder and list on a 390 px phone. The sweep
 * measured 'Insert a step here' / 'Add step' at 28 px, the step card buttons at 28 px, the
 * Back link and the name field at 36 px (the name field only 27-80 px wide because the one-row
 * top bar squeezed it), the filter pills at 32 px and the workspace tabs at 29-31 px. Every
 * fix is phone-only (`max-sm:`) so the desktop canvas does not change.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("automation flow canvas: phone tap targets", () => {
  const source = read("components/automations/flow/flow-canvas.tsx");

  it("the + (insert / add step) button is 44 px on a phone and its icon grows with it", () => {
    expect(source).toMatch(/relative z-10 flex size-7 max-sm:size-11 items-center justify-center rounded-full border/);
    expect(source).toContain('<Plus className="size-3.5 max-sm:size-5"');
  });

  it("the connector is tall enough for the 44 px + button", () => {
    expect(source).toMatch(/relative flex h-12 max-sm:h-14 w-full/);
  });

  it("the step card icon buttons (move, duplicate, delete) are 44 px on a phone", () => {
    expect(source).toMatch(/"flex size-7 max-sm:size-11 items-center justify-center rounded-\[calc/);
  });
});

describe("automation builder top bar: phone tap targets", () => {
  const source = read("components/automations/automation-builder.tsx");

  it("wraps on a phone so the name field gets a full row", () => {
    expect(source).toMatch(/<header className="flex h-14 max-sm:h-auto max-sm:flex-wrap/);
    expect(source).toContain("max-sm:order-last max-sm:basis-full");
  });

  it("Back, the name field, the active toggle row, Save and the issues chip are 44 px on a phone", () => {
    expect(source).toMatch(/flex size-9 max-sm:size-11 max-sm:me-auto/);
    expect(source).toMatch(/"h-9 max-sm:h-11 max-sm:order-last[^"]*max-sm:text-base/);
    expect(source).toMatch(/<label className="flex h-9 max-sm:h-11 shrink-0 cursor-pointer/);
    expect(source).toMatch(/inline-flex h-9 max-sm:h-11 shrink-0 items-center gap-2 rounded-control bg-primary/);
    expect(source).toContain("bg-destructive-subtle px-2 py-1 max-sm:min-h-11 max-sm:min-w-11");
  });

  it("the 'Connect WhatsApp' link is a 44 px target on a phone", () => {
    expect(source).toContain("hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center");
  });
});

describe("automation list and tabs: phone tap targets", () => {
  it("filter pills and the search field are 44 px on a phone", () => {
    const source = read("components/automations/automations-list-client.tsx");
    expect(source).toContain("flex h-8 max-sm:h-11 max-sm:px-2 items-center");
    expect(source).toContain('className="ps-9 max-sm:h-11"');
  });

  it("the three workspace tabs are 44 px on a phone", () => {
    const source = read("app/(dashboard)/automations/page.tsx");
    for (const tab of ["my", "templates", "activity"]) {
      expect(source).toContain(`<TabsTrigger value="${tab}" asChild className="max-sm:min-h-11">`);
    }
  });
});
