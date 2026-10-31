// Motion language of sahelflow.com (C6): five verbs (REVEAL, STAMP, MARGIN, FIGURE, PRESS), CSS first,
// content visible without JavaScript, every animation has its own reduced-motion override.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const marketing = join(dirname(fileURLToPath(import.meta.url)), "..", "marketing");
const stylesDir = join(marketing, "src", "styles");
const read = (...p: string[]) => readFileSync(join(marketing, ...p), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const cssFiles = () => readdirSync(stylesDir).filter((f) => f.endsWith(".css")).sort();
const motionCss = () => strip(read("src", "styles", "07-motion.css"));

interface Rule { ctx: string[]; selector: string; body: string }
/** Flat list of rules; @media/@supports are walked into, @keyframes keep their raw body. */
export function parseCss(css: string, ctx: string[] = []): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      const c = css[end];
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
    const body = css.slice(open + 1, end);
    if (/^@(media|supports)/.test(head)) out.push(...parseCss(body, [...ctx, head.replace(/\s+/g, "")]));
    else out.push({ ctx, selector: head, body });
    i = end + 1;
  }
  return out;
}
const decl = (body: string, prop: string): string | undefined =>
  new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
const parts = (selector: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of selector) {
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
};
const isReduce = (r: Rule) => r.ctx.some((c) => c.includes("prefers-reduced-motion:reduce"));
const allRules = () => cssFiles().flatMap((f) => parseCss(strip(readFileSync(join(stylesDir, f), "utf8"))));
const keyframeNames = (rules: Rule[]) => rules.filter((r) => r.selector.startsWith("@keyframes")).map((r) => r.selector.replace("@keyframes", "").trim());
const LAYOUT = /\b(width|height|inline-size|block-size|top|left|right|bottom|inset[\w-]*|margin[\w-]*|padding[\w-]*|font-size|line-height|gap|all)\b/;

describe("tokens: one motion language", () => {
  const css = motionCss();
  it("defines an easing and one duration per verb as custom properties", () => {
    for (const t of ["ease-ledger", "dur-reveal", "dur-stamp", "dur-margin", "dur-figure", "dur-press", "dur-swap", "rise"]) {
      expect(css, `--sf-${t}`).toMatch(new RegExp(`--sf-${t}\\s*:`));
    }
  });
  it("every duration token is at most 900 ms, and the swap is 160 ms", () => {
    const durs = [...css.matchAll(/--sf-dur-[\w-]+\s*:\s*([\d.]+)(ms|s)\b/g)];
    expect(durs.length).toBeGreaterThanOrEqual(6);
    for (const m of durs) expect(Number(m[1]) * (m[2] === "s" ? 1000 : 1), m[0]).toBeLessThanOrEqual(900);
    expect(css).toMatch(/--sf-dur-swap\s*:\s*160ms/);
  });
  it("literal durations left in 07-motion.css are at most 900 ms", () => {
    const body = css.replace(/--sf-(?:dur|delay)-[\w-]+\s*:[^;}]+/g, "");
    expect(css).toMatch(/--sf-delay-failsafe\s*:\s*2400ms/);
    for (const m of body.matchAll(/(?<![\w.-])([\d.]+)(ms|s)\b/g)) expect(Number(m[1]) * (m[2] === "s" ? 1000 : 1), m[0]).toBeLessThanOrEqual(900);
  });
});

describe("reduced motion: the final state, per keyframe and per transition", () => {
  const rules = allRules();
  const reduceRules = rules.filter(isReduce);
  const covered = (selector: string, prop: "animation" | "transition") =>
    reduceRules.some((r) => parts(r.selector).includes(selector) && new RegExp(`${prop}(?:-name|-property)?\\s*:\\s*none`).test(r.body));
  it("every rule that starts an animation has a reduce rule that sets animation:none for the same selector", () => {
    const users = rules.filter((r) => !isReduce(r) && !r.selector.startsWith("@") && /(^|[;\s])animation(-name)?\s*:/.test(r.body) && decl(r.body, "animation") !== "none");
    expect(users.length).toBeGreaterThan(8);
    for (const r of users) for (const p of parts(r.selector)) expect(covered(p, "animation"), `no reduce override for ${p}`).toBe(true);
  });
  it("every keyframes name is used, and only by covered rules", () => {
    const names = keyframeNames(rules);
    expect(names.length).toBeGreaterThan(6);
    for (const n of names) {
      const using = rules.filter((r) => !r.selector.startsWith("@") && new RegExp(`animation(?:-name)?\\s*:\\s*(?:[^;]*[\\s,])?${n}(?=[\\s,;]|$)`).test(r.body));
      expect(using.length, `unused @keyframes ${n}`).toBeGreaterThan(0);
    }
  });
  it("every rule with a transition has a reduce rule with transition:none for the same selector", () => {
    const users = rules.filter((r) => !isReduce(r) && !r.selector.startsWith("@") && /(^|[;\s])transition\s*:/.test(r.body) && decl(r.body, "transition") !== "none");
    expect(users.length).toBeGreaterThan(2);
    for (const r of users) for (const p of parts(r.selector)) expect(covered(p, "transition"), `no reduce override for ${p}`).toBe(true);
  });
  it("scroll-linked motion exists only behind @supports and never survives reduce", () => {
    for (const r of rules.filter((x) => /animation-timeline\s*:\s*view/.test(x.body))) {
      expect(r.ctx.some((c) => c.startsWith("@supports(animation-timeline")), r.selector).toBe(true);
      for (const p of parts(r.selector)) expect(covered(p, "animation"), p).toBe(true);
    }
  });
});

