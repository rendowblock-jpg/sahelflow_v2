// Document shell for every page: <head>, the mega-menu header and the
// footer. Everything works without JavaScript; site.js adds
// hover intent, keyboard support and the mobile sheet.
import { BRAND_MARKS } from "./brands.mjs";
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { BRAND_NAMES, MODULES, PACKAGE, SOLUTIONS } from "./model.mjs";

/** The one inline script: no-js flag + motion flag before first paint (its CSP hash is in static/_headers). */
export const HEAD_SCRIPT = `(function(){var d=document.documentElement;d.classList.replace("no-js","js");try{var s=null;try{s=localStorage.getItem("sf-motion")}catch(e){}var r=matchMedia("(prefers-reduced-motion: reduce)").matches;d.setAttribute("data-motion",s==="full"||s==="calm"?s:r?"calm":"full");if(r)d.setAttribute("data-os-reduced","");if(window.IntersectionObserver)d.classList.add("js-motion")}catch(e){}})()`;
import { esc, href, icon, phoneDisplay, whatsappHref } from "./ui.mjs";
import { HOME3_COPY } from "./home3.mjs";

const FONT_PRELOAD = { ar: ["readex-arabic", "readex-latin"], fr: ["readex-latin"], en: ["readex-latin"] };
const OG_LOCALE = { ar: "ar_DZ", fr: "fr_DZ", en: "en_US" };

function head({ locale, path, title, description, preload, jsonLd = [], scripts = [] }) {
  const t = COPY[locale];
  const canonical = `${SITE.origin}${href(locale, path)}`;
  const alternates = SITE.locales
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE.origin}${href(l, path)}">`)
    .join("\n");
  const app = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SahelFlow",
    operatingSystem: "Windows 10, Windows 11",
    applicationCategory: "BusinessApplication",
    description: t.meta.home[1],
    url: SITE.origin,
    inLanguage: SITE.locales,
    offers: [
      { "@type": "Offer", price: "0", priceCurrency: "DZD", description: `${SITE.trialDays}-day free trial` },
      ...(PACKAGE.priceDzd ? [{ "@type": "Offer", price: String(PACKAGE.priceDzd), priceCurrency: "DZD", description: PACKAGE.launchOfferDzd ? `Permanent licence. Launch offer: ${PACKAGE.launchOfferDzd} DZD for the first ${PACKAGE.launchOfferSeats} sellers.` : "Permanent licence" }] : []),
    ],
  };
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SahelFlow",
    url: SITE.origin,
    logo: `${SITE.origin}/img/icon-180.png`,
    email: SITE.email,
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", telephone: phoneDisplay().replace(/ /g, ""), availableLanguage: ["Arabic", "French", "English"] },
  };
    return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${canonical}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${SITE.origin}${href(SITE.defaultLocale, path)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SahelFlow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.origin}/img/og-${locale}.png">
