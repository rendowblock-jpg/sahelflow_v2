export const STOREFRONT_SECTION_TYPES = [
  "announcement", "navbar", "hero", "trust", "featured-products",
  "product-grid", "categories", "media", "testimonials", "faq",
  "cod-checkout", "support", "footer",
] as const;
export type StorefrontSectionType = (typeof STOREFRONT_SECTION_TYPES)[number];

export interface StorefrontSection {
  id: string;
  type: StorefrontSectionType;
  enabled: boolean;
  settings: Record<string, string | number | boolean | null>;
  blocks: readonly StorefrontBlock[];
}

export interface StorefrontBlock {
  id: string;
  type: string;
  settings: Record<string, string | number | boolean | null>;
}

export interface StorefrontPageComposition {
  page: "home" | "product" | "checkout" | "thank-you";
  sections: readonly StorefrontSection[];
}

function section(type: StorefrontSectionType): StorefrontSection {
  return { id: `home-${type}`, type, enabled: true, settings: {}, blocks: [] };
}

export function createDefaultStorefrontComposition(): StorefrontPageComposition {
  return {
    page: "home",
    sections: [
      section("announcement"),
      section("navbar"),
      section("hero"),
      section("trust"),
      section("product-grid"),
      section("cod-checkout"),
      section("support"),
      section("footer"),
    ],
  };
}