describe("no layout is animated; nothing is hidden without .js-motion; no resting will-change", () => {
  const rules = allRules();
  it("keyframes and transitions touch only paint properties (grid-template-rows is the one allowed layout property)", () => {
    for (const r of rules.filter((x) => x.selector.startsWith("@keyframes"))) {
      const props = [...r.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] as string);
      for (const p of props) expect(p, `${r.selector} animates ${p}`).not.toMatch(LAYOUT);
    }
    for (const r of rules) {
      const t = decl(r.body, "transition") ?? "";
      const tp = decl(r.body, "transition-property") ?? "";
      for (const piece of [...t.split(","), ...tp.split(",")]) {
        const prop = piece.trim().split(/\s+/)[0] ?? "";
        if (prop === "grid-template-rows") continue;
        expect(prop, `${r.selector} transitions ${prop}`).not.toMatch(LAYOUT);
      }
    }
  });
  it("initial hidden states (opacity:0 on a real element) exist only under .js-motion", () => {
    const hidden = parseCss(motionCss()).filter((r) => !r.selector.startsWith("@") && /(^|[;\s])opacity\s*:\s*0\b/.test(r.body));
    expect(hidden.length).toBeGreaterThan(0);
    for (const r of hidden) for (const p of parts(r.selector)) expect(p, `${p} hides content without .js-motion`).toContain(".js-motion");
  });
  it("will-change is never set on a resting element", () => {
    for (const r of rules.filter((x) => /will-change\s*:/.test(x.body))) expect(r.selector).toMatch(/:hover|:active|:not\(\.in\)/);
  });
});

