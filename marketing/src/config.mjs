// Single place for every value that depends on the live business setup.
// Fill these before pointing sahelflow.com at the site; empty values degrade
// gracefully (the WhatsApp button falls back to the contact email).
export const SITE = {
  origin: "https://sahelflow.com",
  // International format without "+" or spaces, e.g. "213555123456".
  whatsapp: "213791999157",
  email: "contact@sahelflow.com",
  // Where the "Download" buttons point: the edge Worker (worker.js) resolves
  // the newest installer from the updater manifest.
  downloadUrl: "/get/windows",
  trialDays: 7,
  // Licence pricing in DZD (Founder, 2026-10-01): 35 000 DA, with a launch
  // offer at 17 000 DA for the first 20 sellers. Set launchOfferPrice to null
  // when the offer ends; set licencePrice to null to show "price on WhatsApp".
  licencePrice: 35000,
  launchOfferPrice: 17000,
  launchOfferSeats: 20,
  // Contact for vulnerability reports (published as /.well-known/security.txt). null = none configured, no file is written.
  // Do not invent one: set it only when the Founder has chosen the mailbox.
  securityEmail: null,
  locales: ["ar", "fr", "en"],
  defaultLocale: "ar",
  // Bump when CSS or JS changes so phones do not keep yesterday's stylesheet.
  asset: "20261008",
};

export function whatsappHref(message) {
  if (!SITE.whatsapp) return `mailto:${SITE.email}`;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${SITE.whatsapp}${text}`;
}

// The site's own hostnames (canonical, hreflang, og:url, sitemap point here).
export const OWN_HOSTS = ["sahelflow.com", "www.sahelflow.com"];

// The ONLY places a page may link to outside the site (plain <a href>, never a script, image, font or stylesheet:
// the CSP is 'self' only). scripts/site-check.mjs fails on any other external URL.
export const ALLOWED_OUTBOUND = [
  { host: "wa.me", pathPrefix: "/", why: "WhatsApp chat with the seller's number (whatsappHref)" },
  { host: "github.com", pathPrefix: "/rendowblock-jpg/sahelflow_v2/releases", why: "installer and release notes (also the /get/windows fallback)" },
];
