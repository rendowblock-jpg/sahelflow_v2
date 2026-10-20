import type { StorefrontTemplateId, StorefrontTheme } from "./presentation-types";
import { STOREFRONT_THEME_SCHEMA_VERSION } from "./presentation-types";
import { STOREFRONT_TEMPLATE_PRESETS } from "./template-presets";
import { createDefaultStorefrontBuilderState } from "./builder-default";

type Shape = Pick<StorefrontTheme, "density" | "radius"> & {
  announcement: boolean;
  hero: StorefrontTheme["hero"]["style"];
  card: StorefrontTheme["catalog"]["cardStyle"];
  ratio: StorefrontTheme["catalog"]["imageRatio"];
  categoryNavigation: boolean;
  checkout: StorefrontTheme["checkout"]["layout"];
};

/** The structural defaults of each template (what the Studio starts from). The first three are the published ones and must not change. */
const SHAPE: Readonly<Record<StorefrontTemplateId, Shape>> = {
  sahara: { density: "airy", radius: "rounded", announcement: true, hero: "editorial", card: "minimal", ratio: "portrait", categoryNavigation: true, checkout: "drawer" },
  atlas: { density: "balanced", radius: "soft", announcement: false, hero: "split", card: "elevated", ratio: "square", categoryNavigation: true, checkout: "sticky" },
  oasis: { density: "balanced", radius: "soft", announcement: true, hero: "centered", card: "outlined", ratio: "landscape", categoryNavigation: false, checkout: "sticky" },
  prime: { density: "airy", radius: "sharp", announcement: false, hero: "centered", card: "minimal", ratio: "portrait", categoryNavigation: false, checkout: "sticky" },
  souk: { density: "balanced", radius: "rounded", announcement: false, hero: "split", card: "elevated", ratio: "square", categoryNavigation: true, checkout: "sticky" },
  reel: { density: "airy", radius: "sharp", announcement: false, hero: "editorial", card: "minimal", ratio: "landscape", categoryNavigation: false, checkout: "sticky" },
};

export function createDefaultStorefrontTheme(template: StorefrontTemplateId = "atlas"): StorefrontTheme {
  const palette = STOREFRONT_TEMPLATE_PRESETS[template];
  const shape = SHAPE[template];
  return {
    schemaVersion: STOREFRONT_THEME_SCHEMA_VERSION,
    template,
    ...palette,
    showPrices: true,
    showStock: false,
    density: shape.density,
    radius: shape.radius,
    announcement: { enabled: shape.announcement, text: "" },
    hero: { enabled: true, style: shape.hero, eyebrow: "", headline: "", body: "", ctaLabel: "" },
    catalog: { cardStyle: shape.card, imageRatio: shape.ratio, showSku: false, showCategoryNavigation: shape.categoryNavigation },
    checkout: { layout: shape.checkout, showOrderNotes: true, showCodPromise: true, codPromiseText: "" },
    trust: { showCodBadge: true, showPhoneConfirmationBadge: true, showDeliveryBadge: true, showSupportBadge: true },
    builder: createDefaultStorefrontBuilderState(),
  };
}

export const DEFAULT_STOREFRONT_THEME = createDefaultStorefrontTheme();
