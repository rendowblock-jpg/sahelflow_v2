import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * Not gated here (documented, owned elsewhere):
 *   - White on SOLID dark --destructive measures 2.89:1, but every rendered
 *     dark button/badge uses bg-destructive/60 (5.95:1+); dark --destructive
 *     is asserted for its real role: colored text on dark surfaces.
 *   - Light --warning's latent solid pair (dark --warning-foreground text on
 *     solid amber) measures 3.76:1 but never renders: every warning surface in
 *     the app is text-warning / bg-warning tints (dots carry no text). Asserted
 *     for its real role below: warning-as-text on every canvas/card.
 *
 * GATED HERE since the Wave 6 preflight (previously excluded by R5-b):
 *   - --primary-hover (color-mix 88% primary / 12% black) replaces the old
 *     alpha hovers (hover:bg-primary/90) that lifted light primaries toward
 *     the near-white card and landed at 3.90-4.40:1. Darkening toward black
 *     can only increase white-on-primary contrast — asserted per preset,
 *     per mode, plus the no-preset dark fallback.
 *   - --success/--warning/--info semantics in their rendered role (colored
 *     text on canvas/card tints) and the solid -foreground pairs that render
 *     or are latent-but-passing: light success/info solid, dark success/
 *     warning/info solid (dark info now follows the light-accent + dark-text
 *     pattern instead of the old 2.62:1 white-on-info).
 */

const AA_NORMAL_TEXT = 4.5;
/** R5-b calibration margin above 4.5 that absorbs engine gamut-mapping variance. */
const AA_PRIMARY_FLOOR = 4.55;

const PRESETS = ["sahel", "atlas", "oasis", "dune"] as const;
type PresetName = (typeof PRESETS)[number];
/** The fifth look. Its primary is graphite/cream ink, so the hue-identity contract below does not apply to it (see the carnet block at the end). */
const LOOKS = [...PRESETS, "carnet"] as const;
type LookName = (typeof LOOKS)[number];

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

function lightCascade(preset: LookName): Declarations[] {
  if (preset === "sahel") return [productLightRoot];
  return [
    mergedDeclarations(productBlocks, `html[data-theme-preset="${preset}"]`),
    productLightRoot,
  ];
}

