import { CONTENT, INTEGRATIONS } from "./content.mjs";
import { ICONS } from "./icons.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { SITE, whatsappHref } from "./config.mjs";

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const call = (value) => (typeof value === "function" ? value(SITE.trialDays) : value);

/** Locale-aware path: /ar/, /fr/download/ … */
const href = (locale, page = "") => `/${locale}/${page ? `${page}/` : ""}`;

function head({ t, locale, page, title, description, screenshot }) {
  const canonical = `${SITE.origin}${href(locale, page)}`;
  const alternates = SITE.locales
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE.origin}${href(l, page)}">`)
    .join("");
  const ld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SahelFlow",
    operatingSystem: "Windows 10, Windows 11",
    applicationCategory: "BusinessApplication",
    description: CONTENT[locale].meta.description,
    url: SITE.origin,
    inLanguage: SITE.locales,
    offers: { "@type": "Offer", price: "0", priceCurrency: "DZD", description: `${SITE.trialDays}-day free trial` },
  };
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#05070d">
<link rel="canonical" href="${canonical}">
${alternates}<link rel="alternate" hreflang="x-default" href="${SITE.origin}${href(SITE.defaultLocale, page)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SahelFlow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE.origin}/img/og-${locale}.png">
<meta property="og:locale" content="${{ ar: "ar_DZ", fr: "fr_DZ", en: "en_US" }[locale]}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/img/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/assets/site.css">
${screenshot ? `<link rel="preload" as="image" href="${screenshot}">` : ""}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script defer src="/assets/site.js"></script>
</head>`;
}

function header(t, locale, page) {
  const links = [
    ["features", t.nav.features],
    ["how", t.nav.how],
    ["integrations", t.nav.integrations],
    ["security", t.nav.security],
    ["faq", t.nav.faq],
  ]
    .map(([id, label]) => `<a href="${href(locale)}#${id}">${esc(label)}</a>`)
    .join("");
  const langs = SITE.locales
    .map(
      (l) =>
        `<a href="${href(l, page)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(CONTENT[l].name)}</a>`,
    )
    .join("");
  return `<header class="site-header" data-header>
  <div class="container header-row">
    <a class="brand" href="${href(locale)}" aria-label="SahelFlow">
      <img src="/img/mark.svg" alt="" width="30" height="30"><span>SahelFlow</span>
    </a>
    <nav class="main-nav" aria-label="${esc(t.nav.menu)}" data-nav>${links}</nav>
    <div class="header-actions">
      <details class="lang-menu">
        <summary aria-label="${esc(t.nav.language)}">${ICONS.globe}<span>${esc(t.name)}</span></summary>
        <div class="lang-list">${langs}</div>
      </details>
      <a class="btn btn-primary btn-sm hide-sm" href="${href(locale, "download")}">${esc(t.nav.trial)}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-label="${esc(t.nav.menu)}" data-nav-toggle>${ICONS.menu}</button>
    </div>
  </div>
</header>`;
}

function footer(t, locale) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="${href(locale)}"><img src="/img/mark.svg" alt="" width="28" height="28"><span>SahelFlow</span></a>
      <p>${esc(t.footer.tagline)}</p>
    </div>
    <div>
      <h3>${esc(t.footer.product)}</h3>
      <a href="${href(locale)}#features">${esc(t.nav.features)}</a>
      <a href="${href(locale)}#integrations">${esc(t.nav.integrations)}</a>
      <a href="${href(locale)}#security">${esc(t.nav.security)}</a>
      <a href="${href(locale, "download")}">${esc(t.nav.download)}</a>
    </div>
    <div>
      <h3>${esc(t.footer.contact)}</h3>
      <a href="${whatsappHref(t.whatsappMessage)}" rel="noopener">WhatsApp</a>
      <a href="mailto:${SITE.email}">${SITE.email}</a>
      <a href="${href(locale)}#faq">${esc(t.nav.faq)}</a>
    </div>
    <div>
      <h3>${esc(t.footer.legal)}</h3>
      <a href="${href(locale, "privacy")}">${esc(t.footer.privacy)}</a>
      <a href="${href(locale, "terms")}">${esc(t.footer.terms)}</a>
    </div>
  </div>
  <div class="container footer-base"><span>© ${year} SahelFlow. ${esc(t.footer.rights)}</span><span class="footer-langs">${SITE.locales
    .map((l) => `<a href="${href(l)}" data-set-lang="${l}" lang="${l}">${esc(CONTENT[l].name)}</a>`)
    .join("")}</span></div>
</footer>`;
}

function shell(ctx, body) {
  return `${head(ctx)}
<body class="locale-${ctx.locale}">
<a class="skip" href="#main">${ctx.locale === "ar" ? "تخطَّ إلى المحتوى" : ctx.locale === "fr" ? "Aller au contenu" : "Skip to content"}</a>
${header(ctx.t, ctx.locale, ctx.page)}
<main id="main">${body}</main>
${footer(ctx.t, ctx.locale)}
</body>
</html>`;
}

function shotFrame(src, alt, extra = "") {
  return `<figure class="shot ${extra}">
  <div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span>SahelFlow</span></div>
  <img src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async" width="1440" height="900">
