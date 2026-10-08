// Single place for every value that depends on the live business setup.
// Fill these before pointing sahelflow.com at the site; empty values degrade
// gracefully (the WhatsApp button falls back to the contact email).
export const SITE = {
  origin: "https://sahelflow.com",
  // International format without "+" or spaces, e.g. "213555123456".
  whatsapp: "213791999157",
  email: "contact@sahelflow.com",
  // Where the "Download" buttons point: the edge Worker (worker.js) resolves
  // the newest signed installer from the updater manifest.
  downloadUrl: "/get/windows",
  trialDays: 7,
  // Licence pricing in DZD (Founder, 2026-10-01): 35 000 DA, with a launch
  // offer at 17 000 DA for the first 20 sellers. Set launchOfferPrice to null
  // when the offer ends; set licencePrice to null to show "price on WhatsApp".
  licencePrice: 35000,
  launchOfferPrice: 17000,
  launchOfferSeats: 20,
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
