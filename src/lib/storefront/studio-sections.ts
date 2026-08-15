export const STOREFRONT_SECTION_TYPES = [
  "announcement",
  "navbar",
  "hero",
  "trust",
  "featured-products",
  "product-grid",
  "categories",
  "media",
  "testimonials",
  "faq",
  "cod-checkout",
  "support",
  "footer",
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

function defaultSettings(
  type: StorefrontSectionType,
): StorefrontSection["settings"] {
  switch (type) {
    case "featured-products":
    case "product-grid":
    case "categories":
      return { title: "" };
    case "media":
      return {
        eyebrow: "",
        title: "",
        body: "",
        imageUrl: "",
        imageAlt: "",
        align: "split",
      };
    case "testimonials":
      return { title: "" };
    case "faq":
      return { title: "" };
    case "footer":
      return { tagline: "" };
    default:
      return {};
  }
}

/**
 * Build one safe authoring section with explicit defaults.
 *
 * Section settings/blocks intentionally remain inside the existing generic
 * schema so adding richer Studio content does not require a SQLite migration or
 * change the immutable release envelope. Callers provide the durable id.
 */
export function createStorefrontSection(
  type: StorefrontSectionType,
  id = `home-${type}`,
): StorefrontSection {
  return {
    id,
    type,
    enabled: true,
    settings: defaultSettings(type),
    blocks: [],
  };
}

export function createDefaultStorefrontComposition(): StorefrontPageComposition {
  return {
    page: "home",
    sections: [
      createStorefrontSection("announcement"),
      createStorefrontSection("navbar"),
      createStorefrontSection("hero"),
      createStorefrontSection("trust"),
      createStorefrontSection("product-grid"),
      createStorefrontSection("cod-checkout"),
      createStorefrontSection("support"),
      createStorefrontSection("footer"),
    ],
  };
}
