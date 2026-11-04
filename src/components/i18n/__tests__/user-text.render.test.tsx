/**
 * @vitest-environment happy-dom
 */
/**
 * Arabic data inside an ENGLISH (or French) heading.
 *
 * The h1/h2 base style carries `tracking-tight` (-0.02em), the type ramp tokens carry
 * `--text-display--letter-spacing` and friends. Arabic is a connected script: any
 * non-zero letter-spacing pulls the joined letters apart. The Arabic UI resets it for
 * `dir=rtl`; a customer, product, store or automation NAME in Arabic shown in the English
 * UI inherited -0.48px (headings), -1.2px (store hero) and broke the joins (sweep1, 52 hits).
 *
 * Rule under test: every run of Arabic script that a component draws as DATA is tagged
 * `lang="ar"` by `UserText`, and the stylesheet gives `[lang|="ar"]` letter-spacing: normal
 * whatever the page language. Latin text keeps the heading tracking (no regression).
 *
 * The stylesheet used here is the REAL rule block of arabic-system.css (between the
 * sf:arabic-letter-spacing markers) plus the one declaration the Tailwind base layer
 * compiles to for h1/h2 (`tracking-tight` = the --tracking-tight token, -0.02em).
 * The browser run (audit/program/ui/sweep.mjs) proves the same on the real pages.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserText } from "@/components/i18n/user-text";
import { PageHeader } from "@/components/shared/page-header";

const ARABIC_NAME = "فاطمة بلحاج";
const MIXED_NAME = "Parfum oud édition limitée عطر العود الفاخر";

function realRuleBlock(): string {
  const css = readFileSync(resolve(process.cwd(), "src/app/arabic-system.css"), "utf8");
  const start = css.indexOf("/* sf:arabic-letter-spacing:start */");
  const end = css.indexOf("/* sf:arabic-letter-spacing:end */");
  if (start < 0 || end < start) throw new Error("arabic-system.css has no sf:arabic-letter-spacing block");
  // happy-dom does not implement the `normal` keyword for letter-spacing (it behaves like `inherit`),
  // so the keyword is mapped to its value, 0px. Chromium's computed `normal` is proven by the sweep.
  return css.slice(start, end).replace(/letter-spacing:\s*normal/g, "letter-spacing: 0px");
}

let style: HTMLStyleElement;

beforeEach(() => {
  document.documentElement.setAttribute("lang", "en");
  document.documentElement.setAttribute("dir", "ltr");
  style = document.createElement("style");
  // The base layer's `h1, h2 { tracking-tight }`, compiled: -0.02em.
  style.textContent = `h1, h2 { letter-spacing: -0.02em; }\n${realRuleBlock()}`;
  document.head.appendChild(style);
});

afterEach(() => {
  cleanup();
  style.remove();
});

const spacing = (el: Element | null) => (el ? getComputedStyle(el).letterSpacing : "missing");
// happy-dom resolves -0.02em against a 16px font (-0.32px); a real browser resolves it per element.
const isTracked = (el: Element | null) => Number.parseFloat(spacing(el)) < 0;
const isFree = (el: Element | null) => Number.parseFloat(spacing(el)) === 0;

describe("UserText", () => {
  it("returns Latin text untouched: no wrapper, the heading keeps its tracking", () => {
    const { container } = render(<h1>Customer: <UserText text="Walid Brahimi" /></h1>);
    expect(container.querySelector("[lang]")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Customer: Walid Brahimi");
    expect(isTracked(container.querySelector("h1"))).toBe(true);
  });

  it("tags an Arabic name lang=ar and the same text reads back unchanged", () => {
    const { container } = render(<h1><UserText text={ARABIC_NAME} /></h1>);
    const run = container.querySelector('[lang="ar"]');
    expect(run?.textContent).toBe(ARABIC_NAME);
    expect(container.querySelector("h1")?.textContent).toBe(ARABIC_NAME);
  });

  it("tags only the Arabic runs of a mixed name; the Latin part keeps the tracking", () => {
    const { container } = render(<h1 id="h"><UserText text={MIXED_NAME} /></h1>);
    const h1 = container.querySelector("h1");
    expect(h1?.textContent).toBe(MIXED_NAME);
    const runs = [...container.querySelectorAll('[lang="ar"]')];
    expect(runs.map((r) => r.textContent).join(" ")).toBe("عطر العود الفاخر");
    expect(isTracked(h1)).toBe(true);
    for (const run of runs) expect(isFree(run)).toBe(true);
  });

  it("tags Arabic-Indic digits too (the sweep counts any Arabic-block character)", () => {
    const { container } = render(<h2><UserText text="٠٥٥٥ ١٢ ٣٤" /></h2>);
    expect(container.querySelector('[lang="ar"]')?.textContent).toBe("٠٥٥٥ ١٢ ٣٤");
  });
});

describe("Arabic data in the English UI (html lang=en)", () => {
  it("PageHeader title: an Arabic customer name is not letter-spaced, the Latin title is", () => {
    const arabic = render(<PageHeader title={ARABIC_NAME} />);
    const run = arabic.container.querySelector('h1 [lang="ar"]');
    expect(run).not.toBeNull();
    expect(isTracked(arabic.container.querySelector("h1"))).toBe(true); // the heading itself is unchanged
    expect(isFree(run)).toBe(true); // the Arabic is not
    cleanup();

    const latin = render(<PageHeader title="Customers" />);
    expect(latin.container.querySelector("h1 [lang]")).toBeNull();
    expect(isTracked(latin.container.querySelector("h1"))).toBe(true);
  });

  it("PageHeader title: a mixed Latin + Arabic product name only frees the Arabic run", () => {
    const { container } = render(<PageHeader title={MIXED_NAME} />);
    expect(container.querySelector("h1")?.textContent).toBe(MIXED_NAME);
    const runs = [...container.querySelectorAll('h1 [lang="ar"]')];
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(isFree(run)).toBe(true);
  });

  it("a bidi-isolated bdi that already wraps the name is covered when its Arabic is tagged", () => {
    const { container } = render(
      <h1 className="sr-only">Edit: <bdi><UserText text="Automatisation très longue أحمد" /></bdi></h1>,
    );
    for (const run of container.querySelectorAll('[lang="ar"]')) expect(isFree(run)).toBe(true);
    expect(container.querySelectorAll('[lang="ar"]').length).toBe(1);
  });
});
