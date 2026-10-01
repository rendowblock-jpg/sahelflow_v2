/**
 * The storefront theme bridge.
 *
 * A published store is the SELLER's brand, not SahelFlow's interface. Inside a
 * storefront root every shared design token (background, card, border, muted,
 * primary, input, ring, …) is re-pointed at the seller's palette, so every
 * shared primitive the store uses (buttons, inputs, selects, cards) renders in
 * the store's colours whatever theme the dashboard around it is in — the
 * dashboard's dark mode can no longer leak black controls or white-on-white
 * headings into a light store.
 *
 * Foregrounds are derived for contrast (WCAG relative luminance), never
 * assumed: a pale primary gets dark button text, a dark one gets white.
 */

import type { CSSProperties } from "react";

export interface StorefrontPalette {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
}

type Rgb = readonly [number, number, number];

const DARK_TEXT = "#111418";
const LIGHT_TEXT = "#FFFFFF";

export function parseHexColor(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

/** WCAG 2.x relative luminance (0 = black, 1 = white). */
export function relativeLuminance(color: string): number {
  const rgb = parseHexColor(color);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The readable text colour for content placed ON `background`. */
export function readableOn(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/** Linear sRGB-space mix: `amount` of `a` over `b` (0..1). */
export function mixHex(a: string, b: string, amount: number): string {
  const ra = parseHexColor(a);
  const rb = parseHexColor(b);
  if (!ra || !rb) return a;
  return toHex([
    ra[0] * amount + rb[0] * (1 - amount),
    ra[1] * amount + rb[1] * (1 - amount),
    ra[2] * amount + rb[2] * (1 - amount),
  ]);
}

/**
 * A text colour for secondary copy that still clears 4.5:1 on `background`:
 * starts soft and darkens (or lightens) toward the text colour until it reads.
 */
export function mutedTextOn(text: string, background: string): string {
  for (const amount of [0.64, 0.72, 0.8, 0.88, 1]) {
    const candidate = mixHex(text, background, amount);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return text;
}

/** A brand colour usable as TEXT on `background` (links, prices, eyebrows). */
export function brandTextOn(brand: string, background: string, text: string): string {
  for (const amount of [1, 0.85, 0.7, 0.55]) {
    const candidate = mixHex(brand, text, amount);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return text;
}

export function isDarkColor(color: string): boolean {
  return relativeLuminance(color) < 0.18;
}

/**
 * The CSS custom properties a storefront root sets. Spread onto the root's
 * `style`; `data-storefront-root` in `storefront-system.css` does the rest.
 */
export function storefrontThemeStyle(palette: StorefrontPalette): CSSProperties {
  const background = palette.backgroundColor;
  const surface = palette.surfaceColor;
  const text = palette.textColor;
  const primary = palette.primaryColor;
  const accent = palette.accentColor;
  const onPrimary = readableOn(primary);
  const muted = mixHex(text, background, 0.05);
  const border = mixHex(text, background, 0.14);

  const vars: Record<string, string> = {
    "--background": background,
    "--foreground": text,
    "--card": surface,
    "--card-foreground": text,
    "--popover": surface,
    "--popover-foreground": text,
    "--primary": primary,
    "--primary-hover": mixHex(primary, onPrimary === LIGHT_TEXT ? "#000000" : "#FFFFFF", 0.88),
    "--primary-foreground": onPrimary,
    "--secondary": muted,
    "--secondary-foreground": text,
    "--muted": muted,
    "--muted-foreground": mutedTextOn(text, background),
    "--accent": mixHex(primary, background, 0.1),
    "--accent-foreground": text,
    "--border": border,
    "--input": mixHex(text, background, 0.22),
    "--ring": primary,
    // Storefront-only roles.
    "--sf-accent": accent,
    "--sf-on-accent": readableOn(accent),
    "--sf-brand-text": brandTextOn(primary, background, text),
    "--sf-brand-text-on-surface": brandTextOn(primary, surface, text),
    "--sf-surface-muted": mixHex(text, surface, 0.04),
    "--sf-placeholder": mixHex(primary, surface, 0.09),
    "--sf-placeholder-ink": mixHex(primary, surface, 0.45),
    "--sf-color-scheme": isDarkColor(background) ? "dark" : "light",
  };
  return {
    ...(vars as CSSProperties),
    background,
    color: text,
    colorScheme: isDarkColor(background) ? "dark" : "light",
  };
}

export function storefrontScheme(palette: StorefrontPalette): "dark" | "light" {
  return isDarkColor(palette.backgroundColor) ? "dark" : "light";
}
