import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CHART_MOTION_MS, MOTION_EASE, MOTION_MS } from "../../../lib/motion/tokens";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Founder-accepted governed motion system", () => {
  it("loads the final motion authority after historical compatibility CSS", () => {
    const layout = read("src/app/layout.tsx");
    const phase5 = layout.indexOf('import "./phase5.css"');
    const product = layout.indexOf('import "./product-system.css"');
    const workspaces = layout.indexOf('import "./workspace-system.css"');
    const motion = layout.indexOf('import "./motion-system.css"');

    expect(phase5).toBeGreaterThanOrEqual(0);
    expect(product).toBeGreaterThan(phase5);
    expect(workspaces).toBeGreaterThan(product);
    expect(motion).toBeGreaterThan(workspaces);
  });

  it("makes route and flagship workspace motion actually perceivable", () => {
    const motion = read("src/app/motion-system.css");

    expect(motion).toContain(".page-sections > *");
    expect(motion).toContain("[data-inbox-workspace]");
    expect(motion).toContain("[data-ai-workspace]");
    expect(motion).toContain("[data-storefront-studio]");
    expect(motion).toContain("opacity: 0.72");
    expect(motion).toContain("translateY(8px)");
    expect(motion).toContain("--sf-motion-inline-entry: -10px");
    expect(motion).toContain('[dir="rtl"]');
    expect(motion).toContain("--sf-motion-inline-entry: 10px");
  });

  it("shares motion across stagger, directional, state-arrival and selection feedback", () => {
    const motion = read("src/app/motion-system.css");

    expect(motion).toContain(".stagger-grid > *");
    expect(motion).toContain(".animate-fade-up");
    expect(motion).toContain(".animate-scale-in");
    expect(motion).toContain(".animate-slide-right, .animate-slide-inline");
    expect(motion).toContain("[data-ai-message]");
    expect(motion).toContain('[aria-current="true"]');
    expect(motion).toContain("sf-state-arrive");
  });

  it("has one token authority: CSS, Tailwind theme and the TS mirror agree", () => {
    const motion = read("src/app/motion-system.css");
    const globals = read("src/app/globals.css");

    for (const [name, ms] of Object.entries(MOTION_MS)) {
      expect(motion, `--sf-dur-${name}`).toContain(`--sf-dur-${name}: ${ms}ms;`);
      expect(globals).toContain(`--transition-duration-${name}: var(--sf-dur-${name});`);
    }
    for (const [name, [a, b, c, d]] of Object.entries(MOTION_EASE)) {
      expect(motion, `--sf-ease-${name}`).toContain(`--sf-ease-${name}: cubic-bezier(${a}, ${b}, ${c}, ${d});`);
    }
    for (const name of ["out", "in", "standard", "expo"]) {
      expect(globals).toContain(`--ease-${name}: var(--sf-ease-${name});`);
    }
    expect(globals).toContain("--default-transition-duration: var(--sf-dur-fast);");
    expect(globals).toContain("--default-transition-timing-function: var(--sf-ease-standard);");
    // Older names still resolve, to tokens.
    expect(motion).toContain("--sf-motion-state: var(--sf-dur-fast);");
    expect(motion).toContain("--sf-motion-ease-out: var(--sf-ease-expo);");
  });

  it("budgets chart animation for a weak GPU and reads it from the mirror", () => {
    expect(CHART_MOTION_MS.firstDraw).toBeLessThanOrEqual(300);
    expect(CHART_MOTION_MS.update).toBeLessThanOrEqual(220);
    expect(read("src/components/charts/chart-motion.ts")).toContain("CHART_MOTION_MS.firstDraw");
    expect(read("src/components/charts/echarts-runtime.tsx")).toContain("CHART_MOTION_MS.update");
  });

  it("keeps ONE transition rule on every control, without box-shadow", () => {
    const globals = blankComments(read("src/app/globals.css"));
    const product = blankComments(read("src/app/product-system.css"));
    const rule = /(?:^|\n)button,\s*a,\s*\[role="button"\],\s*input,\s*select,\s*textarea\s*\{([^}]*)\}/;

    expect(globals).not.toMatch(/button,\s*a,\s*\[role="button"\]/);
    const body = rule.exec(product)?.[1] ?? "";
    expect(body).toContain("transition-property: background-color, border-color, color, opacity, transform;");
    expect(body).not.toContain("box-shadow");
    expect(body).toContain("var(--sf-dur-fast)");
    expect(body).toContain("var(--sf-ease-standard)");
  });

  it("snaps the sidebar and the AI rail width and fades the theme switch by opacity only", () => {
    expect(read("src/components/layout/sidebar.tsx")).not.toMatch(/transition-\[width\]/);
    expect(read("src/components/ai/ai-decision-workspace.tsx")).not.toMatch(/transition-\[width\]/);
    const product = read("src/app/product-system.css");
    const keyframes = product.slice(product.indexOf("@keyframes sf-theme-out"), product.indexOf("/* ── Governed motion grammar"));
    expect(keyframes).toContain("opacity: 0.72");
    expect(keyframes).not.toContain("filter");
  });

  it("keeps the locale switch cover static (the 2px progress bar carries the motion)", () => {
    const locale = read("src/app/locale-transition-system.css");
    expect(locale).not.toContain("background-position");
    expect(locale).not.toMatch(/animation:\s*sf-locale-reconcile/);
    expect(locale).toContain("prefers-reduced-motion: reduce");
  });

  it("opens the sheet in about 250ms and closes it in 200ms with token easing", () => {
    const sheet = read("src/components/ui/sheet.tsx");
    expect(sheet).toContain("data-[state=open]:duration-page");
    expect(sheet).toContain("data-[state=closed]:duration-base");
    expect(sheet).toContain("data-[state=open]:ease-out");
    expect(sheet).toContain("data-[state=closed]:ease-in");
    expect(sheet).not.toMatch(/duration-(300|500)/);
  });

  it("uses bounded transform/opacity feedback and gives reduced-motion final authority", () => {
    const motion = read("src/app/motion-system.css");

    expect(motion).toContain("transform: scale(0.98)");
    expect(motion).toContain("transform: translateY(-2px)");
    expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
    expect(motion).toContain("animation-duration: 0.01ms !important");
    expect(motion).toContain("transition-duration: 0.01ms !important");
    expect(motion).toContain("animation-delay: 0ms !important");
    expect(motion).toContain("transform: none !important");
  });
});

