/**
 * @vitest-environment happy-dom
 */
/**
 * A tab list that wraps onto several lines must grow with its lines.
 *
 * The list carries `group-data-[orientation=horizontal]/tabs:h-9` (36 px). A page that
 * wrote `className="h-auto flex-wrap"` did not remove it: tailwind-merge only drops a
 * class that has the SAME modifiers, and the group-data selector is also the more
 * specific one, so the list stayed 36 px tall. At 360 px the status tabs on /orders
 * (7 tabs, 4 lines, 83 px past the list), /deliveries (25 px) and /risk (29 px) then
 * spilled onto the search box below, in English and in Arabic.
 *
 * The component now owns the switch (`wrap`), so a page cannot get it wrong, and a
 * source guard keeps the broken spelling out of every page.
 *
 * First browser run of the fix (Arabic, 1366 px): with the list on `h-auto` the tabs
 * lost their parent's definite height, `h-[calc(100%-1px)]` fell back to the content, and
 * Arabic's taller line box (23.2 px against 20 px) made the one-line list 39.2 px instead
 * of 36 and the tab 33.2 instead of 29. Nothing was wrong in the old one-line look, so
 * a wrapping list keeps a 36 px floor (`min-h-9`) and its tabs keep the 29 px they had
 * inside the fixed list (`data-wrap` + a group-data height on the trigger).
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

function list(props: { wrap?: boolean; className?: string }) {
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

describe("TabsList wrap", () => {
  it("lets the list grow: the fixed 36 px height is gone and replaced by auto under the same modifier", () => {
    const classes = classesOf(list({ wrap: true }));
    expect(classes).toContain("flex-wrap");
    expect(classes).toContain(AUTO_HEIGHT);
    expect(classes).not.toContain(FIXED_HEIGHT);
  });

  it("keeps a 36 px floor so a one-line list looks exactly as before", () => {
    expect(classesOf(list({ wrap: true }))).toContain("min-h-9");
    cleanup();
    expect(classesOf(list({}))).not.toContain("min-h-9");
  });

  it("marks a wrapping list, and only that one, so its tabs can keep their old height", () => {
    expect(list({ wrap: true }).getAttribute("data-wrap")).toBe("true");
    cleanup();
    expect(list({}).getAttribute("data-wrap")).toBeNull();
  });

  it("gives the tabs of a wrapping list the 29 px they had inside the fixed 36 px list (not the content height)", () => {
    list({ wrap: true });
    for (const tab of screen.getAllByRole("tab")) {
      expect(classesOf(tab)).toContain("group-data-[wrap=true]/tabs-list:h-[calc(2.25rem-7px)]");
    }
  });

  it("puts a small gap between wrapped lines so two lines do not touch", () => {
    expect(classesOf(list({ wrap: true }))).toContain("gap-y-0.5");
  });

  it("keeps the one-line list at 36 px and without wrapping", () => {
    const classes = classesOf(list({}));
    expect(classes).toContain(FIXED_HEIGHT);
    expect(classes).not.toContain("flex-wrap");
    expect(classes).not.toContain(AUTO_HEIGHT);
  });

  it("still takes extra classes from the page", () => {
    expect(classesOf(list({ wrap: true, className: "w-full lg:w-auto" }))).toEqual(
      expect.arrayContaining(["w-full", "lg:w-auto", "flex-wrap"])
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

describe("no page overrides the list height by class", () => {
  const root = join(process.cwd(), "src");
  const tags = sourceFiles(root).flatMap((file) =>
    openingTags(readFileSync(file, "utf8")).map((tag) => ({ file: file.slice(root.length + 1), tag }))
  );

  it("finds the tab lists the pages use (the scan itself works)", () => {
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.some((t) => t.tag.includes("[&>[data-slot=tabs-trigger]]"))).toBe(true);
  });

  it("no <TabsList> writes h-auto or flex-wrap in className: it must pass wrap", () => {
    const bad = tags.filter((t) => /(^|[\s"'`])(h-auto|flex-wrap)(?=[\s"'`])/.test(t.tag));
    expect(bad.map((t) => `${t.file}: ${t.tag.replace(/\s+/g, " ").slice(0, 110)}`)).toEqual([]);
  });

  // 31 Oct 2026 (w204): the Orders page asks through components/orders/orders-status-tabs-list.tsx (wrap off a phone, scroll on a phone), not with a TabsList of its own.
  it.each(["components/orders/orders-status-tabs-list.tsx", "app/(dashboard)/deliveries/page.tsx", "components/risk/risk-view.tsx"])(
    "%s asks for wrap",
    (rel) => {
      const mine = tags.filter((t) => t.file === rel);
      expect(mine.length).toBeGreaterThan(0);
      for (const t of mine) expect(t.tag).toMatch(/\swrap(\s|=|>|\/)/);
    }
  );
});
