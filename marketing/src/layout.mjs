// Document shell for every page: <head>, the mega-menu header and the
// footer. Everything works without JavaScript; site.js adds
// hover intent, keyboard support and the mobile sheet.
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { BRAND_NAMES, MODULES, PACKAGE, SOLUTIONS } from "./model.mjs";
import { esc, href, icon, phoneDisplay, shotUrl, whatsappHref } from "./ui.mjs";

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
      ...(PACKAGE.priceDzd ? [{ "@type": "Offer", price: String(PACKAGE.launchOfferDzd ?? PACKAGE.priceDzd), priceCurrency: "DZD", description: "Permanent licence" }] : []),
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
  const font = locale === "ar" ? "arabic" : "latin";
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#05070c">
<meta name="color-scheme" content="dark">
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
<link rel="preload" href="/fonts/readex-${font}.woff2" as="font" type="font/woff2" crossorigin>
${preload ? `<link rel="preload" as="image" href="${preload}" fetchpriority="high">` : ""}
<link rel="stylesheet" href="/assets/site.css?v=${SITE.asset}">
<script>document.documentElement.classList.replace("no-js","js")</script>
<script type="speculationrules">{"prefetch":[{"where":{"href_matches":"/${locale}/*"},"eagerness":"moderate"}]}</script>
${[app, org, ...jsonLd].map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`).join("\n")}
<script defer src="/assets/site.js?v=${SITE.asset}"></script>
</head>`;
}

/* ───────────────────────────── header ───────────────────────────── */

function moduleLink(locale, module, current) {
  const m = COPY[locale].modules[module.key];
  const here = current === `module:${module.key}` ? ' aria-current="page"' : "";
  return `<li><a class="mega-link" href="${href(locale, `product/${module.key}`)}" data-preview="${module.shot ? shotUrl(module.shot, locale) : ""}" data-preview-title="${esc(m.name)}" data-preview-text="${esc(m.short)}" style="--hue:${module.hue}"${here}>
  <span class="mega-icon">${icon(module.icon)}</span>
  <span class="mega-text"><strong>${esc(m.name)}</strong><small>${esc(m.short)}</small></span>
</a></li>`;
}

function megaProduct(locale, current) {
  const t = COPY[locale];
  return `<div class="mega mega-wide" id="mega-product" data-mega-panel>
  <div class="mega-body">
    <div class="mega-main">
      <p class="mega-title">${esc(t.nav.platformTitle)}</p>
      <ul class="mega-grid">${MODULES.map((m) => moduleLink(locale, m, current)).join("")}</ul>
    </div>
    <aside class="mega-side">
      <a class="mega-preview" href="${href(locale, "product")}" data-preview-card>
        <span class="mega-preview-media"><img src="${shotUrl("dashboard", locale)}" width="1600" height="1000" alt="" loading="lazy" decoding="async" data-preview-img></span>
        <strong data-preview-name>${esc(t.nav.platformOverview)}</strong>
        <small data-preview-desc>${esc(t.nav.platformOverviewText)}</small>
      </a>
    </aside>
  </div>
  <div class="mega-foot">
    <a href="${href(locale, "product")}">${icon("layers")}<span>${esc(t.nav.platformOverview)}</span></a>
    <a href="${href(locale, "integrations")}">${icon("sheet")}<span>${esc(t.nav.integrations)}</span></a>
    <a href="${href(locale, "why")}">${icon("scale")}<span>${esc(t.nav.why)}</span></a>
  </div>
</div>`;
}

function megaSolutions(locale, current) {
  const t = COPY[locale];
  const items = SOLUTIONS.map((s) => {
    const c = t.solutions[s.key];
    const here = current === `solution:${s.key}` ? ' aria-current="page"' : "";
    return `<li><a class="mega-link" href="${href(locale, `solutions/${s.key}`)}"${here}>
  <span class="mega-icon">${icon(s.icon)}</span>
  <span class="mega-text"><strong>${esc(c.name)}</strong><small>${esc(c.short)}</small></span>
</a></li>`;
  }).join("");
  return `<div class="mega" id="mega-solutions" data-mega-panel>
  <div class="mega-body">
    <div class="mega-main">
      <p class="mega-title">${esc(t.nav.solutionsTitle)}</p>
      <ul class="mega-grid mega-grid-2">${items}</ul>
    </div>
    <aside class="mega-side">
      <a class="mega-feature" href="${href(locale, "integrations")}#sheets">
        <span class="badge badge-new">${esc(t.nav.featured)}</span>
        <span class="mega-feature-art" aria-hidden="true">${sheetArt()}</span>
        <strong>${esc(t.nav.featuredTitle)}</strong>
        <small>${esc(t.nav.featuredText)}</small>
      </a>
    </aside>
  </div>
</div>`;
}

function sheetArt() {
  const rows = [["ORD-0128", "ok"], ["ORD-0129", "ok"], ["ORD-0130", "wait"], ["ORD-0131", "new"]];
  return `<span class="sheet-art">${rows
    .map(([id, s], i) => `<span class="sheet-row" style="--i:${i}"><b>${id}</b><i class="sheet-cell"></i><i class="sheet-cell"></i><em class="sheet-status is-${s}"></em></span>`)
    .join("")}</span>`;
}

