import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The rest of the Carnet site (C4): module template, claims on the security page, motion, dead code, page budgets.
const { build } = await import("../marketing/build.mjs");
const claims = await import("../marketing/src/claims.mjs");

const repo = fileURLToPath(new URL("../", import.meta.url));
const marketing = join(repo, "marketing");
const LOCALES = ["ar", "fr", "en"] as const;
const MODULE_KEYS = ["inbox", "orders", "delivery", "risk", "accounting", "automations", "storefront", "agents", "team"] as const;
let dist = "";
const read = (path: string) => readFileSync(join(dist, path), "utf8");
const stylesDir = join(marketing, "src", "styles");
const cssFiles = () => readdirSync(stylesDir).filter((f) => f.endsWith(".css")).sort();
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const allCss = () => stripComments(cssFiles().map((f) => readFileSync(join(stylesDir, f), "utf8")).join("\n"));

/** The text of every `@media/@supports ... { ... }` block whose head matches, braces balanced. */
export function atBlocks(css: string, head: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(head.source, "g");
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const open = css.indexOf("{", m.index);
    if (open < 0) break;
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    out.push(css.slice(open + 1, end));
    re.lastIndex = end;
  }
  return out;
}
export function outsideBlocks(css: string, head: RegExp): string {
  let rest = css;
  for (const b of atBlocks(css, head)) rest = rest.replace(b, "");
  return rest;
}
const NO_PREF = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/;
const REDUCE = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "sf-rest-"));
  build(dist);
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("budget.json: page heights recorded and read here", () => {
  const budget = JSON.parse(readFileSync(join(marketing, "budget.json"), "utf8")) as Record<string, { max?: number; measured?: Record<string, number> }>;
  const LIMITS: Record<string, number> = { product: 5500, module: 4500, solution: 4500, integrations: 4000, help: 4000, contact: 4000 };
  for (const [name, max] of Object.entries(LIMITS)) {
    it(`${name}: phone height budget ${max} px, measured numbers under it`, () => {
      const entry = budget.pageHeightPx as unknown as Record<string, { max?: number; measured?: Record<string, number> }> | undefined;
      const row = entry?.[name];
      expect(row?.max).toBe(max);
      for (const l of LOCALES) {
        const v = row?.measured?.[l];
        expect(typeof v).toBe("number");
        expect(v as number).toBeLessThanOrEqual(max);
      }
    });
  }
});

describe("module pages share one template", () => {
  for (const l of LOCALES) {
    for (const key of MODULE_KEYS) {
      it(`${l}/${key}: one screenshot with srcset, sizes, width, height, alt; a day line; a not-yet stamp row tied to claims`, () => {
        const html = read(`${l}/product/${key}/index.html`);
        const shots = [...html.matchAll(/<img\b[^>]*\/img\/screens\/[^>]*>/g)].map((m) => m[0]);
        expect(shots).toHaveLength(1);
        const img = shots[0] ?? "";
        for (const attr of ["srcset", "sizes", "width", "height"]) expect(img).toMatch(new RegExp(`\\s${attr}="[^"]+"`));
        expect(img).toMatch(/\salt="[^"]{3,}"/);
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html.match(/<p class="dayline" data-day>/g)).toHaveLength(1);
        const nope = /<ul class="nope">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
        const rows = [...nope.matchAll(/<li data-claim="([^"]+)" data-claim-status="([^"]+)"><span class="stamp st-([a-z]+)">/g)];
        expect(rows.length).toBeGreaterThan(0);
        for (const [, id, status, cls] of rows) {
          expect(status).toBe(cls);
          expect(status).not.toBe("live");
          expect(claims.claimById(id as string).status).toBe(status);
        }
      });
    }
  }
});

describe("security page: every stamped claim has evidence", () => {
  const NEW_IDS = ["local-first", "pin-roles", "ai-asks-first"];
  for (const l of LOCALES) {
    it(`${l}: each data-claim has a non-empty evidence field, and the three new claims are on the page`, () => {
      const html = read(`${l}/security/index.html`);
      const ids = [...html.matchAll(/data-claim="([^"]+)"/g)].map((m) => m[1] as string);
      for (const id of NEW_IDS) expect(ids).toContain(id);
      for (const id of ids) {
        const c = claims.claimById(id);
        expect(typeof c.evidence).toBe("string");
        expect(c.evidence.trim().length).toBeGreaterThan(30);
      }
    });
  }
  it("a proof path named by a new claim exists in the repo", () => {
    for (const id of NEW_IDS) {
      const c = claims.claimById(id) as { proof?: readonly string[] };
      expect((c.proof ?? []).length).toBeGreaterThan(0);
      for (const p of c.proof ?? []) expect(existsSync(join(repo, p)), `${id}: ${p}`).toBe(true);
    }
  });
  it("a claim without evidence is refused by the checker (mutation)", () => {
    const bad = { id: "x", status: "live", evidence: "" };
    expect(bad.evidence.trim().length > 30).toBe(false);
  });
});

