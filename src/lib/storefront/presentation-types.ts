import type { StorefrontPageComposition } from "./studio-sections";
import type { StorefrontLegal } from "./studio-schema";

export const STOREFRONT_THEME_SCHEMA_VERSION = 2 as const;
export const STOREFRONT_BUILDER_SCHEMA_VERSION = 1 as const;
export const STOREFRONT_TEMPLATE_IDS = ["sahara", "atlas", "oasis", "prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;
export type StorefrontTemplateId = (typeof STOREFRONT_TEMPLATE_IDS)[number];
/** The five styles that come in two forms: a one-page COD landing page, or a store of several pages. */
export const STOREFRONT_STYLE_IDS = ["noir", "lumen", "atelier", "pulse", "bloom"] as const;
export type StorefrontStyleId = (typeof STOREFRONT_STYLE_IDS)[number];
export const STOREFRONT_PAGE_MODES = ["landing", "store"] as const;
export type StorefrontPageMode = (typeof STOREFRONT_PAGE_MODES)[number];
export function isStorefrontStyleId(id: string): id is StorefrontStyleId {
  return (STOREFRONT_STYLE_IDS as readonly string[]).includes(id);
}
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

export interface StorefrontContactInfo {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
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
 * Public contact information belongs here as well: it is part of the immutable
 * storefront release and must not bypass the Studio/publish transaction.
 */
export interface StorefrontBuilderState {
  schemaVersion: typeof STOREFRONT_BUILDER_SCHEMA_VERSION;
  composition: StorefrontPageComposition;
  productMedia: Record<string, StorefrontMediaSet>;
  collections: StorefrontCollection[];
  seo: StorefrontSeo;
  contact: StorefrontContactInfo;
  domain: StorefrontDomainProjection;
  shippingRules: StorefrontShippingRule[];
  /** WIRE/DB shape of the legal block (no column): the Studio lifts it into StorefrontStudioDraft.legal and the public artifact never carries it. */
  legal?: StorefrontLegal;
}

export interface StorefrontTheme {
  schemaVersion: typeof STOREFRONT_THEME_SCHEMA_VERSION;
  template: StorefrontTemplateId;
  /** Only the five styles read it; the older templates have none and their pages do not change. */
  mode?: StorefrontPageMode;
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