<meta property="og:locale" content="${OG_LOCALE[locale]}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-180.png">
${FONT_PRELOAD[locale].map((f) => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join("\n")}
${preload ? `<link rel="preload" as="image" href="${preload}" imagesrcset="${[480, 800, 1200].map((w) => `${preload.replace("-800.webp", `-${w}.webp`)} ${w}w`).join(", ")}" imagesizes="(min-width: 1100px) 840px, (min-width: 760px) 60vw, 100vw" fetchpriority="high">` : ""}
<link rel="stylesheet" href="/assets/site.css?v=${SITE.asset}">
<script>${HEAD_SCRIPT}</script>
${[app, org, ...(path === "" ? [{ "@context": "https://schema.org", "@type": "WebSite", name: "SahelFlow", url: SITE.origin, inLanguage: SITE.locales }] : []), ...jsonLd].map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script defer src="/assets/site.js?v=${SITE.asset}"></script>
${scripts.map((f) => `<script defer src="/assets/${f}?v=${SITE.asset}"></script>`).join("\n")}
</head>`;
}

/* ───────────────────────────── chrome ───────────────────────────── */

const MARK = `<img class="mark" src="/img/logo-96.png" srcset="/img/logo-48.png 1x, /img/logo-96.png 2x, /img/logo-192.png 3x" width="29" height="40" alt="" decoding="async">`;

const CHEV = `<svg class="chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function header({ locale, pageId, path }) {
  const t = COPY[locale];
  const rl = t.nav.resourceLinks;
  const cur = (yes) => (yes ? ' aria-current="page"' : "");
  const inProduct = pageId === "product" || pageId.startsWith("module:");
  const inSolutions = pageId.startsWith("solution:") || pageId === "why";
  const inResources = ["help", "security", "contact", "download"].includes(pageId);
  const item = (url, ico, name, text, here) =>
    `<a class="mi" href="${url}"${cur(here)}><span class="mi-ic">${icon(ico)}</span><span class="mi-t"><b>${esc(name)}</b><small>${esc(text)}</small></span></a>`;
  const go = `<span class="mf-go">${esc(t.common.learnMore)}${icon("arrow", "flip")}</span>`;
  const drop = (key, label, active, heading, grid, wide, side) =>
    `<li class="nl has-mega" data-mega><button type="button" class="nl-a${active ? " is-here" : ""}" aria-expanded="false" aria-controls="mega-${key}">${esc(label)}${CHEV}</button><div class="mega" id="mega-${key}"><div class="mega-card"><div class="mega-main"><p class="mega-h">${esc(heading)}</p><div class="mega-grid${wide ? "" : " mega-grid-1"}">${grid}</div></div>${side}</div></div></li>`;
  const plain = (id, label) => `<li class="nl"><a class="nl-a" href="${href(locale, id)}"${cur(pageId === id)}>${esc(label)}</a></li>`;

  const modules = MODULES.map((m) => item(href(locale, `product/${m.key}`), m.icon, t.modules[m.key].name, t.modules[m.key].short, pageId === `module:${m.key}`)).join("");
  const productSide = `<a class="mega-feat" href="${href(locale, "product")}"><span class="mf-pic"><img src="/img/nav-product-${locale}.webp" width="600" height="375" alt="" loading="lazy" decoding="async"></span><b>${esc(t.nav.platformOverview)}</b><small>${esc(t.nav.platformOverviewText)}</small>${go}</a>`;
  const solutions = SOLUTIONS.map((s) => item(href(locale, `solutions/${s.key}`), s.icon, t.solutions[s.key].name, t.solutions[s.key].short, pageId === `solution:${s.key}`)).join("");
  const solutionsSide = `<a class="mega-feat" href="${href(locale, "why")}"><span class="mf-ic">${icon("scale")}</span><b>${esc(t.nav.why)}</b><small>${esc(t.nav.whyText)}</small>${go}</a>`;
  const resources = [
    item(href(locale, "help"), "help", rl.help[0], rl.help[1], pageId === "help"),
    item(href(locale, "security"), "shield", rl.security[0], rl.security[1], pageId === "security"),
    item(href(locale, "contact"), "message", rl.contact[0], rl.contact[1], pageId === "contact"),
    item(href(locale, "download"), "download", rl.download[0], rl.download[1], pageId === "download"),
  ].join("");
  const resourcesSide = `<a class="mega-feat" href="${whatsappHref(t.whatsappMessage)}" rel="noopener"><span class="mf-ic">${icon("whatsapp")}</span><b>${esc(t.nav.talk)}</b><small dir="ltr">${esc(phoneDisplay())}</small><span class="mf-go">WhatsApp${icon("arrow", "flip")}</span></a>`;

  const langPop = SITE.locales
    .map((l) => `<a href="${href(l, path)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}><span>${esc(COPY[l].name)}</span><i aria-hidden="true">${l.toUpperCase()}</i></a>`)
    .join("");
  const langs = SITE.locales
    .map((l) => `<a href="${href(l, path)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(COPY[l].name)}</a>`)
    .join("");
  return `<a class="skip-link" href="#main">${esc(t.common.skip)}</a>
<header class="top" data-header>
<div class="top-in">
<a class="brand" href="${href(locale)}" aria-label="SahelFlow">${MARK}<span class="wm">SahelFlow</span></a>
<details class="menu" data-menu>
<summary class="menu-btn"><span>${esc(t.nav.menu)}</span></summary>
<div class="menu-panel">
<nav aria-label="${esc(t.nav.menu)}"><ul class="nav-links">
${drop("product", t.nav.product, inProduct, t.nav.platformTitle, modules, true, productSide)}
${drop("solutions", t.nav.solutions, inSolutions, t.nav.solutionsTitle, solutions, false, solutionsSide)}
${plain("integrations", t.nav.integrations)}
${plain("pricing", t.nav.pricing)}
${drop("resources", t.nav.resources, inResources, t.nav.resourcesTitle, resources, false, resourcesSide)}
</ul></nav>
<div class="nav-tools">
<details class="langmenu" data-langmenu><summary aria-label="${esc(t.nav.language)}">${icon("globe")}<span>${esc(t.name)}</span>${CHEV}</summary><div class="lang-pop">${langPop}</div></details>
<p class="langs">${langs}</p>
<a class="nav-cta" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.nav.start)}</span></a>
</div>
</div>
</details>
</div>
<i class="top-line" aria-hidden="true"></i>
</header>`;
}

/** The name returns at full width, cropped by the bottom edge. */
function wordmark(locale) {
  return `<a class="foot-word" href="${href(locale)}" aria-label="SahelFlow" dir="ltr"><span class="fw" aria-hidden="true">SahelFlow</span></a>`;
}

function footer(locale) {
  const t = COPY[locale];
  const f = HOME3_COPY[locale].foot;
  const year = new Date().getFullYear();
  const col = (title, links) =>
    `<div class="foot-col"><h2>${esc(title)}</h2><ul>${links.map(([url, label]) => `<li><a href="${url}">${esc(label)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer" data-tone="green">
<div class="foot-top">
<div class="foot-inv">
<img class="foot-logo" src="/img/logo-192.png" srcset="/img/logo-96.png 1x, /img/logo-192.png 2x, /img/logo-384.png 3x" width="52" height="72" alt="" decoding="async">
<p class="foot-h" role="heading" aria-level="2"><span>${esc(f.a)}</span> <span>${esc(f.b)}</span></p>
<a class="v-btn v-btn-on" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.downloadPage.button)}</span></a>
<p class="foot-meta">${esc(f.meta)}</p>
</div>
<ul class="foot-contact">
<li><a href="${whatsappHref(t.whatsappMessage)}" rel="noopener"><span dir="ltr">${esc(phoneDisplay())}</span></a></li>
<li><a href="mailto:${SITE.email}"><span dir="ltr">${esc(SITE.email)}</span></a></li>
<li><a href="${href(locale, "contact")}">${esc(f.contact)}</a></li>
<li><a href="${href(locale, "help")}">${esc(t.nav.resourceLinks.help[0])}</a></li>
</ul>
</div>
<div class="foot-cols">
${col(t.footer.product, [[href(locale, "product"), t.nav.platformOverview], ...MODULES.map((m) => [href(locale, `product/${m.key}`), t.modules[m.key].name])])}
${col(t.footer.solutions, [...SOLUTIONS.map((s) => [href(locale, `solutions/${s.key}`), t.solutions[s.key].name]), [href(locale, "why"), t.nav.why]])}
${col(t.footer.company, [
    [href(locale, "integrations"), t.nav.integrations],
    [href(locale, "pricing"), t.nav.pricing],
    [href(locale, "security"), t.nav.resourceLinks.security[0]],
    [href(locale, "download"), t.nav.resourceLinks.download[0]],
    [href(locale, "help"), t.nav.resourceLinks.help[0]],
    [href(locale, "contact"), t.nav.resourceLinks.contact[0]],
  ])}
${col(t.footer.legal, [[href(locale, "privacy"), t.footer.privacy], [href(locale, "terms"), t.footer.terms]])}
</div>
<p class="foot-note">${esc(t.common.whatsappNote)}</p>
<p class="foot-note foot-marks">${esc(BRAND_MARKS[locale])}</p>
<div class="foot-bottom">
<p>© ${year} SahelFlow. ${esc(t.footer.rights)} ${esc(t.footer.made)}</p>
<p class="langs">${SITE.locales.map((l) => `<a href="${href(l)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(COPY[l].name)}</a>`).join("")}</p>
</div>
${wordmark(locale)}
</footer>`;
}

/** The full document for one page. */
export function shell(ctx, body) {
  return `${head(ctx)}
<body data-page="${esc(ctx.pageId)}">
${header(ctx)}
<main id="main" tabindex="-1">
${body}
</main>
${footer(ctx.locale)}
</body>
</html>
`;
}

export { BRAND_NAMES };
