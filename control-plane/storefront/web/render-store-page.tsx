import { renderToString } from "react-dom/server";

import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
import {
  StorefrontLocaleProvider,
  useStorefrontI18n,
} from "@/components/storefront/storefront-locale-provider";

import { adaptPublicRelease } from "./adapt-release";
import { directionOf, PUBLIC_LOCALES, type PublicLocale } from "./locale";
import { escapeHtml, jsonForScript } from "./html";
import { createPublicTranslator } from "./translator";
import type { RenderStorePageInput } from "./types";

const LANGUAGE: Record<PublicLocale, { code: string; name: string }> = {
  ar: { code: "AR", name: "العربية" },
  fr: { code: "FR", name: "Français" },
  en: { code: "EN", name: "English" },
};

/** Language links for the header. Plain anchors: no script is needed to switch. */
function LanguageNav({ slug }: { slug: string }) {
  const { t, locale } = useStorefrontI18n();
  return (
    <nav aria-label={t("storefront.language.label")} className="flex items-center text-xs font-semibold">
      {PUBLIC_LOCALES.map((code) =>
        code === locale ? (
          <span
            key={code}
            lang={code}
            aria-current="true"
            title={LANGUAGE[code].name}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full"
            style={{ background: "var(--accent)", color: "var(--sf-brand-text-on-surface)" }}
          >
            {LANGUAGE[code].code}
          </span>
        ) : (
          <a
            key={code}
            href={`/${slug}?lang=${code}`}
            lang={code}
            hrefLang={code}
            aria-label={LANGUAGE[code].name}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            {LANGUAGE[code].code}
          </a>
        ),
      )}
    </nav>
  );
}

function stripIsolates(value: string): string {
  return value.replace(/[\u2066-\u2069]/g, "");
}

/**
 * The full HTML document for a published store, as a string.
 *
 * The body is the shared StorefrontRenderer, rendered on the server, so what a
 * buyer sees is what the seller designed in the Studio. There is no client
 * script in this slice; everything here works with JavaScript off.
 */
export function renderStorePage(input: RenderStorePageInput): string {
  const { artifact, locale, slug, origin } = input;
  const { draft, products } = adaptPublicRelease({
    slug,
    storeName: artifact.storeName,
    description: artifact.description,
    theme: artifact.theme,
    products: artifact.products,
    stock: input.stock,
  });
  const t = createPublicTranslator(locale);
  const body = renderToString(
    <StorefrontLocaleProvider initialLocale={locale}>
      <StorefrontRenderer draft={draft} products={products} renderHeaderActions={<LanguageNav slug={slug} />} />
    </StorefrontLocaleProvider>,
  );

  const seo = draft.theme.builder.seo;
  const contact = draft.theme.builder.contact;
  const base = `${origin}/${slug}`;
  const canonical = locale === input.defaultLocale ? base : `${base}?lang=${locale}`;
  const title = seo.title.trim() || draft.name;
  const description =
    seo.description.trim() ||
    draft.description.trim() ||
    stripIsolates(t("storefront.public.metaFallback", { name: draft.name }));
  const firstImage = products.map((product) => (product.images ? (JSON.parse(product.images) as string[])[0] : null)).find(Boolean);
  const image = seo.socialImageUrl ?? firstImage ?? null;

  const graph: Array<Record<string, unknown>> = [
    {
      "@type": "Store",
      "@id": `${base}#store`,
      name: draft.name,
      url: base,
      description,
      ...(image ? { image } : {}),
      ...(contact.phone ? { telephone: contact.phone } : {}),
      ...(contact.address ? { address: contact.address } : {}),
    },
    ...products.slice(0, 50).map((product) => {
      const images = product.images ? (JSON.parse(product.images) as string[]) : [];
      return {
        "@type": "Product",
        name: product.name,
        ...(product.sku ? { sku: product.sku } : {}),
        ...(images.length > 0 ? { image: images } : {}),
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "DZD",
          availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: base,
          seller: { "@id": `${base}#store` },
        },
      };
    }),
  ];

  const alternates = [
    ...PUBLIC_LOCALES.map(
      (code) => `<link rel="alternate" hreflang="${code}" href="${escapeHtml(`${base}?lang=${code}`)}">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(base)}">`,
  ];
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    seo.noIndex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">',
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    ...alternates,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(draft.name)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:locale" content="${locale === "ar" ? "ar_DZ" : locale === "fr" ? "fr_DZ" : "en_GB"}">`,
    ...(image ? [`<meta property="og:image" content="${escapeHtml(image)}">`] : []),
    `<meta name="theme-color" content="${escapeHtml(draft.theme.backgroundColor)}">`,
    '<meta name="color-scheme" content="light dark">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    `<link rel="stylesheet" href="${escapeHtml(input.cssPath)}">`,
    `<script type="application/ld+json">${jsonForScript({ "@context": "https://schema.org", "@graph": graph })}</script>`,
  ].join("\n");

  return `<!doctype html>
<html lang="${locale}" dir="${directionOf(locale)}">
<head>
${head}
</head>
<body style="margin:0;background:${escapeHtml(draft.theme.backgroundColor)}">
${body}
</body>
</html>`;
}
