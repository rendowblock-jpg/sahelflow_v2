import { storefrontScheme, storefrontThemeStyle } from "@/lib/storefront/storefront-tokens";

import { directionOf, PUBLIC_LOCALES, type PublicLocale } from "../locale";
import { jsonForScript } from "../html";
import { esc, type Ctx } from "./ui";

const LANGUAGE: Record<PublicLocale, { code: string; name: string }> = {
  ar: { code: "AR", name: "العربية" },
  fr: { code: "FR", name: "Français" },
  en: { code: "EN", name: "English" },
};

/** The seller's palette as CSS custom properties, serialised for a style attribute. */
export function themeStyleAttribute(ctx: Ctx): string {
  const style = storefrontThemeStyle(ctx.theme) as Record<string, string | number | undefined>;
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key.startsWith("--") ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${String(value)}`)
    .join(";");
}

export function languageNav(ctx: Ctx): string {
  const links = PUBLIC_LOCALES.map((code) =>
    code === ctx.locale
      ? `<span class="sf-lang-i" lang="${code}" aria-current="true" title="${esc(LANGUAGE[code].name)}">${LANGUAGE[code].code}</span>`
      : `<a class="sf-lang-i" href="${esc(ctx.path)}?lang=${code}" lang="${code}" hreflang="${code}" aria-label="${esc(LANGUAGE[code].name)}">${LANGUAGE[code].code}</a>`,
  ).join("");
  return `<nav class="sf-lang" aria-label="${esc(ctx.t("storefront.language.label"))}">${links}</nav>`;
}

export function renderHeader(ctx: Ctx): string {
  const initial = [...ctx.model.name.trim()][0]?.toUpperCase() ?? "•";
  return `<header class="sf-head"><div class="sf-wrap sf-head-in"><a class="sf-brand" href="/${esc(ctx.slug)}"><span class="sf-mono" aria-hidden="true">${esc(initial)}</span><b dir="auto">${esc(ctx.model.name)}</b></a>${languageNav(ctx)}</div></header>`;
}

export function renderAnnouncement(ctx: Ctx): string {
  const { theme, t } = ctx;
  if (!theme.announcement.enabled) return "";
  const text = esc(theme.announcement.text.trim() || t("storefront.studio.freePhoneConfirmation"));
  // Three copies per set and two sets: the track slides by half its width, so the loop never shows a gap.
  // Only the first copy is read by assistive technology; with reduced motion only the first copy is shown.
  const first = `<span dir="auto">${text}</span><span dir="auto" aria-hidden="true">${text}</span><span dir="auto" aria-hidden="true">${text}</span>`;
  return `<div class="sf-ann" role="note"><div class="sf-ann-track"><div class="sf-ann-set">${first}</div><div class="sf-ann-set" aria-hidden="true">${first}</div></div></div>`;
}

export function renderFooter(ctx: Ctx, tagline: string): string {
  const { t, model } = ctx;
  return `<footer class="sf-foot"><div class="sf-wrap"><strong dir="auto">${esc(model.name)}</strong>${tagline ? `<span dir="auto">${esc(tagline)}</span>` : ""}<small>${esc(t("storefront.studio.footerBrand", { name: model.name }))} · ${esc(t("storefront.view.poweredBy"))}</small></div></footer>`;
}

export type PageParts = {
  title: string;
  description: string;
  /** Path plus query of the canonical address. */
  canonical: string;
  robots: string;
  image: string | null;
  /** The first picture of the page, preloaded because it is the largest paint. */
  preload: string | null;
  jsonLd: unknown;
  script: boolean;
  /** Extra attributes for <body>. */
  bodyAttrs?: string;
  main: string;
  bar?: string;
  tagline: string;
};

const OG_LOCALE: Record<PublicLocale, string> = { ar: "ar_DZ", fr: "fr_DZ", en: "en_GB" };

/** The one display face each archetype loads on Arabic pages (the others never download). */
const VOICE_FONT = { sahara: "naskh-bold", atlas: "kufi-bold", oasis: "kufi-regular" } as const;

export function documentShell(ctx: Ctx, page: PageParts): string {
  const { theme, locale, origin, assets } = ctx;
  const canonical = `${origin}${page.canonical}`;
  const alternates = [
    ...PUBLIC_LOCALES.map((code) => `<link rel="alternate" hreflang="${code}" href="${esc(`${origin}${ctx.path}?lang=${code}`)}">`),
    `<link rel="alternate" hreflang="x-default" href="${esc(`${origin}${ctx.path}`)}">`,
  ];
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<meta name="robots" content="${page.robots}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    ...alternates,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${esc(ctx.model.name)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:locale" content="${OG_LOCALE[locale]}">`,
    ...(page.image ? [`<meta property="og:image" content="${esc(page.image)}">`] : []),
    `<meta name="theme-color" content="${esc(theme.backgroundColor)}">`,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    `<link rel="stylesheet" href="${esc(assets.css)}">`,
    ...(locale === "ar" && assets.fonts[VOICE_FONT[theme.template]]
      ? [`<link rel="preload" as="font" type="font/woff2" href="${esc(assets.fonts[VOICE_FONT[theme.template]] as string)}" crossorigin>`]
      : []),
    ...(page.preload ? [`<link rel="preload" as="image" href="${esc(page.preload)}" fetchpriority="high">`] : []),
    `<script type="application/ld+json">${jsonForScript({ "@context": "https://schema.org", ...(page.jsonLd as object) })}</script>`,
  ].join("\n");

  const attrs = [
    `data-voice="${theme.template}"`,
    `data-density="${theme.density}"`,
    `data-radius="${theme.radius}"`,
    `data-card="${theme.catalog.cardStyle}"`,
    `data-ratio="${theme.catalog.imageRatio}"`,
    `data-scheme="${storefrontScheme(theme)}"`,
    `style="${esc(themeStyleAttribute(ctx))}"`,
    page.bodyAttrs ?? "",
  ].filter(Boolean).join(" ");

  return `<!doctype html>
<html lang="${locale}" dir="${directionOf(locale)}">
<head>
${head}
</head>
<body ${attrs}>
<a class="sf-skip" href="#main">${esc(ctx.t("storefront.shop.skip"))}</a>
${renderAnnouncement(ctx)}
${renderHeader(ctx)}
<main id="main">
${page.main}
</main>
${renderFooter(ctx, page.tagline)}
${page.bar ?? ""}
${page.script ? `<script src="${esc(assets.js)}" defer></script>` : ""}
</body>
</html>`;
}
