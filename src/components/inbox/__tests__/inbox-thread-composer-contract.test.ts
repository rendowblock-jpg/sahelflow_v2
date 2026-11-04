import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUBBLE_IN_BORDER_CLASS,
  BUBBLE_OUT_BORDER_CLASS,
  bubbleOutBorderPercent,
  COMPOSER_FIELD_CLASS,
  composerFieldBorderPercent,
  composerPlaceholderPercent,
} from "../inbox-composer-style";

/*
 * Founder (4 Nov 2026): "the inbox UI and design are weak". In the LIGHT theme
 * the reply field had NO visible boundary (border-0 bg-transparent inside a
 * 1.3:1 tray), the placeholder was 14 px, and the four buttons around it were
 * unlabelled boxes. This contract pins (1) the boundary and placeholder
 * contrast NUMBERS for every preset in both modes, computed from the live
 * token files, and (2) the structure of the composer row in the sources.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

type Declarations = Map<string, string>;
type Block = { selectors: string[]; declarations: Declarations };

function parseBlocks(css: string): Block[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const declarations: Declarations = new Map();
    for (const d of (m[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations.set(d[1] ?? "", (d[2] ?? "").trim());
    }
    if (selectors.length && declarations.size) blocks.push({ selectors, declarations });
  }
  return blocks;
}

function merged(blocks: Block[], selector: string): Declarations {
  let out: Declarations | undefined;
  for (const b of blocks) {
    if (!b.selectors.includes(selector)) continue;
    out = out ? new Map([...out, ...b.declarations]) : b.declarations;
  }
  if (!out) throw new Error(`selector ${selector} not found in the token files`);
  return out;
}

function token(layers: Declarations[], name: string): string {
  for (const layer of layers) {
    const raw = layer.get(name);
    if (raw === undefined) continue;
    const ref = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    return ref?.[1] ? token(layers, ref[1]) : raw;
  }
  throw new Error(`token ${name} not defined`);
}

type Lab = [number, number, number];

function oklchToLab(value: string): Lab {
  const m = value.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i);
  if (!m) throw new Error(`not an oklch literal: ${value}`);
  const l = Number(m[1]);
  const c = Number(m[2]);
  const h = (Number(m[3]) * Math.PI) / 180;
  return [l, c * Math.cos(h), c * Math.sin(h)];
}

function labToRgb255([l, a, b]: Lab): [number, number, number] {
  const lp = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mp = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sp = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * lp - 3.3077115913 * mp + 0.2309699292 * sp,
    -1.2684380046 * lp + 2.6097574011 * mp - 0.3413193965 * sp,
    -0.0041960863 * lp - 0.7034186147 * mp + 1.707614701 * sp,
  ];
  const enc = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  };
  return [enc(lin[0] ?? 0), enc(lin[1] ?? 0), enc(lin[2] ?? 0)];
}

function luminance(rgb: readonly number[]): number {
  const [r = 0, g = 0, b = 0] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: Lab, b: Lab): number {
  const la = luminance(labToRgb255(a));
  const lb = luminance(labToRgb255(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** color-mix(in oklab, top P%, bottom): linear in OKLab, opaque. */
function mix(top: Lab, bottom: Lab, percent: number): Lab {
  const p = percent / 100;
  return [0, 1, 2].map((i) => (top[i] ?? 0) * p + (bottom[i] ?? 0) * (1 - p)) as Lab;
}

const product = parseBlocks(read("src/app/product-system.css"));
const presets = parseBlocks(read("src/app/theme-preset-system.css"));
const lightRoot = merged(product, ":root");
const darkBase = merged(presets, "html.dark");

const NAMES = ["sahel", "atlas", "oasis", "dune"] as const;
const cascades: Array<{ id: string; mode: "light" | "dark"; layers: Declarations[] }> = [];
for (const n of NAMES) {
  cascades.push({
    id: `${n} light`,
    mode: "light",
    layers: n === "sahel" ? [lightRoot] : [merged(product, `html[data-theme-preset="${n}"]`), lightRoot],
  });
  cascades.push({
    id: `${n} dark`,
    mode: "dark",
    layers: [merged(presets, `html.dark[data-theme-preset="${n}"]`), darkBase],
  });
}

const lab = (layers: Declarations[], name: string) => oklchToLab(token(layers, name));