describe("motion: only with no-preference, a reduce override, no layout shift", () => {
  it("lists every keyframes name; each is used by an animation declaration", () => {
    const css = allCss();
    const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(0);
    const used = [...css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)].map((m) => m[1] as string).join(" ");
    for (const n of names) expect(used, `unused @keyframes ${n}`).toMatch(new RegExp(`(^|[\\s,])${n}([\\s,;]|$)`));
  });
  it("a global reduced-motion override zeroes animations, transitions and smooth scroll", () => {
    const reduce = atBlocks(allCss(), REDUCE).join("\n");
    expect(reduce).toMatch(/animation-duration/);
    expect(reduce).toMatch(/transition-duration/);
    expect(reduce).toMatch(/animation-iteration-count/);
  });
  it("07-motion.css: every animation and transition sits inside no-preference", () => {
    const file = join(stylesDir, "07-motion.css");
    expect(existsSync(file)).toBe(true);
    const css = stripComments(readFileSync(file, "utf8"));
    const outside = outsideBlocks(outsideBlocks(css, NO_PREF), REDUCE);
    expect(outside).not.toMatch(/animation|transition|@keyframes|scroll-behavior\s*:\s*smooth/);
    expect(atBlocks(css, NO_PREF).join("\n")).toMatch(/@keyframes/);
  });
  it("the stamp thunk: 180 ms, scale 1.04 to 1, transform only, behind hover:hover", () => {
    const css = stripComments(readFileSync(join(stylesDir, "07-motion.css"), "utf8"));
    const hover = atBlocks(css, /@media\s*\(\s*hover\s*:\s*hover\s*\)/).join("\n");
    expect(hover).toMatch(/\.btn/);
    expect(hover).toMatch(/180ms|\.18s/);
    const frames = atBlocks(css, /@keyframes\s+btn-thunk/).join("\n");
    expect(frames).toMatch(/scale\(1\.04\)/);
    expect(frames).toMatch(/scale\(1\)/);
    expect(frames.replace(/transform\s*:[^;}]+/g, "")).not.toMatch(/[a-z-]+\s*:/);
  });
  it("pencil becomes ink: scroll-driven with a static ink fallback; the header keeps a view-transition-name", () => {
    const css = stripComments(readFileSync(join(stylesDir, "07-motion.css"), "utf8"));
    const supports = atBlocks(css, /@supports\s*\(\s*animation-timeline\s*:\s*view\(\)\s*\)/).join("\n");
    expect(supports).toMatch(/\.dayline/);
    expect(supports).toMatch(/animation-timeline\s*:\s*view\(\)/);
    expect(outsideBlocks(css, /@supports\s*\(\s*animation-timeline[^{]*\)/).replace(/@supports[^{]*\{/g, "")).not.toMatch(/animation-timeline/);
    expect(allCss()).toMatch(/view-transition-name\s*:\s*site-head/);
    expect(allCss()).toMatch(/@view-transition\s*\{\s*navigation\s*:\s*auto/);
  });
  it("no keyframes in 07-motion.css moves layout", () => {
    const css = stripComments(readFileSync(join(stylesDir, "07-motion.css"), "utf8"));
    const frames = [...css.matchAll(/@keyframes\s+[\w-]+/g)].flatMap((m) => atBlocks(css.slice(m.index), /@keyframes\s+[\w-]+/).slice(0, 1)).join("\n");
    expect(frames).not.toMatch(/\b(width|height|margin|padding|top|left|right|bottom|inset|font-size|line-height|gap)\s*:/);
  });
});

describe("no dead JavaScript, small total", () => {
  const js = readFileSync(join(marketing, "src", "site.js"), "utf8");
  it("every declared name in site.js is referenced again", () => {
    const names = [...js.matchAll(/\b(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1] as string);
    expect(names.length).toBeGreaterThan(3);
    for (const n of new Set(names)) {
      const count = js.match(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`, "g"))?.length ?? 0;
      expect(count, `${n} is declared but never used`).toBeGreaterThan(1);
    }
  });
  it("the pricing calculator code is gone from the script and the styles", () => {
    expect(js).not.toMatch(/data-calc|fillRange/);
    expect(allCss()).not.toMatch(/calc-(?:form|out|result)|\[data-calc|\.calc\b/);
  });
  it("all JavaScript the site ships is at most 15 KB", () => {
    let total = 0;
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".js")) total += statSync(p).size;
      }
    };
    walk(dist);
    const inline = ["ar", "fr", "en"].flatMap((l) => [...read(`${l}/index.html`).matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => (m[1] ?? "").length));
    expect(total + Math.max(...inline)).toBeLessThanOrEqual(15 * 1024);
  });
});
