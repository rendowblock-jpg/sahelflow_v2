/**
 * The logo shown for each integration, in one place.
 *
 * A brand with `file: null` is shown by its NAME only, with a neutral glyph in the tile. To drop any logo (for example if its owner asks),
 * set its file to null: nothing else needs to change. Sources and licences are written in marketing/BRAND-ASSETS.md.
 *
 * Groq has no file on purpose: Groq's Trademark Policy (effective 24 Oct 2025, https://groq.com/trademark-policy) allows the name as a
 * word mark without permission but says "no logos", and forbids its logos in UI or ads without a licence. To get one, write to
 * trademark-legal@groq.com with the mockup, then set `file: "groq.svg"` here.
 */
export const BRAND_LOGOS = Object.freeze({
  whatsapp: Object.freeze({ file: "whatsapp.svg" }),
  gemini: Object.freeze({ file: "gemini.svg" }),
  openai: Object.freeze({ file: "openai.svg" }),
  groq: Object.freeze({ file: null }),
  yalidine: Object.freeze({ file: "yalidine.png" }),
  zr: Object.freeze({ file: "zr.svg" }),
  ecotrack: Object.freeze({ file: "ecotrack.svg" }),
  maystro: Object.freeze({ file: "maystro.svg" }),
  shopify: Object.freeze({ file: "shopify.svg" }),
  youcan: Object.freeze({ file: "youcan.svg" }),
  woocommerce: Object.freeze({ file: "woocommerce.svg" }),
  storefront: Object.freeze({ file: "storefront.svg" }),
  sheets: Object.freeze({ file: "sheets.svg" }),
  excel: Object.freeze({ file: "excel.svg" }),
  meta: Object.freeze({ file: "meta.svg" }),
});

/** The file name of a brand's logo, or null when the brand is shown by name only. Throws for an unknown brand. */
export function logoFile(key) {
  const found = BRAND_LOGOS[key];
  if (!found) throw new Error(`Brand "${key}" has no entry in marketing/src/brands.mjs`);
  return found.file;
}

/**
 * Said wherever third-party names or logos appear (the home connections section, the integrations page and the footer).
 * The Groq and OpenAI sentences follow the attribution lines their own policies ask for.
 */
export const BRAND_MARKS = Object.freeze({
  en: "Product names, logos and brands belong to their owners and appear here only to show what SahelFlow is built to work with. No partnership or endorsement is implied. OpenAI and the OpenAI logo are trademarks of OpenAI. Groq is a trademark of Groq LLC and/or its affiliates; SahelFlow is not affiliated with or endorsed by Groq LLC.",
  fr: "Les noms de produits, logos et marques appartiennent à leurs propriétaires et ne figurent ici que pour montrer avec quoi SahelFlow est conçu pour fonctionner. Aucun partenariat ni aval n'est sous-entendu. OpenAI et le logo OpenAI sont des marques d'OpenAI. Groq est une marque de Groq LLC et/ou de ses filiales ; SahelFlow n'est ni affilié à Groq LLC ni approuvé par elle.",
  ar: "أسماء المنتجات وشعاراتها وعلاماتها ملك لأصحابها، وتظهر هنا فقط لنبيّن مع ماذا صُمّم SahelFlow ليعمل، دون أي شراكة أو تزكية. OpenAI وشعار OpenAI علامتان تجاريتان لشركة OpenAI. Groq علامة تجارية لشركة Groq LLC و/أو شركاتها التابعة؛ ولا تربط SahelFlow بـ Groq LLC أي صلة، ولا تزكية منها.",
});