describe("the boot script sets .js-motion and is in the CSP hash list", () => {
  const layout = read("src", "layout.mjs");
  const script = /export const HEAD_SCRIPT = `([^`]*)`/.exec(layout)?.[1] ?? "";
  const run = (opts: { reduce: boolean; io: boolean }): string[] => {
    const classes = ["no-js"];
    const doc = { documentElement: { dataset: {}, classList: { replace: (a: string, b: string) => { classes[classes.indexOf(a)] = b; }, add: (c: string) => { classes.push(c); } } } };
    const win = opts.io ? { IntersectionObserver: function Stub() {} } : {};
    const matchMedia = (q: string) => ({ matches: opts.reduce && /reduce/.test(q) });
    new Function("document", "localStorage", "matchMedia", "window", script)(doc, { getItem: () => null }, matchMedia, win);
    return classes;
  };
  it("adds js-motion only when motion is wanted and IntersectionObserver exists", () => {
    expect(script).not.toBe("");
    expect(run({ reduce: false, io: true })).toContain("js-motion");
    expect(run({ reduce: true, io: true })).not.toContain("js-motion");
    expect(run({ reduce: false, io: false })).not.toContain("js-motion");
    expect(run({ reduce: false, io: true })).toContain("js");
  });
  it("its sha256 is in static/_headers script-src", () => {
    const hash = createHash("sha256").update(script).digest("base64");
    expect(read("static", "_headers")).toContain(`'sha256-${hash}'`);
  });
});

describe("site.js: a small observer that only adds a class", () => {
  const js = read("src", "site.js");
  const section = /\/\* motion:start \*\/([\s\S]*?)\/\* motion:end \*\//.exec(js)?.[1] ?? "";
  it("the fallback is at most 1 KB, adds class 'in', writes no style, runs only without native scroll timelines", () => {
    expect(section.length).toBeGreaterThan(100);
    expect(Buffer.byteLength(section)).toBeLessThanOrEqual(1024);
    expect(section).toContain('classList.add("in")');
    expect(section).not.toMatch(/\.style\b|innerHTML|setAttribute\("style/);
    expect(section).toMatch(/CSS\.supports\(\s*"animation-timeline"/);
  });
  it("every selector the observer watches is styled in 07-motion.css", () => {
    const list = /const RV = "([^"]+)"/.exec(section)?.[1] ?? "";
    expect(list).not.toBe("");
    for (const p of list.split(",")) expect(motionCss(), p).toContain(p.trim());
  });
  it("the theme switch cross-fades with a view transition only when motion is allowed", () => {
    expect(js).toMatch(/startViewTransition/);
    expect(js).toMatch(/!reduced\s*&&[^;]*startViewTransition|reduced[^;]*\?[^;]*:[^;]*startViewTransition|startViewTransition[^;]*&&[^;]*!reduced/);
  });
});

describe("the five verbs and the swaps exist in CSS", () => {
  const css = motionCss();
  const rules = parseCss(css);
  const kf = keyframeNames(rules);
  it("REVEAL, STAMP, MARGIN, FIGURE and PRESS each have keyframes or a press rule", () => {
    for (const n of ["sf-rise", "sf-draw", "sf-stamp", "sf-margin", "sf-tick"]) expect(kf, n).toContain(n);
    expect(css).toMatch(/\.btn:active\s*\{[^}]*translateY\(2px\)/);
    expect(css).toMatch(/\.btn:active\s*\{[^}]*box-shadow/);
  });
  it("hero decorations only: the LCP candidates (h1, lead) are never given opacity 0", () => {
    for (const r of rules) if (/opacity\s*:\s*0\b/.test(r.body)) for (const p of parts(r.selector)) expect(p).not.toMatch(/(^|[\s>])(h1|\.page-title)(?![\w-])|\.hero\s+\.lead/);
    expect(css).toMatch(/\.hero\s+h1::after/);
  });
  it("the pricing plate lands with the stamp once; the margin of a notice draws top to bottom", () => {
    expect(css).toMatch(/\.js-motion\s+\.plate[^{]*\{[^}]*animation:\s*sf-stamp/);
    expect(css).toMatch(/\.js-motion\s+\.notice::before[^{]*\{[^}]*sf-margin/);
  });
  it("FAQ answers open with grid-template-rows 0fr to 1fr behind @supports selector(::details-content)", () => {
    const sup = rules.filter((r) => r.ctx.some((c) => c.startsWith("@supports") && c.includes("::details-content")));
    const text = sup.map((r) => `${r.selector}{${r.body}}`).join("\n");
    expect(text).toMatch(/grid-template-rows\s*:\s*0fr/);
    expect(text).toMatch(/grid-template-rows\s*:\s*1fr/);
    expect(text).toMatch(/transition\s*:[^;]*grid-template-rows/);
  });
  it("language and theme swaps cross-fade for 160 ms and plain-swap under reduce", () => {
    const old = rules.find((r) => r.selector.includes("::view-transition-old(root)"));
    expect(old?.body ?? "").toMatch(/animation-duration\s*:\s*var\(--sf-dur-swap\)/);
    expect(rules.some((r) => isReduce(r) && r.selector.includes("::view-transition") && /animation\s*:\s*none/.test(r.body))).toBe(true);
  });
});

describe("taste: small, each with a reason", () => {
  const all = cssFiles().map((f) => strip(readFileSync(join(stylesDir, f), "utf8"))).join("\n");
  const rules = parseCss(all);
  it("selection is a highlighter stroke with a contrast-safe ink text", () => {
    const sel = rules.find((r) => r.selector.includes("::selection"));
    expect(sel?.body).toMatch(/background[^;]*var\(--brass-bg\)/);
    expect(sel?.body).toMatch(/color\s*:\s*var\(--ink\)/);
  });
  it("the focus ring is ink with a paper halo so it shows on paper and on the red margin", () => {
    const f = rules.find((r) => r.selector === ":focus-visible");
    expect(f?.body).toMatch(/outline\s*:\s*2px solid var\(--ink\)/);
    expect(f?.body).toMatch(/box-shadow\s*:[^;]*var\(--paper\)/);
  });
  it("Arabic display lines: kerning on, no letter-spacing, line-height of at least 1.3", () => {
    const h = rules.find((r) => parts(r.selector).includes("html[lang=ar] h1"));
    expect(h?.body).toMatch(/font-kerning\s*:\s*normal/);
    expect(Number(decl(h?.body ?? "", "line-height"))).toBeGreaterThanOrEqual(1.3);
  });
  it("figures keep their width: tabular numbers and a reserved width on every count-up", () => {
    const n = rules.find((r) => parts(r.selector).includes(".num[data-count-to]"));
    expect(n?.body).toMatch(/min-inline-size\s*:\s*\d+ch/);
    expect(n?.body).toMatch(/font-variant-numeric\s*:\s*tabular-nums/);
  });
});