describe("composer field boundary and placeholder (measured from the tokens)", () => {
  for (const c of cascades) {
    it(`${c.id}: the field border is >= 3:1 against the bar and against the field`, () => {
      const border = mix(
        lab(c.layers, "--foreground"),
        lab(c.layers, "--background"),
        composerFieldBorderPercent(c.mode),
      );
      expect(ratio(border, lab(c.layers, "--background"))).toBeGreaterThanOrEqual(3);
      expect(ratio(border, lab(c.layers, "--card"))).toBeGreaterThanOrEqual(3);
    });

    it(`${c.id}: the placeholder is >= 4.5:1 on the field`, () => {
      const placeholder = mix(
        lab(c.layers, "--foreground"),
        lab(c.layers, "--card"),
        composerPlaceholderPercent(),
      );
      expect(ratio(placeholder, lab(c.layers, "--card"))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("the class string and the constants agree", () => {
  it("border and placeholder percentages in the Tailwind classes equal the constants", () => {
    const light = COMPOSER_FIELD_CLASS.match(/(?:^|\s)border-\[color-mix\(in_oklab,var\(--foreground\)_(\d+)%/);
    const dark = COMPOSER_FIELD_CLASS.match(/dark:border-\[color-mix\(in_oklab,var\(--foreground\)_(\d+)%/);
    const ph = COMPOSER_FIELD_CLASS.match(/placeholder:text-\[color-mix\(in_oklab,var\(--foreground\)_(\d+)%/);
    expect(Number(light?.[1])).toBe(composerFieldBorderPercent("light"));
    expect(Number(dark?.[1])).toBe(composerFieldBorderPercent("dark"));
    expect(Number(ph?.[1])).toBe(composerPlaceholderPercent());
  });
});

describe("composer row structure (read in code)", () => {
  const thread = read("src/components/inbox/inbox-v3-thread.tsx");
  const emoji = read("src/components/inbox/inbox-emoji-picker.tsx");
  const canned = read("src/components/inbox/canned-response-picker.tsx");

  it("the reply field uses the shared field class and is at least 44 px tall", () => {
    expect(thread).toContain("COMPOSER_FIELD_CLASS");
    expect(COMPOSER_FIELD_CLASS).toMatch(/(?:^|\s)min-h-11(?:\s|$)/);
    expect(COMPOSER_FIELD_CLASS).toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(COMPOSER_FIELD_CLASS).not.toMatch(/border-0|bg-transparent/);
  });

  it("the placeholder is 14-16 px and the field shows a focus-visible ring", () => {
    expect(COMPOSER_FIELD_CLASS).toMatch(/(?:^|\s)text-base(?:\s|$)/);
    expect(COMPOSER_FIELD_CLASS).toMatch(/md:text-\[15px\]/);
    expect(COMPOSER_FIELD_CLASS).toMatch(/focus-visible:ring-\[3px\]/);
    expect(COMPOSER_FIELD_CLASS).not.toMatch(/focus-visible:ring-0/);
  });

  it("the field sits between the start group and the end group, send is last", () => {
    const start = thread.indexOf('data-inbox-composer-group="start"');
    const field = thread.indexOf("className={COMPOSER_FIELD_CLASS}");
    const end = thread.indexOf('data-inbox-composer-group="end"');
    const send = thread.indexOf('data-inbox-send="true"');
    expect(start).toBeGreaterThan(0);
    expect(field).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(field);
    expect(send).toBeGreaterThan(end);
  });

  it("emoji, templates, mic, attach and send each have a tooltip next to the accessible name", () => {
    expect(emoji).toContain("TooltipContent");
    expect(canned).toContain("TooltipContent");
    expect(thread).toMatch(/TooltipContent[^>]*>\s*\{t\("inbox\.send"\)\}/);
    expect(thread).toMatch(/TooltipContent[^>]*>\s*\{copy\("voiceRecord"\)\}/);
    expect(thread).toMatch(/TooltipContent[^>]*>\s*\{copy\("attachMenu"\)\}/);
  });

  it("Enter sends and Shift+Enter keeps the newline (send logic untouched)", () => {
    expect(thread).toMatch(/event\.key === "Enter" && !event\.shiftKey && canSend/);
  });
});

describe("message bubbles (measured from the tokens)", () => {
  for (const c of cascades) {
    it(`${c.id}: text is >= 4.5:1 on both bubble kinds`, () => {
      const fg = lab(c.layers, "--foreground");
      expect(ratio(fg, lab(c.layers, "--card"))).toBeGreaterThanOrEqual(4.5);
      // bg-primary-soft = primary 8 % over the pane (globals.css --color-primary-soft)
      const soft = mix(lab(c.layers, "--primary"), lab(c.layers, "--background"), 8);
      expect(ratio(fg, soft)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${c.id}: both outlines are >= 3:1 against the pane (the outline is the only separator)`, () => {
      const bg = lab(c.layers, "--background");
      const inbound = mix(lab(c.layers, "--foreground"), bg, composerFieldBorderPercent(c.mode));
      const outbound = mix(lab(c.layers, "--primary"), bg, bubbleOutBorderPercent(c.mode));
      expect(ratio(inbound, bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(outbound, bg)).toBeGreaterThanOrEqual(3);
    });
  }

  it("the Tailwind outline classes carry the same percentages as the constants", () => {
    const out = BUBBLE_OUT_BORDER_CLASS.match(/(?:^|\s)border-\[color-mix\(in_oklab,var\(--primary\)_(\d+)%/);
    const outDark = BUBBLE_OUT_BORDER_CLASS.match(/dark:border-\[color-mix\(in_oklab,var\(--primary\)_(\d+)%/);
    const inn = BUBBLE_IN_BORDER_CLASS.match(/(?:^|\s)border-\[color-mix\(in_oklab,var\(--foreground\)_(\d+)%/);
    const inDark = BUBBLE_IN_BORDER_CLASS.match(/dark:border-\[color-mix\(in_oklab,var\(--foreground\)_(\d+)%/);
    expect(Number(out?.[1])).toBe(bubbleOutBorderPercent("light"));
    expect(Number(outDark?.[1])).toBe(bubbleOutBorderPercent("dark"));
    expect(Number(inn?.[1])).toBe(composerFieldBorderPercent("light"));
    expect(Number(inDark?.[1])).toBe(composerFieldBorderPercent("dark"));
  });

  const message = read("src/components/inbox/inbox-thread-message.tsx");
  it("the bubble uses the measured outlines, is capped near 70 % and wraps long words and links", () => {
    expect(message).toContain("BUBBLE_IN_BORDER_CLASS");
    expect(message).toContain("BUBBLE_OUT_BORDER_CLASS");
    expect(message).toContain("max-w-[min(46rem,70%)]");
    expect(message).toContain("[overflow-wrap:anywhere]");
    expect(message).not.toContain("border-border/70 bg-card");
    expect(message).not.toContain("border-primary/20 bg-primary-soft");
  });

  it("only the last bubble of a sender's run shows the time; ticks stay on every outgoing bubble", () => {
    expect(message).toContain('!groupEnd && "sr-only"');
  });
});