/* ------------------------------------------------------------------ */
/* Motion guard: a new bad pattern fails the build.                    */
/* Weak-PC rule: animate transform and opacity only, keep it short.    */
/* ------------------------------------------------------------------ */

// Reviewed exceptions. Each entry is one file and the layout properties it may
// animate, with the reason it is accepted. Add an entry only after looking at
// the element on a screen; the default answer is "animate transform instead".
const LAYOUT_ALLOWLIST: Record<string, { props: string[]; reason: string }> = {
  "src/components/updater/update-chip.tsx": {
    props: ["width"],
    reason: "download progress bar, 2px high, width is the value itself",
  },
  "src/components/charts/decision-visualizations.tsx": {
    props: ["width", "inline-size"],
    reason: "thin horizontal value bars inside cards, no reflow outside the bar",
  },
  "src/components/risk/risk-seller-sections.tsx": {
    props: ["width"],
    reason: "thin score bar inside one card",
  },
  "src/components/inbox/inbox-thread-message.tsx": {
    props: ["width"],
    reason: "attachment upload bar, 2px high, short 150ms default",
  },
  "src/components/storefront/studio/studio-canvas.tsx": {
    props: ["width"],
    reason: "preview frame width on a device switch; known exception, a scale transform is the open follow-up",
  },
};

// One-shot motion longer than the cap. Hover previews and entry-screen
// choreography only; never a route, sheet, dialog or control.
const LONG_ONE_SHOT_ALLOWLIST: Record<string, string> = {
  "src/components/brand/algeria-live-map.module.css":
    "ambient map reveal on the setup and sign-in screens only, staggered, runs once, stops under reduced motion",
  "src/app/automation-system.css":
    "template-card hover preview that lights the flow steps in run order, transform only, hover-triggered",
};