function megaResources(locale, current) {
  const t = COPY[locale];
  const entries = [
    ["help", "help"],
    ["security", "shield"],
    ["download", "download"],
    ["contact", "message"],
  ];
  const items = entries
    .map(([key, ic]) => {
      const [name, text] = t.nav.resourceLinks[key];
      const here = current === key ? ' aria-current="page"' : "";
      return `<li><a class="mega-link" href="${href(locale, key)}"${here}><span class="mega-icon">${icon(ic)}</span><span class="mega-text"><strong>${esc(name)}</strong><small>${esc(text)}</small></span></a></li>`;
    })
    .join("");
  return `<div class="mega mega-narrow" id="mega-resources" data-mega-panel>
  <div class="mega-body">
    <div class="mega-main">
      <p class="mega-title">${esc(t.nav.resourcesTitle)}</p>
      <ul class="mega-grid mega-grid-1">${items}</ul>
    </div>
    <aside class="mega-side">
      <a class="mega-feature mega-why" href="${href(locale, "why")}">
        <span class="mega-icon">${icon("scale")}</span>
        <strong>${esc(t.nav.why)}</strong>
        <small>${esc(t.nav.whyText)}</small>
      </a>
    </aside>
  </div>
</div>`;
}

function header(ctx) {
  const { locale, pageId, path } = ctx;
  const t = COPY[locale];
  const isCurrent = (...ids) => ids.some((id) => pageId === id || pageId.startsWith(`${id}:`));
  const trigger = (id, label, active) =>
    `<button class="nav-trigger" type="button" aria-expanded="false" aria-controls="mega-${id}" data-mega-trigger="${id}"${active ? ' data-active="true"' : ""}><span>${esc(label)}</span>${icon("chevron", "nav-chevron")}</button>`;
  const link = (id, label) =>
    `<a class="nav-link" href="${href(locale, id)}"${pageId === id ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  const langs = SITE.locales
    .map(
      (l) =>
        `<a href="${href(l, path)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}><span>${esc(COPY[l].name)}</span>${l === locale ? icon("check") : ""}</a>`,
    )
    .join("");
  return `<a class="skip-link" href="#main">${esc(t.common.skip)}</a>
<header class="site-header" data-header>
  <div class="header-bar">
    <a class="brand" href="${href(locale)}" aria-label="SahelFlow">
      <img src="/img/mark.svg" alt="" width="28" height="28"><span>SahelFlow</span>
    </a>
    <nav class="main-nav" aria-label="${esc(t.nav.menu)}" id="main-nav" data-nav>
      <ul class="nav-list">
        <li class="nav-item" data-mega="product">${trigger("product", t.nav.product, isCurrent("product", "module"))}${megaProduct(locale, pageId)}</li>
        <li class="nav-item" data-mega="solutions">${trigger("solutions", t.nav.solutions, isCurrent("solution"))}${megaSolutions(locale, pageId)}</li>
        <li class="nav-item">${link("integrations", t.nav.integrations)}</li>
        <li class="nav-item">${link("pricing", t.nav.pricing)}</li>
        <li class="nav-item" data-mega="resources">${trigger("resources", t.nav.resources, isCurrent("help", "security", "download", "contact", "why"))}${megaResources(locale, pageId)}</li>
      </ul>
      <div class="nav-sheet-cta">
        <a class="btn btn-primary btn-lg" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.nav.start)}</span></a>
        <a class="btn btn-glass btn-lg" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${icon("whatsapp")}<span>${esc(t.nav.talk)}</span></a>
      </div>
    </nav>
    <div class="header-actions">
      <details class="lang-menu" data-lang-menu>
        <summary aria-label="${esc(t.nav.language)}">${icon("globe")}<span>${esc(locale.toUpperCase())}</span></summary>
        <div class="lang-list">${langs}</div>
      </details>
      <a class="btn btn-primary btn-sm header-cta" href="${href(locale, "download")}"><span>${esc(t.nav.start)}</span>${icon("arrow", "flip")}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="${esc(t.nav.menu)}" data-nav-toggle><span></span><span></span></button>
    </div>
  </div>
  <div class="mega-scrim" aria-hidden="true" data-mega-scrim></div>
</header>`;
}

/* ───────────────────────────── footer ───────────────────────────── */

function footer(locale) {
  const t = COPY[locale];
  const year = new Date().getFullYear();
  const col = (title, links) =>
    `<div class="footer-col"><h2>${esc(title)}</h2><ul>${links.map(([url, label]) => `<li><a href="${url}">${esc(label)}</a></li>`).join("")}</ul></div>`;
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="${href(locale)}"><img src="/img/mark.svg" alt="" width="30" height="30"><span>SahelFlow</span></a>
      <p>${esc(t.footer.tagline)}</p>
      <a class="footer-wa" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${icon("whatsapp")}<span dir="ltr">${esc(phoneDisplay())}</span></a>
      <a class="footer-mail" href="mailto:${SITE.email}">${icon("mail")}<span dir="ltr">${esc(SITE.email)}</span></a>
    </div>
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
  <div class="container footer-bottom">
    <p>© ${year} SahelFlow. ${esc(t.footer.rights)} <span class="footer-made">${esc(t.footer.made)}</span></p>
    <p class="footer-langs">${SITE.locales.map((l) => `<a href="${href(l)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(COPY[l].name)}</a>`).join("")}</p>
  </div>
  <div class="footer-wordmark" aria-hidden="true">SahelFlow</div>
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
