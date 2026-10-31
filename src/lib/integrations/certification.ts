/**
 * What each integration has really been proven to do, as the app states it.
 *
 * This mirrors the site's registry (marketing/src/claims.mjs); a test compares the two, so the app and
 * sahelflow.com can never disagree. "testing" means the code and its automated tests exist but it has never been
 * run against a real account. To promote one: record the proof on the site's side first, then change it in both files.
 */
export type IntegrationStatus = "live" | "testing" | "planned";

export const INTEGRATION_IDS = [
  "whatsapp",
  "yalidine",
  "zr",
  "ecotrack",
  "maystro",
  "sheets",
  "shopify",
  "youcan",
  "woocommerce",
  "meta",
  "gemini",
  "storefront",
  "excel",
] as const;

export type IntegrationId = (typeof INTEGRATION_IDS)[number];

const STATUS: Readonly<Record<IntegrationId, IntegrationStatus>> = {
  whatsapp: "testing",
  yalidine: "testing",
  zr: "testing",
  ecotrack: "testing",
  maystro: "testing",
  sheets: "testing",
  shopify: "testing",
  youcan: "testing",
  woocommerce: "testing",
  meta: "testing",
  gemini: "testing",
  storefront: "testing",
  excel: "testing",
};

/** The delivery panel names ZR Express "zrexpress"; the registry (like the site) says "zr". */
export const DELIVERY_PROVIDER_TO_INTEGRATION = {
  yalidine: "yalidine",
  maystro: "maystro",
  zrexpress: "zr",
  ecotrack: "ecotrack",
} as const satisfies Record<string, IntegrationId>;

/** An id the registry does not know is "testing": the app never claims more than it can prove. */
export function integrationStatus(id: IntegrationId): IntegrationStatus {
  return Object.prototype.hasOwnProperty.call(STATUS, id) ? STATUS[id] : "testing";
}