const LAYOUT_PROPS = new Set([
  "width", "height", "inline-size", "block-size",
  "min-width", "min-height", "max-width", "max-height",
  "min-inline-size", "min-block-size", "max-inline-size", "max-block-size",
  "top", "left", "right", "bottom", "inset",
  "inset-inline", "inset-block", "inset-inline-start", "inset-inline-end",
  "inset-block-start", "inset-block-end",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "margin-inline", "margin-block", "margin-inline-start", "margin-inline-end",
  "margin-block-start", "margin-block-end",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "padding-inline", "padding-block", "padding-inline-start", "padding-inline-end",
  "padding-block-start", "padding-block-end",
  "border-width", "border-top-width", "border-right-width", "border-bottom-width",
  "border-left-width", "font-size", "gap", "row-gap", "column-gap",
  "grid-template-columns", "grid-template-rows",
]);

const MAX_ONE_SHOT_MS = 500;
const EASING_WORDS = new Set([
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "none", "normal", "allow-discrete", "infinite", "alternate", "alternate-reverse",
  "reverse", "forwards", "backwards", "both", "running", "paused",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === ".next") continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk(resolve(root, "src")).map((f) => ({
  rel: relative(root, f).split("\\").join("/"),
  full: f,
}));
const cssFiles = srcFiles.filter((f) => f.rel.endsWith(".css"));
const tsxFiles = srcFiles.filter(
  (f) => f.rel.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(f.rel),
);

function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

interface Decl {
  prop: string;
  value: string;
  line: number;
  rule: number;
  context: string[];
}

function parseDecls(source: string): Decl[] {
  const css = blankComments(source);
  const out: Decl[] = [];
  const stack: { head: string; id: number }[] = [];
  let buf = "";
  let bufLine = 1;
  let line = 1;
  let paren = 0;
  let nextId = 1;
  const flush = () => {
    const text = buf.trim();
    buf = "";
    if (!text || text.startsWith("@")) return;
    const colon = text.indexOf(":");
    if (colon < 1) return;
    out.push({
      prop: text.slice(0, colon).trim().toLowerCase(),
      value: text.slice(colon + 1).trim().replace(/\s+/g, " "),
      line: bufLine,
      rule: stack.length ? stack[stack.length - 1].id : 0,
      context: stack.map((s) => s.head),
    });
  };
  for (const c of css) {
    if (c === "\n") line++;
    if (c === "(") paren++;
    if (c === ")") paren = Math.max(0, paren - 1);
    if (paren === 0 && c === "{") {
      stack.push({ head: buf.trim().replace(/\s+/g, " "), id: nextId++ });
      buf = "";
      continue;
    }
    if (paren === 0 && c === "}") {
      flush();
      stack.pop();
      continue;
    }
    if (paren === 0 && c === ";") {
      flush();
      continue;
    }
    if (buf === "" && /\s/.test(c)) continue;
    if (buf === "") bufLine = line;
    buf += c;
  }
  return out;
}

const inReducedMotion = (d: Decl) =>
  d.context.some((c) => c.startsWith("@media") && /prefers-reduced-motion:\s*reduce/.test(c));
const inKeyframes = (d: Decl) => d.context.some((c) => /^@(-\w+-)?keyframes/.test(c));

function splitTop(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of value) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === sep && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const TIME = /^(-?\d*\.?\d+)(ms|s)$/;
const toMs = (t: string): number | null => {
  const m = TIME.exec(t);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
};

/** Property name of one `transition` shorthand layer; "all" when none is written. */
function layerProperty(layer: string): string {
  const words = splitTop(layer, " ");
  if (words.includes("none")) return "none";
  for (const token of words) {
    if (TIME.test(token) || EASING_WORDS.has(token) || token.includes("(")) continue;
    if (/^[a-z-]+$/.test(token)) return token;
  }
  return "all";
}

function allowed(file: string, prop: string): boolean {
  return LAYOUT_ALLOWLIST[file]?.props.includes(prop) ?? false;
}

function cssViolations(kind: "all" | "layout" | "long" | "infinite-no-rm"): string[] {
  const found: string[] = [];
  for (const f of cssFiles) {
    if (kind === "long" && f.rel in LONG_ONE_SHOT_ALLOWLIST) continue;
    const decls = parseDecls(readFileSync(f.full, "utf8"));
    const at = (d: Decl) => `${f.rel}:${d.line}`;
    const hasReducedRule = decls.some((d) => inReducedMotion(d) && /^(animation|transition)/.test(d.prop));
    const infiniteRules = new Set(
      decls.filter((d) => d.prop === "animation-iteration-count" && /infinite/.test(d.value)).map((d) => d.rule),
    );
    for (const d of decls) {
      if (inReducedMotion(d)) continue;
      const layers = splitTop(d.value, ",");
      if (d.prop === "transition") {
        for (const layer of layers) {
          const prop = layerProperty(layer);
          if (kind === "all" && prop === "all") found.push(`${at(d)} transition: ${layer}`);
          if (kind === "layout" && LAYOUT_PROPS.has(prop) && !allowed(f.rel, prop)) found.push(`${at(d)} transition ${prop}`);
          const ms = layers.length ? toMs(splitTop(layer, " ").find((t) => TIME.test(t)) ?? "") : null;
          if (kind === "long" && ms !== null && ms > MAX_ONE_SHOT_MS) found.push(`${at(d)} transition ${ms}ms`);
        }
      }
      if (d.prop === "transition-property") {
        for (const prop of layers) {
          if (kind === "all" && prop === "all") found.push(`${at(d)} transition-property: all`);
          if (kind === "layout" && LAYOUT_PROPS.has(prop) && !allowed(f.rel, prop)) found.push(`${at(d)} transition-property ${prop}`);
        }
      }
      if (d.prop === "transition-duration" || d.prop === "animation-duration") {
        const oneShot = d.prop === "transition-duration" || !infiniteRules.has(d.rule);
        for (const t of layers) {
          const ms = toMs(t);
          if (kind === "long" && oneShot && ms !== null && ms > MAX_ONE_SHOT_MS) found.push(`${at(d)} ${d.prop} ${ms}ms`);
        }
      }
      if (d.prop === "animation") {
        for (const layer of layers) {
          const infinite = /\binfinite\b/.test(layer);
          const first = splitTop(layer, " ").find((t) => TIME.test(t));
          const ms = first ? toMs(first) : null;
          if (kind === "long" && !infinite && ms !== null && ms > MAX_ONE_SHOT_MS) found.push(`${at(d)} animation ${ms}ms: ${layer}`);
          if (kind === "infinite-no-rm" && infinite && !hasReducedRule) found.push(`${at(d)} infinite, no reduced-motion rule in file`);
        }
      }
      if (d.prop === "animation-iteration-count" && /infinite/.test(d.value) && kind === "infinite-no-rm" && !hasReducedRule) {
        found.push(`${at(d)} infinite, no reduced-motion rule in file`);
      }
      if (kind === "layout" && inKeyframes(d) && LAYOUT_PROPS.has(d.prop) && !allowed(f.rel, d.prop)) {
        found.push(`${at(d)} @keyframes ${d.prop}`);
      }
    }
  }
  return found;
}

/** Tailwind class tokens of one TSX line: split on quotes, space, braces. */
function classTokens(line: string): string[] {
  return line.split(/[\s"'`{}(),;<>]+/).filter(Boolean);
}
const stripVariants = (token: string) =>
  token.replace(/\[[^\]]*\]/g, "[]").split(":").pop()?.replace(/^!/, "") ?? "";
const isCommentLine = (line: string) => /^\s*\/\//.test(line);
// Block comments are blanked, newlines kept, so a comment can say "transition".
const blankBlockComments = (src: string) =>
  src.replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, (m, lead: string) => lead + m.slice(lead.length).replace(/[^\n]/g, " "));

function tsxViolations(kind: "all" | "bare" | "layout" | "long"): string[] {
  const found: string[] = [];
  for (const f of tsxFiles) {
    const lines = blankBlockComments(readFileSync(f.full, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      const at = `${f.rel}:${i + 1}`;
      const tokens = classTokens(line);
      const stripped = tokens.map(stripVariants);
      if (kind === "all" && stripped.includes("transition-all")) found.push(`${at} transition-all`);
      // A lone word "transition" is also a plain string in some code, so a bare
      // class counts only on a line that carries other hyphenated utilities.
      if (kind === "bare" && stripped.includes("transition") && tokens.some((t) => t !== "transition" && /^[\w!:[\]/.-]*-[\w[\]/.%-]+$/.test(t))) {
        found.push(`${at} bare transition`);
      }
      for (const raw of tokens) {
        const arbitrary = /(?:^|:)transition-\[([^\]]+)\]/.exec(raw);
        if (kind === "layout" && arbitrary) {
          for (const part of arbitrary[1].split(",")) {
            const prop = part.replace(/_/g, " ").trim().split(" ")[0];
            if (LAYOUT_PROPS.has(prop) && !allowed(f.rel, prop)) found.push(`${at} transition-[${prop}]`);
          }
        }
        const duration = /(?:^|:)duration-(?:(\d+)|\[(\d*\.?\d+)(ms|s)\])$/.exec(raw);
        if (kind === "long" && duration) {
          const ms = duration[1] ? Number(duration[1]) : Number(duration[2]) * (duration[3] === "s" ? 1000 : 1);
          if (ms > MAX_ONE_SHOT_MS && !tokens.some((t) => /infinite|animate-(spin|pulse|ping|bounce)/.test(t))) {
            found.push(`${at} ${raw}`);
          }
        }
      }
    });
  }
  return found;
}

