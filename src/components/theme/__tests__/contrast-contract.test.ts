import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normalizeChartColor } from "../../charts/chart-color";

/*
 * WCAG AA contrast contract for SahelFlow's design-token authority.
 *
 * Remediation context (audit d6 finding #2): light-mode white-on-primary
 * buttons failed AA — on the R1-b-consolidated tokens sahel measured 4.20:1
 * (buttons) / 4.19:1 (primary-as-text links) and oasis links 4.46:1. R5-b
 * recalibrated those primaries to >= 4.5:1 with margin while preserving each
 * preset's hue exactly; atlas and dune already passed post-consolidation.
 *
 * Authority files (parsed live — CSS custom properties cannot be imported):
 *   - src/app/product-system.css      — light presets (sahel :root, atlas/oasis/dune blocks)
 *   - src/app/theme-preset-system.css — dark neutral stack + dark preset accents
 *   - src/app/globals.css             — feedback semantics (--destructive)
 *
 * Methodology — identical math to the audit and to src/components/charts/chart-color.ts
 * (Björn Ottosson OKLab matrices): OKLCH -> sRGB -> WCAG relative luminance.
 * Three light primaries sit outside the sRGB gamut, so every ratio is ALSO
 * computed after CSS Color 4 gamut mapping (chroma reduction at constant L/H —
 * what browsers actually render) and the contract asserts the MINIMUM of the
 * naive-clamped and gamut-mapped results. That floor is conservative across
 * engines and absorbs the "rendering variance" the remediation margin targets.
 *
 * Not gated here (documented in the R5-b worklog, owned elsewhere):
 *   - hover:bg-primary/90 (button.tsx) lifts each light primary toward the
 *     near-white card and lands at 3.90-4.40:1 even after the fix — a
 *     component-level alpha treatment, not a token.
 *   - --success/--info foreground token pairs (globals.css) measure below AA
 *     but currently have zero consumers.
 *   - White on SOLID dark --destructive measures 2.89:1, but every rendered
 *     dark button/badge uses bg-destructive/60 (5.95:1+); dark --destructive
 *     is asserted for its real role: colored text on dark surfaces.
 */

const AA_NORMAL_TEXT = 4.5;
/** R5-b calibration margin above 4.5 that absorbs engine gamut-mapping variance. */
const AA_PRIMARY_FLOOR = 4.55;

const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
type PresetName = (typeof PRESETS)[number];

/** Founding hue angles of the audited pre-R5-b authority (identity contract: ±8°). */
const LIGHT_HUE_REFERENCE: Record<PresetName, number> = {
  sahel: 150,
  atlas: 286,
  oasis: 205,
  dune: 63,
};
const DARK_HUE_REFERENCE: Record<PresetName, number> = {
  sahel: 150,
  atlas: 285,
  oasis: 190,
  dune: 70,
};

type Oklch = { l: number; c: number; h: number };

type Declarations = Map<string, string>;

type CssBlock = { selectors: string[]; declarations: Declarations };

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

