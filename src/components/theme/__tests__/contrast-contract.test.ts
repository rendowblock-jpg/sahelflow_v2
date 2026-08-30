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

/**
 * color-mix(in oklch, var(--primary) 88%, black) at unit alphas reduces to
 * straight interpolation toward black: L and chroma scale by 0.88, hue rides
 * the chromatic endpoint (black carries no hue of its own).
 */
function primaryHoverMix(primary: Oklch): Oklch {
  return { l: primary.l * 0.88, c: primary.c * 0.88, h: primary.h };
}

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

  it("pins the feedback semantic calibration and keeps their rendered text roles AA", () => {
    // Sync-check: rendered roles are colored text on tinted fills (see
    // consumers: operational-state, notification-taxonomy, status badges,
    // attention-center, command palette). Calibrated in the Wave 6 preflight.
    expect(resolveToken([globalsLightRoot], "--success")).toBe(
      "oklch(0.52 0.2 145)",
    );
    expect(resolveToken([globalsLightRoot], "--warning")).toBe(
      "oklch(0.55 0.16 72)",
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

    for (const preset of PRESETS) {
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
});
