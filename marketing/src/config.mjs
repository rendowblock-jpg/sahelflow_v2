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
  // Licence price in DZD shown on /pricing. null shows "price on WhatsApp";
  // set a number (e.g. 25000) once the Founder fixes the price.
  licencePrice: null,
  locales: ["ar", "fr", "en"],
  defaultLocale: "ar",
};

export function whatsappHref(message) {
  if (!SITE.whatsapp) return `mailto:${SITE.email}`;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${SITE.whatsapp}${text}`;
}
