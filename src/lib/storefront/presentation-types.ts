export const STOREFRONT_THEME_SCHEMA_VERSION = 2 as const;
export const STOREFRONT_TEMPLATE_IDS = ["sahara", "atlas", "oasis"] as const;
export type StorefrontTemplateId = (typeof STOREFRONT_TEMPLATE_IDS)[number];
export type LegacyStorefrontTemplateId = "minimal" | "modern" | "classic";
export type StorefrontHeroStyle = "editorial" | "split" | "centered";
export type StorefrontCardStyle = "minimal" | "elevated" | "outlined";
export type StorefrontImageRatio = "square" | "portrait" | "landscape";
export type StorefrontCheckoutLayout = "drawer" | "sticky" | "inline";
export type StorefrontDensity = "airy" | "balanced" | "compact";
export type StorefrontRadius = "soft" | "rounded" | "sharp";

export interface StorefrontTheme {
  schemaVersion: typeof STOREFRONT_THEME_SCHEMA_VERSION;
  template: StorefrontTemplateId;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  showPrices: boolean;
  showStock: boolean;
  density: StorefrontDensity;
  radius: StorefrontRadius;
  announcement: { enabled: boolean; text: string };
  hero: {
    enabled: boolean;
    style: StorefrontHeroStyle;
    eyebrow: string;
    headline: string;
    body: string;
    ctaLabel: string;
  };
  catalog: {
    cardStyle: StorefrontCardStyle;
    imageRatio: StorefrontImageRatio;
    showSku: boolean;
    showCategoryNavigation: boolean;
  };
  checkout: {
    layout: StorefrontCheckoutLayout;
    showOrderNotes: boolean;
    showCodPromise: boolean;
    codPromiseText: string;
  };
  trust: {
    showCodBadge: boolean;
    showPhoneConfirmationBadge: boolean;
    showDeliveryBadge: boolean;
    showSupportBadge: boolean;
  };
}
