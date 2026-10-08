// The facts the website states about the product, kept in one place.
//
// PACKAGE mirrors the Founder-signed permanent licence the app issues
// (src/lib/license/packages.ts, PRODUCT.md §4–§5). A test pins the two
// together, so the website can never promise more — or less — than a paying
// seller actually receives.
import { SITE } from "./config.mjs";

export const PACKAGE = Object.freeze({
  priceDzd: SITE.licencePrice,
  launchOfferDzd: SITE.launchOfferPrice,
  launchOfferSeats: SITE.launchOfferSeats,
  extraShopPriceDzd: 5_000,
  includedShops: 5,
  maximumShops: 10,
  // Owner plus ten active team members.
  teamMembers: 10,
  devicesPerMember: 2,
  updateYears: 5,
  trialDays: SITE.trialDays,
});

/** Product modules, in the order a seller meets them. */
export const MODULES = Object.freeze([
  { key: "inbox", icon: "inbox", shot: "inbox", gallery: ["customer"], hue: 152 },
  { key: "orders", icon: "orders", shot: "orders", gallery: ["queue", "order"], hue: 199 },
  { key: "delivery", icon: "delivery", shot: "delivery", gallery: ["parcel"], hue: 38 },
  { key: "risk", icon: "risk", shot: "risk", gallery: ["order"], hue: 350 },
  { key: "accounting", icon: "accounting", shot: "accounting", gallery: ["analytics"], hue: 165 },
  { key: "automations", icon: "automations", shot: "flow", gallery: [], hue: 265 },
  { key: "storefront", icon: "storefront", shot: "studio", gallery: ["storefronts"], hue: 28 },
  // The assistant needs the seller's own Gemini key, so it is shown as a
  // labelled, animated illustration rather than a screenshot.
  { key: "agents", icon: "agents", shot: null, gallery: [], hue: 285 },
  { key: "team", icon: "team", shot: "team", gallery: [], hue: 210 },
]);

export const MODULE_KEYS = MODULES.map((module) => module.key);

/** Who SahelFlow is for, each with its own page. */
export const SOLUTIONS = Object.freeze([
  { key: "starting", icon: "sparkle" },
  { key: "teams", icon: "team" },
  { key: "brands", icon: "storefront" },
  { key: "online", icon: "globe" },
]);

/** Help-centre categories; articles live in the copy files. */
export const HELP_TOPICS = Object.freeze([
  { key: "start", icon: "download" },
  { key: "whatsapp", icon: "inbox" },
  { key: "orders", icon: "orders" },
  { key: "delivery", icon: "delivery" },
  { key: "licence", icon: "key" },
  { key: "data", icon: "shield" },
  { key: "team", icon: "team" },
]);

/** Integration wordmarks, grouped; descriptions live in the copy files. */
export const INTEGRATIONS = Object.freeze([
  { group: "messaging", items: ["whatsapp"] },
  { group: "couriers", items: ["yalidine", "zr", "ecotrack", "maystro"] },
  { group: "stores", items: ["sheets", "shopify", "youcan", "woocommerce", "storefront"] },
  { group: "growth", items: ["meta", "gemini"] },
  { group: "data", items: ["excel"] },
]);

export const BRAND_NAMES = Object.freeze({
  whatsapp: "WhatsApp",
  yalidine: "Yalidine",
  zr: "ZR Express",
  ecotrack: "EcoTrack",
  maystro: "Maystro Delivery",
  sheets: "Google Sheets",
  shopify: "Shopify",
  youcan: "YouCan",
  woocommerce: "WooCommerce",
  storefront: "SahelFlow Store",
  meta: "Meta Pixel + CAPI",
  gemini: "Google Gemini",
  excel: "Excel / CSV",
});

/** Every page each locale gets, as [id, path segment]. */
export function sitePages() {
  return [
    ["home", ""],
    ["product", "product"],
    ...MODULES.map((module) => [`module:${module.key}`, `product/${module.key}`]),
    ...SOLUTIONS.map((solution) => [`solution:${solution.key}`, `solutions/${solution.key}`]),
    ["integrations", "integrations"],
    ["pricing", "pricing"],
    ["why", "why"],
    ["security", "security"],
    ["download", "download"],
    ["help", "help"],
    ["contact", "contact"],
    ["privacy", "privacy"],
    ["terms", "terms"],
  ];
}

/** 35 000 DA spread over the update years, as a monthly figure. */
export function monthlyOverUpdateYears(amount) {
  return Math.round(amount / (PACKAGE.updateYears * 12));
}
