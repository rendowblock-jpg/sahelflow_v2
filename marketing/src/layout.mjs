// Document shell for every page: <head>, the mega-menu header and the
// footer. Everything works without JavaScript; site.js adds
// hover intent, keyboard support and the mobile sheet.
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { BRAND_NAMES, MODULES, PACKAGE, SOLUTIONS } from "./model.mjs";

/** The one inline script: no-js flag + motion flag before first paint (its CSP hash is in static/_headers). */
export const HEAD_SCRIPT = `(function(){var d=document.documentElement;d.classList.replace("no-js","js");try{if(window.IntersectionObserver&&!matchMedia("(prefers-reduced-motion: reduce)").matches)d.classList.add("js-motion")}catch(e){}})()`;
import { esc, href, phoneDisplay, whatsappHref } from "./ui.mjs";

const FONT_PRELOAD = { ar: ["cairo-arabic", "cairo-latin"], fr: ["cairo-latin"], en: ["cairo-latin"] };
const OG_LOCALE = { ar: "ar_DZ", fr: "fr_DZ", en: "en_US" };

function head({ locale, path, title, description, preload, jsonLd = [] }) {
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
<meta name="theme-color" content="#f1f1ef" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
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
</head>`;
}

/* ───────────────────────────── chrome ───────────────────────────── */

const MARK = `<svg class="mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)"/><rect x="7" y="8" width="18" height="6" rx="2" fill="var(--accent-ink)"/><rect x="7" y="18" width="11" height="6" rx="2" fill="var(--accent-ink)"/></svg>`;

function header({ locale, pageId, path }) {
  const t = COPY[locale];
  const on = (id) => pageId === id || (id === "product" && pageId.startsWith("module:"));
  const link = (id, label) => `<li><a href="${href(locale, id)}"${on(id) ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`;
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
${link("product", t.nav.product)}${link("integrations", t.nav.integrations)}${link("pricing", t.nav.pricing)}${link("security", t.nav.resourceLinks.security[0])}${link("help", t.nav.resourceLinks.help[0])}
</ul></nav>
<div class="nav-tools">
<p class="langs">${langs}</p>
<a class="btn btn-primary" href="${href(locale, "download")}">${esc(t.nav.resourceLinks.download[0])}</a>
</div>
</div>
</details>
</div>
</header>`;
}

/** The name returns at full width, set as type. */
function wordmark(locale) {
  return `<a class="foot-word" href="${href(locale)}" aria-label="SahelFlow" dir="ltr"><span class="fw" aria-hidden="true">SahelFlow</span></a>`;
}

function footer(locale) {
  const t = COPY[locale];
  const year = new Date().getFullYear();
  const col = (title, links) =>
    `<div class="foot-col"><h2>${esc(title)}</h2><ul>${links.map(([url, label]) => `<li><a href="${url}">${esc(label)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer">
<div class="foot-in">
${wordmark(locale)}
<div class="foot-brand">
<p>${esc(t.footer.tagline)}</p>
<p class="foot-note">${esc(t.common.whatsappNote)}</p>
<p class="foot-contact"><a href="${whatsappHref(t.whatsappMessage)}" rel="noopener"><span dir="ltr">${esc(phoneDisplay())}</span></a> <a href="mailto:${SITE.email}"><span dir="ltr">${esc(SITE.email)}</span></a></p>
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
</div>
<div class="foot-in foot-bottom">
<p>© ${year} SahelFlow. ${esc(t.footer.rights)} ${esc(t.footer.made)}</p>
<p class="langs">${SITE.locales.map((l) => `<a href="${href(l)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(COPY[l].name)}</a>`).join("")}</p>
</div>
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
