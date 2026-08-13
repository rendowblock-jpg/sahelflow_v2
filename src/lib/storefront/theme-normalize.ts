import { STOREFRONT_TEMPLATE_IDS, type StorefrontTemplateId, type StorefrontTheme } from "./presentation-types";
import { createDefaultStorefrontTheme } from "./theme-default";

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
  const output = structuredClone(base);
  for (const key of ["primaryColor", "accentColor", "backgroundColor", "surfaceColor", "textColor"] as const) {
    const candidate = input[key];
    if (typeof candidate === "string" && HEX.test(candidate)) output[key] = candidate.toUpperCase();
  }
  if (typeof input.showPrices === "boolean") output.showPrices = input.showPrices;
  if (typeof input.showStock === "boolean") output.showStock = input.showStock;
  return output;
}