function darkCascade(preset: LookName | "fallback"): Declarations[] {
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

/**
 * color-mix(in oklch, var(--primary) 88%, black) at unit alphas reduces to
 * straight interpolation toward black: L and chroma scale by 0.88, hue rides
 * the chromatic endpoint (black carries no hue of its own).
 */
function primaryHoverMix(primary: Oklch): Oklch {
  return { l: primary.l * 0.88, c: primary.c * 0.88, h: primary.h };
}

/**
 * A text colour on a surface that is `tint` painted at `alpha` over `base`: what a browser renders for
 * `background-color: color-mix(in oklch, <tint> <alpha>%, transparent)` on top of an opaque parent. Composited in
 * sRGB 8-bit like a browser, and (as in contrast()) the worse of the naive and the gamut-mapped conversions.
 */
function contrastOnTint(text: Oklch, tint: Oklch, alpha: number, base: Oklch): number {
  const ratioWith = (toChannels: (color: Oklch) => [number, number, number]): number => {
    const tinted = toChannels(tint);
    const parent = toChannels(base);
    const surface = tinted.map((channel, index) =>
      Math.round(channel * alpha + (parent[index] ?? 0) * (1 - alpha)),
    );
    return ratioBetweenLuminances(relativeLuminance(toChannels(text)), relativeLuminance(surface));
  };
  return Math.min(ratioWith(naiveSrgbChannels), ratioWith(gamutMappedSrgbChannels));
}

/** The authored strength of `--color-primary-subtle` (the selected-row tint), read from globals.css. */
function primarySubtleAlpha(): number {
  for (const block of globalsBlocks) {
    const value = block.declarations.get("--color-primary-subtle");
    if (value === undefined) continue;
    const match = value.match(/var\(--primary\)\s+(\d+(?:\.\d+)?)%/);
    if (!match?.[1]) throw new Error(`--color-primary-subtle is not a primary color-mix: ${value}`);
    return Number(match[1]) / 100;
  }
  throw new Error("--color-primary-subtle is not defined in globals.css.");
}

describe("design-token contrast contract (WCAG AA)", () => {
  it("parses the live token authority and pins the R5-b calibrated primaries", () => {
    // Sync-check: the contract reads the CSS directly, and the recalibrated
    // values are pinned so any future primary change fails here until the AA
    // math is consciously re-verified (hue identity + ratio tests below).
    expect(resolveToken(lightCascade("sahel"), "--primary")).toBe(
      "oklch(0.515 0.18 150)",
    );
    expect(resolveToken(lightCascade("oasis"), "--primary")).toBe(
      "oklch(0.511 0.135 205)",
    );
    expect(resolveToken(lightCascade("atlas"), "--primary")).toBe(
      "oklch(0.54 0.2 286)",
    );
    expect(resolveToken(lightCascade("dune"), "--primary")).toBe(
      "oklch(0.55 0.145 63)",
    );
  });

  it("keeps white-on-primary buttons and primary-as-text links AA in every light preset", () => {
    for (const preset of LOOKS) {
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
      ...LOOKS.map(
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
    for (const preset of LOOKS) {
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

  it("pins the feedback semantic calibration and keeps their rendered text roles AA", () => {
    // Sync-check: rendered roles are colored text on tinted fills (see
    // consumers: operational-state, notification-taxonomy, status badges,
    // attention-center, command palette). Calibrated in the Wave 6 preflight.
    expect(resolveToken([globalsLightRoot], "--success")).toBe(
      "oklch(0.51 0.2 145)",
    );
    expect(resolveToken([globalsLightRoot], "--warning")).toBe(
      "oklch(0.543 0.16 72)",
    );
    expect(resolveToken([globalsLightRoot], "--info")).toBe(
      "oklch(0.52 0.18 240)",
    );
    expect(resolveToken([globalsDark], "--info-foreground")).toBe(
      "oklch(0.16 0.03 240)",
    );

    const pairs: Array<[string, Oklch]> = [
      ["--success", colorToken([globalsLightRoot], "--success")],
      ["--warning", colorToken([globalsLightRoot], "--warning")],
      ["--info", colorToken([globalsLightRoot], "--info")],
    ];
    for (const preset of PRESETS) {
      const cascade = lightCascade(preset);
      for (const [name, color] of pairs) {
        expect(
          contrast(color, colorToken(cascade, "--background")),
          `${preset} light: ${name} as text on --background`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        expect(
          contrast(color, colorToken(cascade, "--card")),
          `${preset} light: ${name} as text on --card`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }

    const darkPairs: Array<[string, Oklch]> = [
      ["--success", colorToken([globalsDark], "--success")],
      ["--warning", colorToken([globalsDark], "--warning")],
      ["--info", colorToken([globalsDark], "--info")],
    ];
    const darkBackground = colorToken(darkCascade("sahel"), "--background");
    const darkCard = colorToken(darkCascade("sahel"), "--card");
    for (const [name, color] of darkPairs) {
      expect(
        contrast(color, darkBackground),
        `dark: ${name} as text on --background`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(
        contrast(color, darkCard),
        `dark: ${name} as text on --card`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("keeps the solid feedback foreground pairs AA where they render or pass", () => {
    // Light: success/info solid chips carry near-white foreground text.
    expect(
      contrast(
        colorToken([globalsLightRoot], "--success-foreground"),
        colorToken([globalsLightRoot], "--success"),
      ),
      "light: --success-foreground on --success",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(
      contrast(
        colorToken([globalsLightRoot], "--info-foreground"),
        colorToken([globalsLightRoot], "--info"),
      ),
      "light: --info-foreground on --info",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);

    // Dark: every feedback accent is a light color carrying dark text
    // (success/warning always did; info joined them in the Wave 6 preflight).
    for (const name of ["--success", "--warning", "--info"] as const) {
      expect(
        contrast(
          colorToken([globalsDark], `${name}-foreground`),
          colorToken([globalsDark], name),
        ),
        `dark: ${name}-foreground on ${name}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("keeps --primary-hover AA in every preset, mode and the dark fallback", () => {
    // The hover authority is a color-mix TOWARD BLACK, so white-on-primary
    // contrast can only improve — but dark presets darken a LIGHT primary
    // under dark text, which reduces contrast. Both directions are gated.
    expect(resolveToken([globalsLightRoot], "--primary-hover")).toBe(
      "color-mix(in oklch, var(--primary) 88%, black)",
    );

    for (const preset of LOOKS) {
      const light = lightCascade(preset);
      expect(
        contrast(
          colorToken(light, "--primary-foreground"),
          primaryHoverMix(colorToken(light, "--primary")),
        ),
        `${preset} light: --primary-foreground on --primary-hover`,
      ).toBeGreaterThanOrEqual(AA_PRIMARY_FLOOR);

      const dark = darkCascade(preset);
      expect(
        contrast(
          colorToken(dark, "--primary-foreground"),
          primaryHoverMix(colorToken(dark, "--primary")),
        ),
        `${preset} dark: --primary-foreground on --primary-hover`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }

    const fallback = darkCascade("fallback");
    expect(
      contrast(
        colorToken(fallback, "--primary-foreground"),
        primaryHoverMix(colorToken(fallback, "--primary")),
      ),
      "fallback dark: --primary-foreground on --primary-hover",
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("source-contract: interactive primaries hover with the token, not alpha", () => {
    // Alpha hovers (hover:bg-primary/90) lift light primaries toward the
    // near-white card and drop below AA — the exclusion R5-b documented and
    // the preflight closed. The primitives must consume the token.
    const button = source("../../ui/button.tsx");
    const badge = source("../../ui/badge.tsx");
    for (const [file, body] of [
      ["button.tsx", button],
      ["badge.tsx", badge],
    ] as const) {
      expect(body, `${file} uses the hover token`).toContain(
        "hover:bg-primary-hover",
      );
      expect(body, `${file} must not alpha-hover the primary`).not.toContain(
        "hover:bg-primary/90",
      );
    }
  });

  it("keeps text readable on a selected table row (the primary tint over the card) in every preset and mode", () => {
    // data-table.tsx paints a selected row with bg-primary-subtle. The order number in it is a primary-coloured link,
    // so the link has to pass on the TINTED surface, not only on the plain card (the plain-card pairs are asserted
    // above). Measured in real Chromium on 27 Oct 2026, before the sahel and oasis primaries were lowered by 0.013: #008528 on #f0f5ef = 4.39:1.
    const alpha = primarySubtleAlpha();
    const failures: string[] = [];
    const check = (label: string, ratio: number) => {
      if (ratio < AA_NORMAL_TEXT) failures.push(`${label}: ${ratio.toFixed(2)}:1`);
    };
    for (const preset of PRESETS) {
      for (const [mode, cascade] of [
        ["light", lightCascade(preset)],
        ["dark", darkCascade(preset)],
      ] as const) {
        const primary = colorToken(cascade, "--primary");
        for (const surfaceToken of ["--card", "--background"] as const) {
          const base = colorToken(cascade, surfaceToken);
          check(`${preset} ${mode}: --primary link on selected row over ${surfaceToken}`, contrastOnTint(primary, primary, alpha, base));
          // Status text a table cell can hold (risk score, stock level, payment state): text-success / -warning / -info / -destructive.
          for (const status of ["--success", "--warning", "--info", "--destructive"] as const) {
            check(`${preset} ${mode}: ${status} text on selected row over ${surfaceToken}`, contrastOnTint(colorToken([mode === "light" ? globalsLightRoot : globalsDark], status), primary, alpha, base));
          }
          check(`${preset} ${mode}: --foreground on selected row over ${surfaceToken}`, contrastOnTint(colorToken(cascade, "--foreground"), primary, alpha, base));
          check(`${preset} ${mode}: --muted-foreground on selected row over ${surfaceToken}`, contrastOnTint(colorToken(cascade, "--muted-foreground"), primary, alpha, base));
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

const CARNET_LIGHT = 'html[data-theme-preset="carnet"]';
const CARNET_DARK = 'html.dark[data-theme-preset="carnet"]';
const SURFACES = [
  ["desk", "--sidebar"],
  ["sunk", "--muted"],
  ["paper", "--background"],
  ["sheet", "--card"],
] as const;
const NON_COLOUR = new Set(["--radius", "--radius-control", "--radius-surface", "--sf-font-mono"]);
const CARNET_MODES = ["light", "dark"] as const;

function carnetCascade(mode: "light" | "dark"): Declarations[] {
  return mode === "light"
    ? [mergedDeclarations(productBlocks, CARNET_LIGHT), productLightRoot, globalsLightRoot]
    : [mergedDeclarations(presetBlocks, CARNET_DARK), darkNeutralBase, globalsDark];
}

function carnetOwn(mode: "light" | "dark"): Declarations {
  return mode === "light" ? mergedDeclarations(productBlocks, CARNET_LIGHT) : mergedDeclarations(presetBlocks, CARNET_DARK);
}

function hexOf(color: Oklch): string {
  return naiveSrgbChannels(color).map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase();
}

describe("carnet (the fifth look): the paper ledger, light and night", () => {
  it("defines a light block and a dark block, and the dark block overrides every colour token of the light one", () => {
    const light = carnetOwn("light");
    const dark = carnetOwn("dark");
    for (const name of ["--background", "--foreground", "--card", "--popover", "--primary", "--primary-foreground", "--muted", "--muted-foreground", "--secondary", "--border", "--input", "--ring", "--sidebar", "--chart-1", "--chart-5", "--destructive", "--success", "--warning", "--info", "--success-foreground", "--warning-foreground", "--info-foreground", "--carnet-ink-3", "--radius"]) {
      expect(light.has(name), `light block defines ${name}`).toBe(true);
    }
    for (const name of light.keys()) {
      if (NON_COLOUR.has(name)) continue;
      expect(dark.has(name), `dark block overrides ${name}`).toBe(true);
    }
  });

  it("keeps four surface steps (desk, sunk, paper, sheet) at least 0.02 OKLab L apart in both modes", () => {
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const lightness = SURFACES.map(([, token]) => colorToken(cascade, token).l);
      for (let index = 1; index < lightness.length; index += 1) {
        const step = (lightness[index] ?? 0) - (lightness[index - 1] ?? 0);
        expect(step, `${mode}: ${SURFACES[index - 1]?.[0]} -> ${SURFACES[index]?.[0]} step`).toBeGreaterThanOrEqual(0.02);
      }
      expect(resolveToken(cascade, "--popover")).toBe(resolveToken(cascade, "--card"));
      expect(resolveToken(cascade, "--secondary")).toBe(resolveToken(cascade, "--muted"));
    }
  });

  it("reads body text >= 7:1, secondary >= 4.5:1, meta ink >= 4.5:1 and control edges >= 3:1 on all four surfaces", () => {
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      for (const [surface, token] of SURFACES) {
        const ground = colorToken(cascade, token);
        expect(contrast(colorToken(cascade, "--foreground"), ground), `${mode}: ink on ${surface}`).toBeGreaterThanOrEqual(7);
        expect(contrast(colorToken(cascade, "--muted-foreground"), ground), `${mode}: ink2 on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colorToken(cascade, "--carnet-ink-3"), ground), `${mode}: ink3 on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colorToken(cascade, "--input"), ground), `${mode}: control edge on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("makes the primary action ink (no brand hue) with AA pairs, an ink focus ring and the shared hover token", () => {
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const primary = colorToken(cascade, "--primary");
      expect(primary.c, `${mode}: primary is near-neutral ink`).toBeLessThanOrEqual(0.02);
      expect(resolveToken(cascade, "--primary")).toBe(resolveToken(cascade, "--foreground"));
      expect(resolveToken(cascade, "--ring")).toBe(resolveToken(cascade, "--primary"));
      expect(resolveToken(cascade, "--sidebar-primary")).toBe(resolveToken(cascade, "--primary"));
      const floor = mode === "light" ? AA_PRIMARY_FLOOR : AA_NORMAL_TEXT;
      expect(contrast(colorToken(cascade, "--primary-foreground"), primary), `${mode}: label on primary`).toBeGreaterThanOrEqual(floor);
      expect(contrast(colorToken(cascade, "--primary-foreground"), primaryHoverMix(primary)), `${mode}: label on hover`).toBeGreaterThanOrEqual(floor);
      for (const token of ["--background", "--card"] as const) {
        expect(contrast(primary, colorToken(cascade, token)), `${mode}: primary as text on ${token}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("owns the feedback colours and keeps them AA as text on paper, sheet and sunk, on their tints, and as solid pairs", () => {
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const own = carnetOwn(mode);
      for (const name of ["--destructive", "--success", "--warning", "--info", "--success-foreground", "--warning-foreground", "--info-foreground"]) {
        expect(own.has(name), `${mode}: carnet sets ${name}`).toBe(true);
      }
      for (const status of ["--destructive", "--success", "--warning", "--info"] as const) {
        for (const [surface, token] of SURFACES.filter(([name]) => name !== "desk")) {
          expect(contrast(colorToken(cascade, status), colorToken(cascade, token)), `${mode}: ${status} text on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
      for (const [text, tint] of [
        ["--carnet-red-ink", "--carnet-red-bg"],
        ["--carnet-green-ink", "--carnet-green-bg"],
        ["--carnet-brass-fg", "--carnet-brass-bg"],
        ["--carnet-blue-ink", "--carnet-blue-bg"],
        ["--foreground", "--carnet-slip-out"],
        ["--foreground", "--carnet-slip-in"],
      ] as const) {
        expect(contrast(colorToken(cascade, text), colorToken(cascade, tint)), `${mode}: ${text} on ${tint}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
      for (const status of ["--success", "--warning", "--info"] as const) {
        expect(contrast(colorToken(cascade, `${status}-foreground`), colorToken(cascade, status)), `${mode}: ${status}-foreground on ${status}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
      for (const name of ["--carnet-red-ink", "--carnet-green-ink", "--carnet-brass-fg", "--carnet-blue-ink"]) {
        for (const [surface, token] of SURFACES) {
          expect(contrast(colorToken(cascade, name), colorToken(cascade, token)), `${mode}: ${name} on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
    }
    // Light solid destructive buttons render literal white text; dark ones use bg-destructive/60 (see the note at the top).
    expect(contrast(BUTTON_WHITE, colorToken(carnetCascade("light"), "--destructive")), "light: white on --destructive").toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it("derives five distinct analytic colours that reach 3:1 on the card and the page in both modes", () => {
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const seen = new Set<string>();
      for (const name of ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]) {
        seen.add(resolveToken(cascade, name));
        for (const token of ["--card", "--background"] as const) {
          expect(contrast(colorToken(cascade, name), colorToken(cascade, token)), `${mode}: ${name} on ${token}`).toBeGreaterThanOrEqual(3);
        }
      }
      expect(seen.size, `${mode}: five different chart colours`).toBe(5);
    }
  });

  it("keeps text readable on a selected table row in both modes", () => {
    const alpha = primarySubtleAlpha();
    const failures: string[] = [];
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const primary = colorToken(cascade, "--primary");
      for (const token of ["--card", "--background"] as const) {
        const base = colorToken(cascade, token);
        for (const name of ["--primary", "--foreground", "--muted-foreground", "--success", "--warning", "--info", "--destructive"] as const) {
          const ratio = contrastOnTint(colorToken(cascade, name), primary, alpha, base);
          if (ratio < AA_NORMAL_TEXT) failures.push(`${mode}: ${name} on selected row over ${token}: ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("reads as ruled paper: controls 4px, cards 6px, nothing past 10px, light block only", () => {
    const light = carnetOwn("light");
    expect(light.get("--radius-control")).toBe("0.25rem");
    expect(light.get("--radius-surface")).toBe("0.375rem");
    expect(light.get("--radius")).toBe("0.375rem");
    expect(carnetOwn("dark").has("--radius")).toBe(false);
    // The older presets leave the radii to globals.css; carnet is the only look that sets them.
    expect(productLightRoot.has("--radius")).toBe(false);
    for (const preset of ["atlas", "oasis", "dune"] as const) {
      const block = mergedDeclarations(productBlocks, `html[data-theme-preset="${preset}"]`);
      expect(block.has("--radius"), `${preset} keeps its own radii`).toBe(false);
      expect(block.has("--radius-surface"), `${preset} keeps its own card radius`).toBe(false);
    }
  });

  it("keeps the hex of every literal in a comment and the oklch literal round-trips to it", () => {
    const check = (css: string, selector: string, label: string) => {
      const start = css.indexOf(selector + " {");
      expect(start, `${label} block exists`).toBeGreaterThanOrEqual(0);
      const body = css.slice(start, css.indexOf("}", start));
      const lines = body.split("\n").filter((line) => /oklch\(/.test(line) && !/\/\s*[\d.]+\)/.test(line));
      expect(lines.length, `${label} has literal colours`).toBeGreaterThan(20);
      for (const line of lines) {
        const match = line.match(/(--[\w-]+):\s*(oklch\([^)]*\));\s*\/\*\s*#([0-9A-F]{6})/);
        expect(match, `${label}: ${line.trim()} needs a trailing /* #HEX */ comment`).not.toBeNull();
        expect(hexOf(parseOklch(match?.[2] ?? "")), `${label}: ${match?.[1]} round-trips`).toBe(match?.[3]);
      }
    };
    check(source("../../../app/product-system.css"), CARNET_LIGHT, "light");
    check(source("../../../app/theme-preset-system.css"), CARNET_DARK, "dark");
  });

  it("maps the mono token to Plex Mono under carnet only and loads the font like the other local fonts", () => {
    expect(carnetOwn("light").get("--sf-font-mono")).toMatch(/^var\(--font-plex-mono\)/);
    expect(source("../../../app/globals.css")).toContain("var(--sf-font-mono, ui-monospace");
    const layout = source("../../../app/layout.tsx");
    expect(layout).toContain('variable: "--font-plex-mono"');
    expect(layout).toContain("plexMono.variable");
    for (const file of ["ibmplexmono-400-latin.woff2", "ibmplexmono-500-latin.woff2"]) {
      expect(layout).toContain(file);
      expect(readFileSync(new URL(`../../../app/fonts/${file}`, import.meta.url)).byteLength).toBeGreaterThan(10_000);
    }
    expect(readFileSync(new URL("../../../../src-tauri/licenses/IBMPlexMono-OFL.txt", import.meta.url), "utf8")).toContain("SIL OPEN FONT LICENSE");
  });

  it("keeps the settings preview swatch in step with the dark carnet tokens", () => {
    const panel = source("../../settings/appearance-panel.tsx");
    const start = panel.indexOf("carnet: {");
    expect(start).toBeGreaterThanOrEqual(0);
    const entry = panel.slice(start, panel.indexOf("},", start));
    const dark = carnetCascade("dark");
    expect(entry).toContain(resolveToken(dark, "--card")) ;
    expect(entry).toContain(resolveToken(dark, "--sidebar"));
    expect(entry).toContain(resolveToken(dark, "--primary"));
  });
});

describe("carnet identity layer: margin colour and stamp contrast", () => {
  const identityBlocks = parseBlocks(source("../../../app/carnet-identity.css"));
  const stamp = mergedDeclarations(identityBlocks, 'html[data-theme-preset="carnet"] .carnet-stamp');

  it("defines --carnet-margin in both modes, equal to the design hex", () => {
    expect(hexOf(colorToken([carnetOwn("light")], "--carnet-margin"))).toBe("D69A8E");
    expect(hexOf(colorToken([carnetOwn("dark")], "--carnet-margin"))).toBe("7B3B32");
  });

  it.each(CARNET_MODES)("keeps the stamp's red text on its tint above the AA floor (%s)", (mode) => {
    const layers = [stamp, ...carnetCascade(mode)];
    const ratio = contrast(colorToken(layers, "--stamp-ink"), colorToken(layers, "--stamp-tint"));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

/*
 * Wave 3 accessibility matrix (look carnet, 3 locales x light/dark x phone/desktop): 25 cells failed, all the rule
 * color-contrast, from four causes. Each test below reads the class that renders the pair from the SOURCE file, so
 * it fails while that class is wrong and passes once it is fixed. Thresholds are the WCAG AA ones (4.5:1, 14 px text).
 */

/** The class names of the first string literal that starts with `anchor`. */
function literalClasses(src: string, anchor: string): string[] {
  const start = src.indexOf(anchor);
  if (start < 0) throw new Error(`"${anchor}" not found in the source under test`);
  const end = src.indexOf('"', start + anchor.length);
  return src.slice(start, end).split(/\s+/);
}

/** A colour of Tailwind's own palette (red-300), read from the installed theme.css. */
function tailwindPalette(name: string): Oklch {
  const css = source("../../../../node_modules/tailwindcss/theme.css");
  const match = css.match(new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)(%?)\\s+([\\d.]+)\\s+([\\d.]+)`));
  if (!match) throw new Error(`--color-${name} is not in tailwindcss/theme.css`);
  return { l: Number(match[1]) / (match[2] === "%" ? 100 : 1), c: Number(match[3]), h: Number(match[4]) };
}

/** Text drawn at `alpha` over `ground` (text-foreground/60), composited in 8-bit sRGB; the worse of the two conversions. */
function contrastOfAlphaText(text: Oklch, alpha: number, ground: Oklch): number {
  const ratioWith = (toChannels: (color: Oklch) => [number, number, number]): number => {
    const ink = toChannels(text);
    const behind = toChannels(ground);
    const shown = ink.map((channel, index) => Math.round(channel * alpha + (behind[index] ?? 0) * (1 - alpha)));
    return ratioBetweenLuminances(relativeLuminance(shown), relativeLuminance(behind));
  };
  return Math.min(ratioWith(naiveSrgbChannels), ratioWith(gamutMappedSrgbChannels));
}

/** The authored strength of `--color-destructive-soft` / `-subtle` (a color-mix of --destructive), read from globals.css. */
function destructiveTintAlpha(kind: string): number {
  for (const block of globalsBlocks) {
    const value = block.declarations.get(`--color-destructive-${kind}`);
    if (value === undefined) continue;
    const match = value.match(/var\(--destructive\)\s+(\d+(?:\.\d+)?)%/);
    if (!match?.[1]) throw new Error(`--color-destructive-${kind} is not a destructive color-mix: ${value}`);
    return Number(match[1]) / 100;
  }
  throw new Error(`--color-destructive-${kind} is not defined in globals.css.`);
}

describe("accessibility matrix: the four color-contrast causes (carnet, light and dark)", () => {
  it("cause 1: an inactive tab label reaches 4.5:1 on the tab list, the page and a card", () => {
    const tabs = source("../../ui/tabs.tsx");
    const classes = literalClasses(tabs, "relative inline-flex h-[calc(100%-1px)]");
    const plain = classes.find((name) => /^text-(foreground|muted-foreground)(\/\d+)?$/.test(name));
    expect(plain, "tabs.tsx sets one plain light text colour on the tab").toBeDefined();
    expect(classes, "tabs.tsx sets the dark text colour on the tab").toContain("dark:text-muted-foreground");
    const parts = (plain ?? "").match(/^text-(foreground|muted-foreground)(?:\/(\d+))?$/);
    const lightToken = `--${parts?.[1] ?? "foreground"}`;
    const lightAlpha = parts?.[2] ? Number(parts[2]) / 100 : 1;
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const token = mode === "light" ? lightToken : "--muted-foreground";
      const alpha = mode === "light" ? lightAlpha : 1;
      for (const [surface, ground] of [["the tab list (bg-muted)", "--muted"], ["the page", "--background"], ["a card", "--card"]] as const) {
        const ratio = contrastOfAlphaText(colorToken(cascade, token), alpha, colorToken(cascade, ground));
        expect(ratio, `${mode}: inactive tab label (${plain}) on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it("cause 2: the blacklist button's red label reaches 4.5:1 on its dark outline fill, at rest and on hover", () => {
    const outline = source("../../ui/button.tsx").match(/\boutline:\s*"([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
    const restFill = outline.find((name) => /^dark:bg-input\/\d+$/.test(name))?.match(/\/(\d+)$/)?.[1];
    const hoverFill = outline.find((name) => /^dark:hover:bg-input\/\d+$/.test(name))?.match(/\/(\d+)$/)?.[1];
    expect(restFill, "button.tsx: the outline variant fills with dark:bg-input/N").toBeDefined();
    expect(hoverFill, "button.tsx: the outline variant hovers with dark:hover:bg-input/N").toBeDefined();
    const toggle = source("../../customers/blacklist-toggle.tsx");
    const used = toggle.match(/variant="outline"\s+size="sm"\s+onClick=\{\(\) => setAddOpen\(true\)\}\s+className="([^"]*)"/)?.[1]?.split(/\s+/) ?? [];
    expect(used.length, "blacklist-toggle.tsx: the outline Add button is found").toBeGreaterThan(0);
    const dark = carnetCascade("dark");
    const colourOf = (name: string | undefined, fallback: string): Oklch => {
      const palette = name?.match(/^dark:(?:hover:)?text-(red-\d+)$/)?.[1];
      return palette ? tailwindPalette(palette) : colorToken(dark, fallback);
    };
    const restText = colourOf(used.find((name) => /^dark:text-/.test(name)), "--destructive");
    const hoverText = colourOf(used.find((name) => /^dark:hover:text-/.test(name)), "--destructive");
    for (const [surface, token] of [["the page", "--background"], ["a card", "--card"]] as const) {
      const base = colorToken(dark, token);
      const input = colorToken(dark, "--input");
      expect(contrastOnTint(restText, input, Number(restFill) / 100, base), `dark: label at rest on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastOnTint(hoverText, input, Number(hoverFill) / 100, base), `dark: label on hover on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it("cause 3: the issues chip in the automation builder header reaches 4.5:1 on its red tint, on the page and a card", () => {
    const builder = source("../../automations/automation-builder.tsx");
    const chip = literalClasses(builder, "flex shrink-0 items-center gap-1 rounded-full bg-destructive-");
    expect(chip, "the chip text is the destructive ink").toContain("text-destructive-ink");
    const kind = chip.find((name) => /^bg-destructive-(soft|subtle)$/.test(name))?.replace("bg-destructive-", "");
    expect(kind, "the chip is filled with a destructive tint").toBeDefined();
    const alpha = destructiveTintAlpha(kind ?? "soft");
    for (const mode of CARNET_MODES) {
      const cascade = carnetCascade(mode);
      const red = colorToken(cascade, "--destructive");
      const ink = mode === "light" ? feedbackInk(lightFeedbackCascade("carnet"), "destructive") : red;
      for (const [surface, token] of [["the page", "--background"], ["a card", "--card"]] as const) {
        const ratio = contrastOnTint(ink, red, alpha, colorToken(cascade, token));
        expect(ratio, `${mode}: red label on bg-destructive-${kind} over ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it("cause 4: the select placeholder is muted-foreground (no opacity) and that token reaches 4.5:1 on the page, a card and the sunk step in every look", () => {
    const select = source("../../ui/select.tsx");
    expect(select, "select.tsx colours the placeholder with muted-foreground").toContain("data-[placeholder]:text-muted-foreground");
    expect(select, "select.tsx does not fade the placeholder").not.toMatch(/data-\[placeholder\]:text-muted-foreground\/\d+/);
    for (const look of LOOKS) {
      for (const [mode, cascade] of [["light", lightCascade(look)], ["dark", darkCascade(look)]] as const) {
        for (const ground of ["--background", "--card", "--muted"]) {
          expect(contrast(colorToken(cascade, "--muted-foreground"), colorToken(cascade, ground)), `${look} ${mode}: placeholder on ${ground}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
    }
  });
});

/*
 * Wave 3b round 2 (w195): "ink on a tint". A feedback colour (text-destructive, text-success, text-warning, text-info)
 * is tuned to be AA on the page and on a card. Laid on its OWN tint (bg-<kind>-soft, 8%) it loses contrast, and it loses
 * more on every surface darker than a card: the sunk step, the desk, a hovered row, a selected row. The class is fixed by
 * one token per colour, --<kind>-ink (a mix toward black, light mode only), used as text-<kind>-ink on those tints.
 * Surfaces: table.tsx hovers a row with bg-muted/50 and selects it with bg-muted; the data tables sit on the page or on a
 * card; the selected-row case above is the 4% primary tint over the card; the sidebar is the desk.
 */
const FEEDBACK_KINDS = ["destructive", "success", "warning", "info"] as const;
type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
const TINT_STEPS = ["subtle", "soft", "strong"] as const;
type ChipSurface = { name: string; base: string; over?: { token: string; alpha: number } };
const CHIP_SURFACES: ReadonlyArray<ChipSurface> = [
  { name: "the desk (sidebar)", base: "--sidebar" },
  { name: "the sunk step (bg-muted)", base: "--muted" },
  { name: "the page", base: "--background" },
  { name: "a card", base: "--card" },
  { name: "a hovered row on the page", base: "--background", over: { token: "--muted", alpha: 0.5 } },
  { name: "a hovered row on a card", base: "--card", over: { token: "--muted", alpha: 0.5 } },
  { name: "a selected row", base: "--card", over: { token: "--primary", alpha: primarySubtleAlpha() } },
];

/** Light cascade of a look including the feedback colours that live in globals.css. */
function lightFeedbackCascade(look: LookName): Declarations[] {
  return [...lightCascade(look), globalsLightRoot];
}

/** The authored strength of `--color-<kind>-<step>` (a color-mix of --<kind> with transparent), read from globals.css. */
function feedbackTintAlpha(kind: FeedbackKind, step: string): number {
  const value = globalsBlocks.map((block) => block.declarations.get(`--color-${kind}-${step}`)).find((found) => found !== undefined);
  const match = value?.match(new RegExp(`var\\(--${kind}\\)\\s+(\\d+(?:\\.\\d+)?)%`));
  if (!match?.[1]) throw new Error(`--color-${kind}-${step} is not a ${kind} color-mix in globals.css.`);
  return Number(match[1]) / 100;
}

/**
 * What text-<kind>-ink renders in light mode: the authored mix of the colour toward black (L and chroma scale, the hue
 * rides the colour, like primaryHoverMix). Until the token exists this is the bare colour, which is what the sites render.
 */
function feedbackInk(cascade: Declarations[], kind: FeedbackKind): Oklch {
  const colour = colorToken(cascade, `--${kind}`);
  const raw = globalsLightRoot.get(`--${kind}-ink`);
  if (raw === undefined) return colour;
  const match = raw.match(new RegExp(`^color-mix\\(in oklch, var\\(--${kind}\\) (\\d+(?:\\.\\d+)?)%, black\\)$`));
  if (!match?.[1]) throw new Error(`--${kind}-ink is not a mix of --${kind} toward black: ${raw}`);
  const keep = Number(match[1]) / 100;
  return { l: colour.l * keep, c: colour.c * keep, h: colour.h };
}

/** Text on a chip: `tint` at `alpha` over the surface (an optional layer over its base), 8-bit like a browser, worse of both conversions. */
function inkOnChip(text: Oklch, tint: Oklch, alpha: number, cascade: Declarations[], surface: ChipSurface): number {
  const over = surface.over;
  const ratioWith = (toChannels: (color: Oklch) => [number, number, number]): number => {
    const ground = toChannels(colorToken(cascade, surface.base));
    const layer = over ? toChannels(colorToken(cascade, over.token)) : undefined;
    const under = over && layer ? ground.map((channel, index) => Math.round((layer[index] ?? 0) * over.alpha + channel * (1 - over.alpha))) : ground;
    const chip = toChannels(tint).map((channel, index) => Math.round(channel * alpha + (under[index] ?? 0) * (1 - alpha)));
    return ratioBetweenLuminances(relativeLuminance(toChannels(text)), relativeLuminance(chip));
  };
  return Math.min(ratioWith(naiveSrgbChannels), ratioWith(gamutMappedSrgbChannels));
}

/** Every .tsx file under src/ that ships (no __tests__ folders, no *.test.tsx). */
function shippedTsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") found.push(...shippedTsxFiles(full));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      found.push(full);
    }
  }
  return found;
}

describe("feedback ink: a feedback colour on its own tint (light, five looks)", () => {
  it("keeps the ink colour at >= 4.55:1 on every tint step over every surface a chip sits on, in every look", () => {
    const failing: string[] = [];
    for (const look of LOOKS) {
      const cascade = lightFeedbackCascade(look);
      for (const kind of FEEDBACK_KINDS) {
        const colour = colorToken(cascade, `--${kind}`);
        const ink = feedbackInk(cascade, kind);
        for (const step of TINT_STEPS) {
          for (const surface of CHIP_SURFACES) {
            const ratio = inkOnChip(ink, colour, feedbackTintAlpha(kind, step), cascade, surface);
            if (ratio < AA_PRIMARY_FLOOR) failing.push(`${look} ${kind}-${step} on ${surface.name}: ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(failing, `${failing.length} cells under ${AA_PRIMARY_FLOOR}:1, first: ${failing.slice(0, 4).join("; ")}`).toEqual([]);
  });

  it("defines one ink token per kind (a pinned 80% mix toward black in light, the colour itself in dark) and exposes it to Tailwind", () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(globalsLightRoot.get(`--${kind}-ink`), `light --${kind}-ink`).toBe(`color-mix(in oklch, var(--${kind}) 80%, black)`);
      expect(globalsDark.get(`--${kind}-ink`), `dark --${kind}-ink`).toBe(`var(--${kind})`);
      expect(globalsBlocks.some((block) => block.declarations.get(`--color-${kind}-ink`) === `var(--${kind}-ink)`), `--color-${kind}-ink`).toBe(true);
    }
  });

  it("source scan: no class string pairs a feedback tint (bg-<kind>-subtle|soft|strong or bg-<kind>/N) with the bare text-<kind>", () => {
    const literal = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;
    const offenders: string[] = [];
    const srcDir = fileURLToPath(new URL("../../../", import.meta.url));
    for (const file of shippedTsxFiles(srcDir)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(literal)) {
        const tokens = (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/);
        for (const kind of FEEDBACK_KINDS) {
          const tint = new RegExp(`^bg-${kind}(-(subtle|soft|strong)|/\\d+)$`);
          if (tokens.some((token) => tint.test(token)) && tokens.includes(`text-${kind}`)) {
            offenders.push(`${file.slice(srcDir.length)}:${text.slice(0, match.index ?? 0).split("\n").length} (${kind})`);
          }
        }
      }
    }
    expect(offenders, `${offenders.length} class strings use the bare colour on its tint, use text-<kind>-ink: ${offenders.slice(0, 5).join(", ")}`).toEqual([]);
  });
});