/** Flat CSS block parser (comments stripped; nested at-rule shells skip — their inner rules match). */
function parseBlocks(css: string): CssBlock[] {
  const commentless = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: CssBlock[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null = pattern.exec(commentless);
  while (match !== null) {
    const selectors = (match[1] ?? "")
      .split(",")
      .map((selector) => selector.trim())
      .filter((selector) => selector.length > 0);
    const declarations: Declarations = new Map();
    const body = match[2] ?? "";
    const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let declaration: RegExpExecArray | null = declarationPattern.exec(body);
    while (declaration !== null) {
      declarations.set(declaration[1] ?? "", (declaration[2] ?? "").trim());
      declaration = declarationPattern.exec(body);
    }
    if (selectors.length > 0 && declarations.size > 0) {
      blocks.push({ selectors, declarations });
    }
    match = pattern.exec(commentless);
  }
  return blocks;
}

/** Merge every block with this exact selector, document order (later wins). */
function mergedDeclarations(blocks: CssBlock[], selector: string): Declarations {
  let merged: Declarations | undefined;
  for (const block of blocks) {
    if (!block.selectors.includes(selector)) continue;
    merged = merged
      ? new Map([...merged, ...block.declarations])
      : block.declarations;
  }
  if (merged === undefined) {
    throw new Error(
      `Selector "${selector}" not found — the token authority was restructured; update this contract test.`,
    );
  }
  return merged;
}

/** Resolve a token through the cascade (overlay first), following var() references. */
function resolveToken(layers: Declarations[], name: string): string {
  for (const layer of layers) {
    const raw = layer.get(name);
    if (raw === undefined) continue;
    const value = raw.trim();
    const reference = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (reference?.[1]) {
      return resolveToken(layers, reference[1]);
    }
    return value;
  }
  throw new Error(`Design token "${name}" is not defined in the parsed cascade.`);
}

const productBlocks = parseBlocks(source("../../../app/product-system.css"));
const presetBlocks = parseBlocks(source("../../../app/theme-preset-system.css"));
const globalsBlocks = parseBlocks(source("../../../app/globals.css"));

const productLightRoot = mergedDeclarations(productBlocks, ":root");
const darkNeutralBase = mergedDeclarations(presetBlocks, "html.dark");
const globalsLightRoot = mergedDeclarations(globalsBlocks, ":root");
const globalsDark = mergedDeclarations(globalsBlocks, ".dark");

function lightCascade(preset: PresetName): Declarations[] {
  if (preset === "sahel") return [productLightRoot];
  return [
    mergedDeclarations(productBlocks, `html[data-theme-preset="${preset}"]`),
    productLightRoot,
  ];
}

function darkCascade(preset: PresetName | "fallback"): Declarations[] {
  if (preset === "fallback") {
    return [mergedDeclarations(productBlocks, ".dark"), darkNeutralBase];
  }
  return [
    mergedDeclarations(presetBlocks, `html.dark[data-theme-preset="${preset}"]`),
    darkNeutralBase,
  ];
}

const OKLCH_PATTERN =
  /^oklch\(\s*([+-]?\d*\.?\d+)%?\s+([+-]?\d*\.?\d+)%?\s+([+-]?\d*\.?\d+)(?:deg|grad|rad|turn)?\s*(?:\/\s*[+-]?\d*\.?\d+%?\s*)?\)$/i;

function parseOklch(value: string): Oklch {
  const match = value.match(OKLCH_PATTERN);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    throw new Error(`Value "${value}" is not a supported oklch() token literal.`);
  }
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

function colorToken(layers: Declarations[], name: string): Oklch {
  return parseOklch(resolveToken(layers, name));
}

function oklchToLinearRgb(color: Oklch): [number, number, number] {
  const radians = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(radians);
  const b = color.c * Math.sin(radians);

  const lPrime = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = color.l - 0.0894841775 * a - 1.291485548 * b;

  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function isWithinSRgbGamut(channels: readonly number[]): boolean {
  return channels.every(
    (channel) => channel >= -0.000001 && channel <= 1.000001,
  );
}

function encodeSrgb(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** chart-color.ts conversion (naive per-channel clamp — the audit methodology). */
function naiveSrgbChannels(color: Oklch): [number, number, number] {
  const rgb = normalizeChartColor(`oklch(${color.l} ${color.c} ${color.h})`);
  const match = rgb.match(/^rgba?\((\d+), (\d+), (\d+)/);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    throw new Error(`chart-color could not convert oklch(${color.l} ${color.c} ${color.h}).`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** CSS Color 4 gamut mapping: reduce chroma at constant L/H until inside sRGB. */
function gamutMappedSrgbChannels(color: Oklch): [number, number, number] {
  const direct = oklchToLinearRgb(color);
  if (isWithinSRgbGamut(direct)) {
    return [encodeSrgb(direct[0]), encodeSrgb(direct[1]), encodeSrgb(direct[2])];
  }
  let low = 0;
  let high = color.c;
  for (let step = 0; step < 32; step += 1) {
    const mid = (low + high) / 2;
    if (isWithinSRgbGamut(oklchToLinearRgb({ ...color, c: mid }))) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const mapped = oklchToLinearRgb({ ...color, c: low });
  return [encodeSrgb(mapped[0]), encodeSrgb(mapped[1]), encodeSrgb(mapped[2])];
}

function relativeLuminance(channels: readonly number[]): number {
  const linear = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = linear;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratioBetweenLuminances(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Contractual contrast: the worse of the audit methodology and the browser's
 * gamut-mapped render — conservative across color engines.
 */
function contrast(foreground: Oklch, background: Oklch): number {
  const naive = ratioBetweenLuminances(
    relativeLuminance(naiveSrgbChannels(foreground)),
    relativeLuminance(naiveSrgbChannels(background)),
  );
  const gamutMapped = ratioBetweenLuminances(
    relativeLuminance(gamutMappedSrgbChannels(foreground)),
    relativeLuminance(gamutMappedSrgbChannels(background)),
  );
  return Math.min(naive, gamutMapped);
}

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

/** button.tsx renders destructive buttons as literal `text-white`. */
const BUTTON_WHITE: Oklch = { l: 1, c: 0, h: 0 };

describe("design-token contrast contract (WCAG AA)", () => {
  it("parses the live token authority and pins the R5-b calibrated primaries", () => {
    // Sync-check: the contract reads the CSS directly, and the recalibrated
    // values are pinned so any future primary change fails here until the AA
    // math is consciously re-verified (hue identity + ratio tests below).
    expect(resolveToken(lightCascade("sahel"), "--primary")).toBe(
      "oklch(0.528 0.18 150)",
    );
    expect(resolveToken(lightCascade("oasis"), "--primary")).toBe(
      "oklch(0.525 0.135 205)",
    );
    expect(resolveToken(lightCascade("atlas"), "--primary")).toBe(
      "oklch(0.54 0.2 286)",
    );
    expect(resolveToken(lightCascade("dune"), "--primary")).toBe(
      "oklch(0.55 0.145 63)",
    );
  });

  it("keeps white-on-primary buttons and primary-as-text links AA in every light preset", () => {
    for (const preset of PRESETS) {
      const cascade = lightCascade(preset);
      const primary = colorToken(cascade, "--primary");
      const primaryForeground = colorToken(cascade, "--primary-foreground");
      const background = colorToken(cascade, "--background");
      const card = colorToken(cascade, "--card");

      const onPrimary = contrast(primaryForeground, primary);
      const linkOnBackground = contrast(primary, background);
      const linkOnCard = contrast(primary, card);

      expect(
        onPrimary,
        `${preset} light: --primary-foreground on --primary (button label)`,
      ).toBeGreaterThanOrEqual(AA_PRIMARY_FLOOR);
      expect(
        linkOnBackground,
        `${preset} light: --primary as text on --background (link)`,
      ).toBeGreaterThanOrEqual(AA_PRIMARY_FLOOR);
      expect(
        linkOnCard,
        `${preset} light: --primary as text on --card (link on card)`,
      ).toBeGreaterThanOrEqual(AA_PRIMARY_FLOOR);

      // --ring must stay derived from the primary so focus rings follow the
      // accent identity (R1-b derivation contract).
      expect(resolveToken(cascade, "--ring")).toBe(
        resolveToken(cascade, "--primary"),
      );
    }
  });

  it("keeps dark-mode primary pairs AA in every preset and the no-preset fallback", () => {
    const cascades: Array<[string, Declarations[]]> = [
      ...PRESETS.map(
        (preset) => [preset, darkCascade(preset)] as [string, Declarations[]],
      ),
      ["fallback (no data-theme-preset)", darkCascade("fallback")] as [
        string,
        Declarations[],
      ],
    ];

    for (const [label, cascade] of cascades) {
      const primary = colorToken(cascade, "--primary");
      const primaryForeground = colorToken(cascade, "--primary-foreground");
      const background = colorToken(cascade, "--background");
      const card = colorToken(cascade, "--card");

      expect(
        contrast(primaryForeground, primary),
        `${label} dark: --primary-foreground on --primary`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(primary, background),
        `${label} dark: --primary as text on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(primary, card),
        `${label} dark: --primary as text on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(resolveToken(cascade, "--ring")).toBe(
        resolveToken(cascade, "--primary"),
      );
    }
  });

  it("preserves each preset's hue identity (±8° of the founding accent hue)", () => {
    for (const preset of PRESETS) {
      const lightPrimary = colorToken(lightCascade(preset), "--primary");
      expect(hueDistance(lightPrimary.h, LIGHT_HUE_REFERENCE[preset])).toBeLessThanOrEqual(8);

      const darkPrimary = colorToken(darkCascade(preset), "--primary");
      expect(hueDistance(darkPrimary.h, DARK_HUE_REFERENCE[preset])).toBeLessThanOrEqual(8);
    }
    const fallbackPrimary = colorToken(darkCascade("fallback"), "--primary");
    expect(hueDistance(fallbackPrimary.h, DARK_HUE_REFERENCE.sahel)).toBeLessThanOrEqual(8);
  });

  it("keeps neutral and tinted text pairs AA in both modes for every preset", () => {
    for (const preset of PRESETS) {
      const light = lightCascade(preset);
      const background = colorToken(light, "--background");
      const card = colorToken(light, "--card");

      expect(
        contrast(colorToken(light, "--muted-foreground"), background),
        `${preset} light: --muted-foreground on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(light, "--muted-foreground"), card),
        `${preset} light: --muted-foreground on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(light, "--secondary-foreground"), colorToken(light, "--secondary")),
        `${preset} light: --secondary-foreground on --secondary`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(light, "--accent-foreground"), colorToken(light, "--accent")),
        `${preset} light: --accent-foreground on --accent`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(light, "--foreground"), background),
        `${preset} light: --foreground on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

      const dark = darkCascade(preset);
      const darkBackground = colorToken(dark, "--background");
      const darkCard = colorToken(dark, "--card");
      expect(
        contrast(colorToken(dark, "--muted-foreground"), darkBackground),
        `${preset} dark: --muted-foreground on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(dark, "--muted-foreground"), darkCard),
        `${preset} dark: --muted-foreground on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(dark, "--foreground"), darkBackground),
        `${preset} dark: --foreground on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(colorToken(dark, "--foreground"), darkCard),
        `${preset} dark: --foreground on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("keeps the destructive token AA in its rendered roles in both modes", () => {
    const lightDestructive = colorToken([globalsLightRoot], "--destructive");
    const darkDestructive = colorToken([globalsDark], "--destructive");

    // Light: solid destructive buttons/badges render literal white text
    // (ui/button.tsx: "bg-destructive text-white").
    expect(
      contrast(BUTTON_WHITE, lightDestructive),
      "light: white on --destructive (destructive button)",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

    // Light: destructive as alert text on every preset canvas/card.
    for (const preset of PRESETS) {
      const cascade = lightCascade(preset);
      expect(
        contrast(lightDestructive, colorToken(cascade, "--background")),
        `${preset} light: --destructive as text on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(lightDestructive, colorToken(cascade, "--card")),
        `${preset} light: --destructive as text on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }

    // Dark: --destructive's rendered role is colored text on the neutral
    // charcoal stack (solid dark buttons use bg-destructive/60 instead).
    const darkBackground = colorToken(darkCascade("sahel"), "--background");
    const darkCard = colorToken(darkCascade("sahel"), "--card");
    expect(
      contrast(darkDestructive, darkBackground),
      "dark: --destructive as text on --background",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(
      contrast(darkDestructive, darkCard),
      "dark: --destructive as text on --card",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});
