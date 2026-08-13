export const STOREFRONT_THEME_SCHEMA_VERSION = 2 as const;
export const STOREFRONT_BUILDER_SCHEMA_VERSION = 1 as const;
export const STOREFRONT_TEMPLATE_IDS = ["sahara", "atlas", "oasis"] as const;
export type StorefrontTemplateId = (typeof STOREFRONT_TEMPLATE_IDS)[number];
export type LegacyStorefrontTemplateId = "minimal" | "modern" | "classic";
export type StorefrontHeroStyle = "editorial" | "split" | "centered";
export type StorefrontCardStyle = "minimal" | "elevated" | "outlined";
export type StorefrontImageRatio = "square" | "portrait" | "landscape";
export type StorefrontCheckoutLayout = "drawer" | "sticky" | "inline";
export type StorefrontDensity = "airy" | "balanced" | "compact";
export type StorefrontRadius = "soft" | "rounded" | "sharp";
export type StorefrontDeliveryMode = "home" | "desk";
export type StorefrontDomainStatus = "disconnected" | "pending" | "verified" | "error";

export interface StorefrontMediaItem {
  id: string;
  url: string;
  alt: string;
  position: number;
}

export interface StorefrontMediaSet {
  items: StorefrontMediaItem[];
  coverMediaId: string | null;
}

export interface StorefrontCollection {
  id: string;
  title: string;
  slug: string;
  enabled: boolean;
  productIds: string[];
  media: StorefrontMediaSet;
}

export interface StorefrontSeo {
  title: string;
  description: string;
  socialImageUrl: string | null;
  noIndex: boolean;
}

/** Last-known hosted domain projection. The control plane owns verification/routing state. */
export interface StorefrontDomainProjection {
  hostname: string | null;
  status: StorefrontDomainStatus;
  verificationName: string | null;
  verificationValue: string | null;
  lastCheckedAt: string | null;
}

export interface StorefrontShippingRule {
  wilayaCode: string;
  deliveryMode: StorefrontDeliveryMode;
  feeDzd: number;
}

/**
 * Builder authoring metadata lives inside StorefrontConfig.theme so SQLite stays
 * the single mutable draft authority and existing rows need no schema migration.
 */
export interface StorefrontBuilderState {
  schemaVersion: typeof STOREFRONT_BUILDER_SCHEMA_VERSION;
  productMedia: Record<string, StorefrontMediaSet>;
  collections: StorefrontCollection[];
  seo: StorefrontSeo;
  domain: StorefrontDomainProjection;
  shippingRules: StorefrontShippingRule[];
}

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
  builder: StorefrontBuilderState;
}
