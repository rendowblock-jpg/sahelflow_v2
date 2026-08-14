import { STOREFRONT_TEMPLATE_IDS, type StorefrontTemplateId, type StorefrontTheme } from "./presentation-types";
import { createDefaultStorefrontTheme } from "./theme-default";
import { storefrontStudioThemeSchema } from "./studio-schema";
import { STOREFRONT_TEMPLATE_PRESETS } from "./template-presets";

const LEGACY: Record<string, StorefrontTemplateId> = {
  minimal: "sahara",
  modern: "atlas",
  classic: "oasis",
};
const HEX = /^#[0-9a-f]{6}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function templateId(value: unknown): StorefrontTemplateId {
  if (typeof value === "string" && STOREFRONT_TEMPLATE_IDS.includes(value as StorefrontTemplateId)) {
    return value as StorefrontTemplateId;
  }
  return typeof value === "string" && LEGACY[value] ? LEGACY[value] : "atlas";
}

export function normalizeStorefrontTheme(value: unknown): StorefrontTheme {
  const input = record(value);
  const base = createDefaultStorefrontTheme(templateId(input.template));
  if (input.schemaVersion === 2) {
    const parsed = storefrontStudioThemeSchema.safeParse(input);
    if (parsed.success) return parsed.data;
  }
  const output = structuredClone(base);
  for (const key of ["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor"] as const) {
    const candidate = input[key];
    if (typeof candidate === "string" && HEX.test(candidate)) output[key] = candidate.toUpperCase();
  }
  if (typeof input.showPrices === "boolean") output.showPrices = input.showPrices;
  if (typeof input.showStock === "boolean") output.showStock = input.showStock;
  return output;
}

const PALETTE_KEYS = [
  "primaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
] as const;

/**
 * Switches design systems without discarding seller-authored content. Palette
 * values that still match the old preset move to the new preset; deliberate
 * brand overrides remain intact.
 */
export function switchStorefrontTemplate(
  theme: StorefrontTheme,
  nextTemplate: StorefrontTemplateId,
): StorefrontTheme {
  if (theme.template === nextTemplate) return theme;
  const previousPreset = STOREFRONT_TEMPLATE_PRESETS[theme.template];
  const next = createDefaultStorefrontTheme(nextTemplate);
  for (const key of PALETTE_KEYS) {
    if (theme[key].toUpperCase() !== previousPreset[key].toUpperCase()) {
      next[key] = theme[key];
    }
  }
  next.showPrices = theme.showPrices;
  next.showStock = theme.showStock;
  next.announcement = { ...next.announcement, text: theme.announcement.text };
  next.hero = {
    ...next.hero,
    enabled: theme.hero.enabled,
    eyebrow: theme.hero.eyebrow,
    headline: theme.hero.headline,
    body: theme.hero.body,
    ctaLabel: theme.hero.ctaLabel,
  };
  next.checkout = {
    ...next.checkout,
    showOrderNotes: theme.checkout.showOrderNotes,
    showCodPromise: theme.checkout.showCodPromise,
    codPromiseText: theme.checkout.codPromiseText,
  };
  next.trust = { ...theme.trust };
  next.builder = structuredClone(theme.builder);
  return next;
}
