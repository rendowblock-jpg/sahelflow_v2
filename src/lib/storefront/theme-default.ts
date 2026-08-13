import type { StorefrontTemplateId, StorefrontTheme } from "./presentation-types";
import { STOREFRONT_THEME_SCHEMA_VERSION } from "./presentation-types";
import { STOREFRONT_TEMPLATE_PRESETS } from "./template-presets";
import { createDefaultStorefrontBuilderState } from "./builder-default";

export function createDefaultStorefrontTheme(template: StorefrontTemplateId = "atlas"): StorefrontTheme {
  const palette = STOREFRONT_TEMPLATE_PRESETS[template];
  return {
    schemaVersion: STOREFRONT_THEME_SCHEMA_VERSION,
    template,
    ...palette,
    showPrices: true,
    showStock: false,
    density: template === "sahara" ? "airy" : "balanced",
    radius: template === "sahara" ? "rounded" : "soft",
    announcement: { enabled: template !== "atlas", text: "" },
    hero: {
      enabled: true,
      style: template === "sahara" ? "editorial" : template === "oasis" ? "centered" : "split",
      eyebrow: "",
      headline: "",
      body: "",
      ctaLabel: "",
    },
    catalog: {
      cardStyle: template === "sahara" ? "minimal" : template === "oasis" ? "outlined" : "elevated",
      imageRatio: template === "sahara" ? "portrait" : template === "oasis" ? "landscape" : "square",
      showSku: false,
      showCategoryNavigation: template !== "oasis",
    },
    checkout: {
      layout: template === "sahara" ? "drawer" : template === "oasis" ? "inline" : "sticky",
      showOrderNotes: true,
      showCodPromise: true,
      codPromiseText: "",
    },
    trust: {
      showCodBadge: true,
      showPhoneConfirmationBadge: true,
      showDeliveryBadge: true,
      showSupportBadge: true,
    },
    builder: createDefaultStorefrontBuilderState(),
  };
}

export const DEFAULT_STOREFRONT_THEME = createDefaultStorefrontTheme();