</figure>`;
}

export function homePage(locale, shots) {
  const t = CONTENT[locale];
  const wa = whatsappHref(t.whatsappMessage);
  const heroShot = shots("dashboard");
  const marquee = [...INTEGRATIONS, ...INTEGRATIONS]
    .map((name) => `<li>${esc(name)}</li>`)
    .join("");
  const features = t.features.items
    .map(
      (item, index) => `<article class="feature${index % 2 ? " flip" : ""} reveal" id="feature-${item.key}">
  <div class="feature-copy">
    <span class="feature-icon">${ICONS[item.key] ?? ""}</span>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.text)}</p>
    <ul class="checks">${item.points.map((p) => `<li>${ICONS.check}<span>${esc(p)}</span></li>`).join("")}</ul>
  </div>
  <div class="feature-media">${shotFrame(shots(item.key), item.title)}</div>
</article>`,
    )
    .join("\n");
  const body = `
<section class="hero">
  <div class="hero-bg" aria-hidden="true"><span class="orb orb-a"></span><span class="orb orb-b"></span><span class="orb orb-c"></span><span class="grid"></span></div>
  <div class="container hero-inner">
    <p class="eyebrow reveal">${esc(t.hero.eyebrow)}</p>
    <h1 class="reveal"><span>${esc(t.hero.title[0])}</span> <span class="gradient">${esc(t.hero.title[1])}</span></h1>
    <p class="lead reveal">${esc(t.hero.lead)}</p>
    <div class="cta-row reveal">
      <a class="btn btn-primary btn-lg" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.hero.primary)}</span></a>
      <a class="btn btn-ghost btn-lg" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(t.hero.secondary)}</span></a>
    </div>
    <p class="note reveal">${esc(call(t.hero.note))}</p>
    <ul class="trust reveal">${t.hero.trust.map((x) => `<li>${ICONS.check}<span>${esc(x)}</span></li>`).join("")}</ul>
  </div>
  <div class="container hero-visual reveal" data-tilt>
    ${shotFrame(heroShot, t.meta.title, "hero-shot")}
    <div class="float float-a" aria-hidden="true">${ICONS.inbox}<span>${locale === "ar" ? "طلب جديد من واتساب" : locale === "fr" ? "Nouvelle commande WhatsApp" : "New WhatsApp order"}</span></div>
    <div class="float float-b" aria-hidden="true">${ICONS.check}<span>${locale === "ar" ? "تم التأكيد · الجزائر 16" : locale === "fr" ? "Confirmée · Alger 16" : "Confirmed · Algiers 16"}</span></div>
    <div class="float float-c" aria-hidden="true">${ICONS.delivery}<span>${locale === "ar" ? "مُسلَّم · 4 500 دج" : locale === "fr" ? "Livrée · 4 500 DA" : "Delivered · 4,500 DZD"}</span></div>
  </div>
</section>

<section class="strip" id="integrations" aria-label="${esc(t.nav.integrations)}">
  <p class="container strip-title">${esc(t.strip)}</p>
  <div class="marquee"><ul>${marquee}</ul></div>
</section>

<section class="section problem">
  <div class="container">
    <p class="eyebrow reveal">${esc(t.problem.eyebrow)}</p>
    <h2 class="reveal">${esc(t.problem.title)}</h2>
    <div class="cards three">${t.problem.items
      .map((item, i) => `<article class="card reveal" style="--d:${i * 80}ms"><span class="card-num">0${i + 1}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`)
      .join("")}</div>
  </div>
</section>

<section class="section features" id="features">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow reveal">${esc(t.features.eyebrow)}</p>
      <h2 class="reveal">${esc(t.features.title)}</h2>
      <p class="lead reveal">${esc(t.features.lead)}</p>
    </div>
    <nav class="feature-tabs reveal" aria-label="${esc(t.nav.features)}">${t.features.items
      .map((item) => `<a href="#feature-${item.key}">${ICONS[item.key] ?? ""}<span>${esc(item.title)}</span></a>`)
      .join("")}</nav>
    ${features}
  </div>
</section>

<section class="section how" id="how">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow reveal">${esc(t.how.eyebrow)}</p>
      <h2 class="reveal">${esc(t.how.title)}</h2>
    </div>
    <ol class="steps">${t.how.steps
      .map((s, i) => `<li class="reveal" style="--d:${i * 100}ms"><span class="step-num">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`)
      .join("")}</ol>
  </div>
</section>

<section class="section algeria">
  <div class="container">
    <div class="section-head">
      <p class="eyebrow reveal">${esc(t.algeria.eyebrow)}</p>
      <h2 class="reveal">${esc(t.algeria.title)}</h2>
    </div>
    <div class="cards four">${t.algeria.items
      .map((item, i) => `<article class="card stat reveal" style="--d:${i * 70}ms"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`)
      .join("")}</div>
  </div>