// A failure prints one offending file:line per row instead of "[ (6) ]".
function expectNone(found: string[]) {
  expect(found.length ? `\n${found.join("\n")}` : "").toBe("");
}

describe("Motion guard: compositor-only, short, reduced-motion safe", () => {
  it("scans the real source tree (the guard is not vacuous)", () => {
    expect(cssFiles.length).toBeGreaterThanOrEqual(14);
    expect(tsxFiles.length).toBeGreaterThan(300);
    expect(parseDecls("a{transition:opacity 1s ease;} @keyframes x{from{width:0}}").map((d) => d.prop)).toEqual([
      "transition",
      "width",
    ]);
  });

  it("never transitions `all` (CSS)", () => {
    expectNone(cssViolations("all"));
  });

  it("never uses Tailwind transition-all", () => {
    expectNone(tsxViolations("all"));
  });

  it("never uses a bare Tailwind `transition` class (it animates colour, shadow, transform and more)", () => {
    expectNone(tsxViolations("bare"));
  });

  it("keeps layout properties out of CSS transitions and keyframes (allowlist excepted)", () => {
    expectNone(cssViolations("layout"));
  });

  it("keeps layout properties out of Tailwind transition-[...] (allowlist excepted)", () => {
    expectNone(tsxViolations("layout"));
  });

  it("gives every allowlist entry a reason and a file that still exists", () => {
    for (const [file, entry] of Object.entries(LAYOUT_ALLOWLIST)) {
      expect(entry.reason.length, file).toBeGreaterThan(20);
      expect(srcFiles.some((f) => f.rel === file), `${file} no longer exists`).toBe(true);
    }
  });

  it(`keeps one-shot CSS durations at ${MAX_ONE_SHOT_MS}ms or less`, () => {
    expectNone(cssViolations("long"));
  });

  it(`keeps one-shot Tailwind durations at ${MAX_ONE_SHOT_MS}ms or less`, () => {
    expectNone(tsxViolations("long"));
  });

  it("gives every long-duration exception a reason and a file that still exists", () => {
    for (const [file, reason] of Object.entries(LONG_ONE_SHOT_ALLOWLIST)) {
      expect(reason.length, file).toBeGreaterThan(20);
      expect(srcFiles.some((f) => f.rel === file), `${file} no longer exists`).toBe(true);
    }
  });

  it("stops every infinite CSS animation under reduced motion", () => {
    expectNone(cssViolations("infinite-no-rm"));
    const globals = read("src/app/globals.css");
    expect(globals).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation-iteration-count:\s*1\s*!important/);
  });
});
