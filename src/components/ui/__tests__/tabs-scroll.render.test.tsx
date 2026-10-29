/**
 * @vitest-environment happy-dom
 */
/**
 * A tab list whose tabs do not fit must scroll, and its active-tab underline must stay visible.
 *
 * Measured in Chromium on the seeded app (360 and 1366 px, a mouse and a finger):
 *  - /automations: the line list is `overflow: visible` and the page around it clips sideways, so at
 *    360 px the Activity tab is cut off (67 percent visible in English, 46 in French at 360 px, 5 at
 *    320) and a swipe does not move it. Arabic fits at 360 px but not at 320.
 *  - /storefronts: the list scrolls, but its underline is clipped by its own scroll box. The underline
 *    is drawn 5 px under the tab; a scroll box clips at its padding edge, which is 1 px above the
 *    list border. With a mouse (28 px tabs) 1 of its 2 pixel rows survives. With a finger a Radix tab
 *    is a <button>, and globals.css makes every button at least 44 px tall on a coarse pointer, so the
 *    tab pokes out of the 36 px list and the underline is outside the box: 0 of 2 rows.
 *
 * The component now owns all of it (`scroll`): the list scrolls sideways, grows to the height of its
 * tabs instead of fixing 36 px, keeps a 36 px floor, and leaves 4 px under the tabs for the underline;
 * the tabs do not shrink and keep their 28 px on a mouse. A page asks with the prop, never by class,
 * and a source guard makes a line list without it impossible.
 */
import { cleanup, screen } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { render } from "@/test-utils/render";

afterEach(cleanup);

const FIXED_HEIGHT = "group-data-[orientation=horizontal]/tabs:h-9";
const AUTO_HEIGHT = "group-data-[orientation=horizontal]/tabs:h-auto";

function list(props: { scroll?: boolean; variant?: "line" | "default"; className?: string }) {
  render(
    <Tabs defaultValue="a">
      <TabsList {...props}>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return screen.getByRole("tablist");
}

function classesOf(el: HTMLElement): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

describe("TabsList scroll", () => {
  it("scrolls sideways and never up or down", () => {
    const classes = classesOf(list({ scroll: true, variant: "line" }));
    expect(classes).toContain("overflow-x-auto");
    expect(classes).toContain("overflow-y-hidden");
  });

  it("grows to the height of its tabs: the fixed 36 px is replaced by auto under the same modifier", () => {
    const classes = classesOf(list({ scroll: true, variant: "line" }));
    expect(classes).toContain(AUTO_HEIGHT);
    expect(classes).not.toContain(FIXED_HEIGHT);
  });

  it("keeps a 36 px floor so a one-line list looks as before", () => {
    expect(classesOf(list({ scroll: true, variant: "line" }))).toContain("min-h-9");
  });

  it("leaves 4 px under the tabs for the active-tab underline, which is drawn 5 px below the tab", () => {
    expect(classesOf(list({ scroll: true, variant: "line" }))).toContain("pb-1");
  });

  it("marks a scrolling list, and only that one, so its tabs can keep their size", () => {
    expect(list({ scroll: true, variant: "line" }).getAttribute("data-scroll")).toBe("true");
    cleanup();
    expect(list({ variant: "line" }).getAttribute("data-scroll")).toBeNull();
  });

  it("gives the tabs of a scrolling list 28 px on a mouse and stops them shrinking", () => {
    list({ scroll: true, variant: "line" });
    for (const tab of screen.getAllByRole("tab")) {
      const classes = classesOf(tab);
      expect(classes).toContain("group-data-[scroll=true]/tabs-list:h-7");
      expect(classes).toContain("group-data-[scroll=true]/tabs-list:flex-none");
    }
  });

  it("changes nothing for a list without the prop", () => {
    const classes = classesOf(list({ variant: "line" }));
    expect(classes).toContain(FIXED_HEIGHT);
    for (const unwanted of ["overflow-x-auto", "overflow-y-hidden", "min-h-9", "pb-1", AUTO_HEIGHT]) {
      expect(classes).not.toContain(unwanted);
    }
  });

  it("still takes extra classes from the page", () => {
    expect(classesOf(list({ scroll: true, variant: "line", className: "w-full justify-start border-b" }))).toEqual(
      expect.arrayContaining(["w-full", "justify-start", "border-b", "overflow-x-auto"])
    );
  });
});

/** The text of every `<TabsList ...>` opening tag; skips `>` inside quotes or braces. */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  let from = source.indexOf("<TabsList");
  while (from !== -1) {
    let depth = 0;
    let quote = "";
    let end = from;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(from, end + 1));
    from = source.indexOf("<TabsList", end);
  }
  return tags;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe("no page decides the scrolling of a tab list by class", () => {
  const root = join(process.cwd(), "src");
  const tags = sourceFiles(root).flatMap((file) =>
    openingTags(readFileSync(file, "utf8")).map((tag) => ({ file: file.slice(root.length + 1), tag }))
  );
  const lineLists = tags.filter((t) => /variant=["']line["']/.test(t.tag));

  it("finds the line lists the pages use (the scan itself works)", () => {
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(lineLists.map((t) => t.file).sort()).toEqual([
      "app/(dashboard)/automations/page.tsx",
      "app/(dashboard)/storefronts/page.tsx",
    ]);
  });

  it("every line list passes scroll", () => {
    const missing = lineLists.filter((t) => !/\sscroll(\s|=|>|\/)/.test(t.tag));
    expect(missing.map((t) => `${t.file}: ${t.tag.replace(/\s+/g, " ").slice(0, 110)}`)).toEqual([]);
  });

  it("no <TabsList> writes an overflow class in className: scroll owns it", () => {
    const bad = tags.filter((t) => /(^|[\s"'`])overflow-(x-|y-)?(auto|scroll|hidden|visible|clip)(?=[\s"'`])/.test(t.tag));
    expect(bad.map((t) => `${t.file}: ${t.tag.replace(/\s+/g, " ").slice(0, 110)}`)).toEqual([]);
  });
});