</section>

<section class="section security" id="security">
  <div class="container security-grid">
    <div>
      <p class="eyebrow reveal">${esc(t.security.eyebrow)}</p>
      <h2 class="reveal">${esc(t.security.title)}</h2>
      <p class="lead reveal">${esc(t.security.lead)}</p>
    </div>
    <div class="cards two">${t.security.items
      .map((item, i) => `<article class="card reveal" style="--d:${i * 70}ms"><span class="feature-icon">${[ICONS.lock, ICONS.wifiOff, ICONS.backup, ICONS.team][i]}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`)
      .join("")}</div>
  </div>
</section>

<section class="section trial-band">
  <div class="container trial-card reveal">
    <h2>${esc(t.trial.title)}</h2>
    <p>${esc(call(t.trial.text))}</p>
    <div class="cta-row">
      <a class="btn btn-primary btn-lg" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.trial.primary)}</span></a>
      <a class="btn btn-ghost btn-lg" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(t.trial.secondary)}</span></a>
    </div>
  </div>
</section>

<section class="section faq" id="faq">
  <div class="container narrow">
    <div class="section-head">
      <p class="eyebrow reveal">${esc(t.faq.eyebrow)}</p>
      <h2 class="reveal">${esc(t.faq.title)}</h2>
    </div>
    <div class="faq-list">${t.faq.items
      .map((item) => `<details class="reveal"><summary>${esc(item.q)}</summary><p>${esc(call(item.a))}</p></details>`)
      .join("")}</div>
  </div>
</section>`;
  return shell({ t, locale, page: "", title: t.meta.title, description: t.meta.description, screenshot: heroShot }, body);
}

export function downloadPage(locale) {
  const t = CONTENT[locale];
  const d = t.download;
  const body = `
<section class="page-hero">
  <div class="hero-bg" aria-hidden="true"><span class="orb orb-a"></span><span class="orb orb-b"></span></div>
  <div class="container narrow center">
    <span class="windows-badge">${ICONS.windows}</span>
    <h1 class="reveal">${esc(d.title)}</h1>
    <p class="lead reveal">${esc(d.lead)}</p>
    <div class="cta-row center reveal">
      <a class="btn btn-primary btn-lg" href="${SITE.downloadUrl}" rel="noopener">${ICONS.download}<span>${esc(d.button)}</span></a>
    </div>
    <p class="note reveal">${esc(call(t.hero.note))}</p>
  </div>
</section>
<section class="section">
  <div class="container download-grid">
    <article class="card reveal"><h2 class="h3">${esc(d.stepsTitle)}</h2><ol class="numbered">${d.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></article>
    <article class="card reveal"><h2 class="h3">${esc(d.requirementsTitle)}</h2><ul class="checks">${d.requirements.map((r) => `<li>${ICONS.check}<span>${esc(r)}</span></li>`).join("")}</ul></article>
  </div>
  <div class="container center help-row reveal"><span>${esc(d.help)}</span> <a class="btn btn-ghost" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${ICONS.whatsapp}<span>WhatsApp</span></a></div>
</section>`;
  return shell({ t, locale, page: "download", title: `${d.title} — SahelFlow`, description: d.lead }, body);
}

export function legalPage(locale, kind) {
  const t = CONTENT[locale];
  const title = kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle;
  const sections = (kind === "privacy" ? PRIVACY : TERMS)[locale];
  const body = `
<section class="page-hero compact"><div class="container narrow"><h1>${esc(title)}</h1><p class="note">${esc(t.legal.updated)}: ${LEGAL_UPDATED}</p></div></section>
<section class="section legal"><div class="container narrow">${sections
    .map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`)
    .join("")}</div></section>`;
  return shell({ t, locale, page: kind, title: `${title} — SahelFlow`, description: title }, body);
}

export function notFoundPage() {
  const t = CONTENT[SITE.defaultLocale];
  const body = `<section class="page-hero"><div class="container narrow center"><p class="eyebrow">404</p><h1>${esc(t.notFound.title)}</h1><p class="lead">${esc(t.notFound.text)}</p><div class="cta-row center"><a class="btn btn-primary" href="/">${esc(t.notFound.back)}</a></div></div></section>`;
  return shell({ t, locale: SITE.defaultLocale, page: "", title: `404 — SahelFlow`, description: t.notFound.text }, body);
}

export function rootRedirect() {
  // Arabic by default; a visitor who chose another language keeps it.
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>SahelFlow</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${SITE.origin}/${SITE.defaultLocale}/">
<script>(function(){var l="${SITE.defaultLocale}";try{var s=localStorage.getItem("sf-lang");if(s==="ar"||s==="fr"||s==="en")l=s}catch(e){}location.replace("/"+l+"/"+location.hash)})()</script>
<meta http-equiv="refresh" content="0; url=/${SITE.defaultLocale}/">
</head><body style="background:#05070d"></body></html>`;
}
