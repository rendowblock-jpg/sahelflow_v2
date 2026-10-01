import { CONTENT, INTEGRATIONS } from "./content.mjs";
import { STORY } from "./story.mjs";
import { PAGES } from "./pages-copy.mjs";
import { ICONS } from "./icons.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { SITE, whatsappHref } from "./config.mjs";
import { CITIES, MAP_HEIGHT, MAP_WIDTH, arcPath, mapDots, outlinePath, project } from "./algeria.mjs";

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/** Icons nested inside an SVG scene need explicit geometry. */
const sized = (icon, n = 24) => icon.replace("<svg ", `<svg width="${n}" height="${n}" `);
const call = (value) => (typeof value === "function" ? value(SITE.trialDays) : value);
const money = (amount, locale) =>
  `${new Intl.NumberFormat("fr-FR").format(amount).replace(/[\u202f\u00a0 ]/g, "\u00a0")}\u00a0${locale === "ar" ? "دج" : "DA"}`;
/** Current licence price and the launch offer, from SITE (never invented). */
function licencePricing(locale) {
  const p = PAGES[locale].pricing.licence;
  if (!SITE.licencePrice) return { price: p.ask, ask: true, offer: null };
  if (!SITE.launchOfferPrice) return { price: money(SITE.licencePrice, locale), ask: false, offer: null };
  return {
    price: money(SITE.launchOfferPrice, locale),
    ask: false,
    offer: {
      regular: money(SITE.licencePrice, locale),
      label: p.offer(SITE.launchOfferSeats),
      then: p.then(money(SITE.licencePrice, locale)),
      save: p.save,
    },
  };
}
const moreLink = (url, label, cls = "") =>
  `<a class="more-link ${cls}" href="${url}"><span>${esc(label)}</span>${ICONS.arrow}</a>`;

/** Locale-aware path: /ar/, /fr/download/ … */
const href = (locale, page = "") => `/${locale}/${page ? `${page}/` : ""}`;

/* ─────────────────────────── document shell ─────────────────────────── */

function head({ t, locale, page, title, description, preload }) {
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
<html lang="${t.lang}" dir="${t.dir}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#04070d">
<meta name="color-scheme" content="dark">
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
<link rel="preload" href="/fonts/readex-${locale === "ar" ? "arabic" : "latin"}.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${SITE.asset}">
${preload ? `<link rel="preload" as="image" href="${preload}">` : ""}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script defer src="/assets/site.js?v=${SITE.asset}"></script>
</head>`;
}

/** Product modules in the order a seller meets them. */
const MODULES = ["inbox", "orders", "delivery", "risk", "accounting", "automations", "storefront", "agents"];
const featureByKey = (t, key) => t.features.items.find((item) => item.key === key);

function header(t, locale, page) {
  const p = PAGES[locale];
  const wa = whatsappHref(t.whatsappMessage);
  const current = (id) => (page === id ? ' aria-current="page"' : "");
  const langs = SITE.locales
    .map(
      (l) =>
        `<a href="${href(l, page)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? ' aria-current="true"' : ""}>${esc(CONTENT[l].name)}</a>`,
    )
    .join("");
  return `<header class="site-header" data-header>
  <div class="nav-pill">
    <a class="brand" href="${href(locale)}" aria-label="SahelFlow">
      <img src="/img/mark.svg" alt="" width="28" height="28"><span>SahelFlow</span>
    </a>
    <nav class="main-nav" aria-label="${esc(t.nav.menu)}" data-nav>
      <a class="nav-link" href="${href(locale, "product")}"${current("product")}>${esc(p.nav.product)}</a>
      <a class="nav-link" href="${href(locale, "pricing")}"${current("pricing")}>${esc(p.nav.pricing)}</a>
      <a class="nav-link" href="${href(locale, "download")}"${current("download")}>${esc(t.nav.download)}</a>
      <a class="nav-link" href="${href(locale)}#faq">${esc(p.nav.faq)}</a>
      <div class="nav-mobile-cta">
        <a class="btn btn-primary" href="${href(locale, "download")}">${ICONS.download}<span>${esc(p.nav.start)}</span></a>
        <a class="btn btn-glass" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(p.nav.talk)}</span></a>
      </div>
    </nav>
    <div class="header-actions">
      <details class="lang-menu">
        <summary aria-label="${esc(t.nav.language)}">${ICONS.globe}<span>${esc(locale.toUpperCase())}</span></summary>
        <div class="lang-list">${langs}</div>
      </details>
      <a class="btn btn-ghost btn-sm hide-md" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(p.nav.talk)}</span></a>
      <a class="btn btn-primary btn-sm hide-sm" href="${href(locale, "download")}"><span>${esc(p.nav.start)}</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-label="${esc(t.nav.menu)}" data-nav-toggle>${ICONS.menu}${ICONS.close}</button>
    </div>
  </div>
</header>`;
}

function footer(t, locale) {
  const p = PAGES[locale];
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="${href(locale)}"><img src="/img/mark.svg" alt="" width="30" height="30"><span>SahelFlow</span></a>
      <p>${esc(t.footer.tagline)}</p>
      <a class="footer-wa" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${ICONS.whatsapp}<span dir="ltr">+213 791 99 91 57</span></a>
      <a class="btn btn-primary btn-sm footer-cta" href="${href(locale, "download")}">${ICONS.download}<span>${esc(p.nav.start)}</span></a>
    </div>
    <div>
      <h3>${esc(p.nav.product)}</h3>
      ${MODULES.map((key) => `<a href="${href(locale, "product")}#${key}">${esc(featureByKey(t, key).title)}</a>`).join("")}
    </div>
    <div>
      <h3>SahelFlow</h3>
      <a href="${href(locale, "integrations")}">${esc(p.nav.integrations)}</a>
      <a href="${href(locale, "security")}">${esc(p.nav.security)}</a>
      <a href="${href(locale, "pricing")}">${esc(p.nav.pricing)}</a>
      <a href="${href(locale, "download")}">${esc(t.nav.download)}</a>
      <a href="${href(locale)}#faq">${esc(p.nav.faq)}</a>
    </div>
    <div>
      <h3>${esc(t.footer.contact)}</h3>
      <a href="${whatsappHref(t.whatsappMessage)}" rel="noopener">WhatsApp</a>
      <a href="mailto:${SITE.email}">${SITE.email}</a>
      <h3 class="footer-sub">${esc(t.footer.legal)}</h3>
      <a href="${href(locale, "privacy")}">${esc(t.footer.privacy)}</a>
      <a href="${href(locale, "terms")}">${esc(t.footer.terms)}</a>
    </div>
  </div>
  <div class="footer-word" aria-hidden="true">SahelFlow</div>
  <div class="container footer-base"><span>© ${year} SahelFlow. ${esc(t.footer.rights)}</span><span class="footer-langs">${SITE.locales
    .map((l) => `<a href="${href(l)}" data-set-lang="${l}" lang="${l}">${esc(CONTENT[l].name)}</a>`)
    .join("")}</span></div>
</footer>`;
}

function shell(ctx, body) {
  return `${head(ctx)}
<body class="locale-${ctx.locale} page-${ctx.page || "home"}">
<a class="skip" href="#main">${ctx.locale === "ar" ? "تخطَّ إلى المحتوى" : ctx.locale === "fr" ? "Aller au contenu" : "Skip to content"}</a>
${header(ctx.t, ctx.locale, ctx.page)}
<main id="main">${body}</main>
${footer(ctx.t, ctx.locale)}
</body>
</html>`;
}

/* ─────────────────────────── shared art ─────────────────────────── */

function dunes(id, tone = "dusk") {
  // Three Sahel ridgelines; the furthest catches the horizon light.
  return `<svg class="dunes dunes-${tone}" viewBox="0 0 1600 360" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3352"/><stop offset="1" stop-color="#0a1424"/></linearGradient>
    <linearGradient id="${id}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#122540"/><stop offset="1" stop-color="#070e1a"/></linearGradient>
    <linearGradient id="${id}-c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1626"/><stop offset="1" stop-color="#04070d"/></linearGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f5b85b" stop-opacity="0"/><stop offset=".5" stop-color="#f5b85b" stop-opacity=".55"/><stop offset="1" stop-color="#f5b85b" stop-opacity="0"/></linearGradient>
  </defs>
  <path data-depth="0.15" fill="url(#${id}-a)" d="M0 170C160 120 300 112 470 138S760 196 930 160 1260 92 1420 110 1600 150 1600 150V360H0Z"/>
  <path data-depth="0.15" fill="none" stroke="url(#${id}-rim)" stroke-width="1.5" d="M0 170C160 120 300 112 470 138S760 196 930 160 1260 92 1420 110 1600 150 1600 150"/>
  <path data-depth="0.3" fill="url(#${id}-b)" d="M0 238C210 188 380 196 560 226S880 262 1080 220 1420 186 1600 214V360H0Z"/>
  <path data-depth="0.5" fill="url(#${id}-c)" d="M0 300C240 262 470 280 700 296S1100 318 1330 286 1600 270 1600 270V360H0Z"/>
</svg>`;
}

function stars(count = 70, seed = 7) {
  let x = seed;
  const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  let dots = "";
  for (let i = 0; i < count; i++) {
    const r = rand() < 0.12 ? 1.4 : 0.8;
    dots += `<circle cx="${(rand() * 1600).toFixed(0)}" cy="${(rand() * 520).toFixed(0)}" r="${r}" style="--tw:${(2 + rand() * 4).toFixed(1)}s;--td:${(rand() * 4).toFixed(1)}s"/>`;
  }
  return `<svg class="stars" viewBox="0 0 1600 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#cfe6ff">${dots}</g><path class="shooting" d="M1180 70 L1380 20" stroke="url(#shoot)" stroke-width="1.6" stroke-linecap="round"/><defs><linearGradient id="shoot" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs></svg>`;
}

/* ─────────────────────────── hero ─────────────────────────── */

function heroDemo(s, locale) {
  const d = s.demo;
  const nav = [
    ["inbox", ICONS.inbox, d.app.inbox],
    ["orders", ICONS.orders, d.app.orders],
    ["delivery", ICONS.delivery, d.app.delivery],
    ["accounting", ICONS.accounting, d.app.accounting],
    ["agents", ICONS.agents, d.app.agents],
  ];
  return `<div class="device" data-demo aria-label="${esc(d.label)}" role="img">
  <div class="device-bar"><i></i><i></i><i></i><span>SahelFlow</span><b>${ICONS.search}</b></div>
  <div class="device-body">
    <aside class="d-side">
      <img src="/img/mark.svg" alt="" width="22" height="22">
      ${nav.map(([k, icon, label], i) => `<span class="d-nav${i === 0 ? " is-active" : ""}" title="${esc(label)}">${icon}<em>${esc(label)}</em></span>`).join("")}
    </aside>
    <section class="d-chat">
      <header class="d-chat-head"><span class="d-avatar">A</span><div><strong>${esc(d.customer)}</strong><small><i></i>${esc(d.online)}</small></div><span class="d-wa">${ICONS.whatsapp}</span></header>
      <div class="d-thread">
        <p class="bubble in b1">${esc(d.msg1)}<time dir="ltr">10:42</time></p>
        <p class="bubble in b2">${esc(d.msg2)}<time dir="ltr">10:42</time></p>
        <p class="typing" aria-hidden="true"><i></i><i></i><i></i></p>
        <p class="bubble out b3">${esc(d.reply)}<time dir="ltr">10:43 ✓✓</time></p>
      </div>
      <div class="d-compose"><span></span><b>${ICONS.sparkle}</b></div>
    </section>
    <section class="d-panel">
      <div class="d-kpis">${d.kpis.map(([k, v]) => `<div><small>${esc(k)}</small><strong dir="auto">${esc(v)}</strong></div>`).join("")}</div>
      <article class="d-extract">
        <header>${ICONS.sparkle}<span>${esc(d.ai)}</span><i class="scan"></i></header>
        <dl>${d.fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd dir="auto">${esc(v)}</dd></div>`).join("")}<div class="total"><dt>${esc(d.total[0])}</dt><dd dir="auto">${esc(d.total[1])}</dd></div></dl>
      </article>
      <article class="d-order">
        <header><strong dir="auto">${esc(d.order)}</strong><span class="status" data-status>${d.statuses.map((st, i) => `<em data-s="${i}">${esc(st)}</em>`).join("")}</span></header>
        <div class="track"><i></i><i></i><i></i><i></i><b></b></div>
        <footer><span>${ICONS.delivery}${esc(d.courier)}</span><span class="cash">${ICONS.coins}${esc(d.cash)}</span></footer>
      </article>
    </section>
  </div>
</div>`;
}

function hero(t, s, locale) {
  const wa = whatsappHref(t.whatsappMessage);
  const words = (line) =>
    line
      .split(" ")
      .map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`)
      .join(" ");
  return `<section class="hero" data-hero>
  <div class="hero-sky" aria-hidden="true">${stars(90, 11)}<div class="sun"></div></div>
  <canvas class="flow" data-flow aria-hidden="true"></canvas>
  <div class="hero-copy">
    <a class="eyebrow-pill" href="#how"><span class="dot"></span><span>${esc(s.heroEyebrow)}</span>${ICONS.arrow}</a>
    <h1 class="display" data-split><span class="line">${words(t.hero.title[0])}</span><span class="line grad">${words(t.hero.title[1])}</span></h1>
    <p class="lead hero-lead">${esc(t.hero.lead)}</p>
    <div class="cta-row">
      <a class="btn btn-primary btn-lg btn-glow" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.hero.primary)}</span></a>
      <a class="btn btn-glass btn-lg" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(t.hero.secondary)}</span></a>
    </div>
    <p class="hero-note">${esc(call(t.hero.note))}</p>
  </div>
  <div class="stage" data-stage>
    <div class="stage-inner" data-tilt>
      ${heroDemo(s, locale)}
      <div class="float f-ai" aria-hidden="true">${ICONS.sparkle}<span>${esc(s.demo.ai)}</span></div>
      <div class="float f-ship" aria-hidden="true">${ICONS.delivery}<span>${esc(s.demo.courier)}</span><b>${esc(s.demo.statuses[2])}</b></div>
      <div class="float f-cash" aria-hidden="true">${ICONS.coins}<span dir="auto">+ ${esc(s.demo.total[1])}</span></div>
    </div>
    <div class="stage-glow" aria-hidden="true"></div>
  </div>
  ${dunes("hd")}
</section>`;
}

/* ─────────────────────────── journey (isometric scene) ─────────────────────────── */

const ISO_C = Math.cos(Math.PI / 6);
const iso = (x, y, z = 0) => [+((x - y) * ISO_C).toFixed(1), +((x + y) * 0.5 - z).toFixed(1)];
const pts = (list) => list.map((p) => p.join(",")).join(" ");

function isoPlatform(cx, cy, size, h, idx) {
  const s = size / 2;
  const at = (x, y, z) => {
    const [px, py] = iso(x, y, z);
    return [+(cx + px).toFixed(1), +(cy + py).toFixed(1)];
  };
  const top = [at(-s, -s, h), at(s, -s, h), at(s, s, h), at(-s, s, h)];
  const left = [at(-s, s, h), at(s, s, h), at(s, s, 0), at(-s, s, 0)];
  const right = [at(s, -s, h), at(s, s, h), at(s, s, 0), at(s, -s, 0)];
  const inner = [at(-s * 0.62, -s * 0.62, h), at(s * 0.62, -s * 0.62, h), at(s * 0.62, s * 0.62, h), at(-s * 0.62, s * 0.62, h)];
  return `<g class="plat" data-plat="${idx}">
    <polygon class="pl-left" points="${pts(left)}"/>
    <polygon class="pl-right" points="${pts(right)}"/>
    <polygon class="pl-top" points="${pts(top)}"/>
    <polygon class="pl-ring" points="${pts(inner)}"/>
  </g>`;
}

function journeyScene(steps) {
  const icons = [ICONS.message, ICONS.sparkle, ICONS.check, ICONS.delivery, ICONS.coins];
  const centers = [
    [190, 150],
    [470, 210],
    [250, 360],
    [540, 440],
    [330, 600],
  ];
  const path = `M${centers.map(([x, y]) => `${x},${y - 30}`).join(" L")}`;
  const plats = centers.map(([x, y], i) => isoPlatform(x, y - 18, 128, 18, i)).join("");
  const nodes = centers
    .map(
      ([x, y], i) => `<g class="node" data-node="${i}" transform="translate(${x} ${y - 92})">
      <ellipse class="node-shadow" cx="0" cy="62" rx="34" ry="11"/>
      <g class="node-bob"><rect class="node-card" x="-34" y="-34" width="68" height="68" rx="18"/><g class="node-icon" transform="translate(-15 -15) scale(1.25)">${sized(icons[i])}</g></g>
      <text class="node-num" x="0" y="96" text-anchor="middle">0${i + 1}</text>
    </g>`,
    )
    .join("");
  return `<svg class="iso" viewBox="0 0 760 700" aria-hidden="true">
  <defs>
    <linearGradient id="pl-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16314f"/><stop offset="1" stop-color="#0d1d33"/></linearGradient>
    <linearGradient id="pl-top-on" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6fa8"/><stop offset="1" stop-color="#0f3c63"/></linearGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#f5b85b"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g class="grid-floor">${Array.from({ length: 13 }, (_, i) => {
    const a = iso(-420 + i * 70, -420, 0);
    const b = iso(-420 + i * 70, 420, 0);
    const c = iso(-420, -420 + i * 70, 0);
    const d = iso(420, -420 + i * 70, 0);
    return `<line x1="${380 + a[0]}" y1="${380 + a[1]}" x2="${380 + b[0]}" y2="${380 + b[1]}"/><line x1="${380 + c[0]}" y1="${380 + c[1]}" x2="${380 + d[0]}" y2="${380 + d[1]}"/>`;
  }).join("")}</g>
  ${plats}
  <path class="rail" d="${path}"/>
  <path class="rail-lit" d="${path}" data-rail pathLength="1"/>
  ${nodes}
  <g class="parcel" data-parcel filter="url(#glow)"><polygon points="${pts([iso(-12, -12, 24), iso(12, -12, 24), iso(12, 12, 24), iso(-12, 12, 24)])}" class="pc-top"/><polygon points="${pts([iso(-12, 12, 24), iso(12, 12, 24), iso(12, 12, 0), iso(-12, 12, 0)])}" class="pc-left"/><polygon points="${pts([iso(12, -12, 24), iso(12, 12, 24), iso(12, 12, 0), iso(12, -12, 0)])}" class="pc-right"/></g>
</svg>`;
}

function journey(s) {
  return `<section class="journey" id="how" data-journey style="--steps:${s.loop.steps.length}">
  <div class="journey-sticky">
    <div class="container journey-grid">
      <div class="journey-copy">
        <p class="eyebrow">${esc(s.loop.eyebrow)}</p>
        <h2 class="h-xl">${esc(s.loop.title)}</h2>
        <ol class="steps" data-steps>${s.loop.steps
          .map((st, i) => `<li data-step="${i}"><span class="n">0${i + 1}</span><div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></div></li>`)
          .join("")}</ol>
        <div class="journey-bar"><i data-journey-bar></i></div>
      </div>
      <div class="journey-art">${journeyScene(s.loop.steps)}</div>
    </div>
  </div>
</section>`;
}

/* ─────────────────────────── bento (live micro-visuals) ─────────────────────────── */

function bentoVisual(key, s) {
  const d = s.demo;
  switch (key) {
    case "orders":
      return `<div class="v-queue">${[
        ["AB", d.fields[0][1], "16", "4 800", 0],
        ["YB", "Yacine Brahimi", "31", "26 200", 1],
        ["SM", "Sofiane Mazouz", "25", "18 600", 2],
        ["LM", "Leila Mansouri", "19", "2 000", 3],
      ]
        .map(
          ([ini, name, w, amt, i]) =>
            `<div class="q-row" style="--i:${i}"><span class="q-av">${ini}</span><span class="q-name" dir="auto">${esc(name)}</span><span class="q-w" dir="ltr">${w}</span><span class="q-amt" dir="ltr">${amt} DA</span><span class="q-st"><em>${esc(d.statuses[0])}</em><em>${esc(d.statuses[1])}</em></span></div>`,
        )
        .join("")}</div>`;
    case "inbox":
      return `<div class="v-chat"><p class="vb in">${esc(d.msg1)}</p><p class="vb in two">${esc(d.msg2)}</p><span class="v-ai">${ICONS.sparkle}<span>${esc(d.ai)}</span></span></div>`;
    case "delivery":
      return `<svg class="v-route" viewBox="0 0 320 150" aria-hidden="true"><path class="rt" d="M28 120 C 90 30, 200 150, 292 36"/><path class="rt-lit" d="M28 120 C 90 30, 200 150, 292 36" pathLength="1"/><circle class="pin" cx="28" cy="120" r="6"/><circle class="pin end" cx="292" cy="36" r="6"/><circle class="pin-pulse" cx="292" cy="36" r="6"/><g class="truck"><circle r="7"/><animateMotion dur="4.5s" repeatCount="indefinite" path="M28 120 C 90 30, 200 150, 292 36"/></g></svg>`;
    case "risk":
      return `<div class="v-gauge"><svg viewBox="0 0 200 120" aria-hidden="true"><defs><linearGradient id="gauge" x1="0" x2="1"><stop offset="0" stop-color="#34d399"/><stop offset=".55" stop-color="#f5b85b"/><stop offset="1" stop-color="#f87171"/></linearGradient></defs><path class="g-track" d="M20 105 A80 80 0 0 1 180 105"/><path class="g-arc" d="M20 105 A80 80 0 0 1 180 105" pathLength="1"/><g class="g-needle"><line x1="100" y1="105" x2="100" y2="42"/><circle cx="100" cy="105" r="7"/></g></svg><span class="g-val" dir="ltr">72</span></div>`;
    case "storefront":
      return `<div class="v-phone"><div class="ph-notch"></div><div class="ph-screen"><div class="ph-hero"></div><div class="ph-grid"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ph-buy">${esc(s.storeCta)}</div></div></div>`;
    case "automations":
      return `<svg class="v-flow" viewBox="0 0 360 130" aria-hidden="true"><path class="fl" d="M70 65 H150"/><path class="fl" d="M210 65 H290"/><g class="fn" transform="translate(40 65)"><circle r="28"/><g transform="translate(-12 -12)">${sized(ICONS.orders)}</g></g><g class="fn mid" transform="translate(180 65)"><circle r="28"/><text y="6" text-anchor="middle" dir="ltr">10′</text></g><g class="fn end" transform="translate(320 65)"><circle r="28"/><g transform="translate(-12 -12)">${sized(ICONS.whatsapp)}</g></g></svg>`;
    case "accounting":
      return `<div class="v-chart"><svg viewBox="0 0 320 130" aria-hidden="true"><g class="bars">${[38, 62, 48, 80, 66, 96, 74, 110]
        .map((h, i) => `<rect x="${14 + i * 38}" y="${122 - h}" width="22" height="${h}" rx="5" style="--i:${i}"/>`)
        .join("")}</g><path class="line" pathLength="1" d="M25 92 L63 70 L101 80 L139 52 L177 60 L215 36 L253 48 L291 22"/></svg><strong class="v-amt" dir="ltr" data-count="126400">126 400</strong><span class="v-cur">DA</span></div>`;
    case "agents":
      return `<div class="v-agent"><p class="vq" dir="auto">${esc(s.agentQ)}</p><p class="va" dir="auto"><span>${esc(s.agentA)}</span><i></i></p></div>`;
    default:
      return "";
  }
}


function bento(t, s, locale) {
  const extras = { storeCta: s.storeCta, agentQ: s.agentQ, agentA: s.agentA };
  const sx = { ...s, ...extras };
  return `<section class="section bento-section" id="features">
  <div class="container">
    <div class="section-head reveal">
      <p class="eyebrow">${esc(s.bento.eyebrow)}</p>
      <h2 class="h-xl">${esc(s.bento.title)}</h2>
      <p class="lead">${esc(t.features.lead)}</p>
    </div>
    <div class="bento">${t.features.items
      .map(
        (item, i) => `<article class="tile t-${item.key} reveal" data-spot style="--d:${(i % 4) * 70}ms">
      <div class="tile-art">${bentoVisual(item.key, sx)}</div>
      <div class="tile-copy"><span class="tile-icon">${ICONS[item.key]}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div>
    </article>`,
      )
      .join("")}</div>
    <div class="section-foot reveal">${moreLink(href(locale, "product"), PAGES[locale].more.product)}</div>
  </div>
</section>`;
}

/* ─────────────────────────── Algeria map ─────────────────────────── */

const ROUTES = ["oran", "constantine", "annaba", "bejaia", "setif", "ghardaia", "ouargla", "tamanrasset", "bechar", "adrar", "tlemcen", "biskra", "illizi", "tindouf", "eloued"];

function algeriaMap() {
  const dots = mapDots()
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`)
    .join("");
  const [hx, hy] = project(CITIES.algiers);
  const arcs = ROUTES.map((city, i) => {
    const d = arcPath("algiers", city);
    const [x, y] = project(CITIES[city]);
    const dur = (3.2 + (i % 5) * 0.55).toFixed(2);
    const begin = ((i * 0.37) % 3).toFixed(2);
    return `<path class="arc" d="${d}" pathLength="1" style="--d:${begin}s"/><circle class="parcel-dot" r="4"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .25 1"/></circle><circle class="city" cx="${x}" cy="${y}" r="5"/><circle class="city-ring" cx="${x}" cy="${y}" r="5" style="--d:${begin}s"/>`;
  }).join("");
  return `<svg class="dz-map" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" aria-hidden="true">
  <defs><radialGradient id="dz-glow" cx="${(hx / MAP_WIDTH).toFixed(2)}" cy="${(hy / MAP_HEIGHT).toFixed(2)}" r=".7"><stop offset="0" stop-color="#38bdf8" stop-opacity=".25"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient></defs>
  <path class="dz-shape" d="${outlinePath()}"/>
  <g class="dz-dots">${dots}</g>
  <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="url(#dz-glow)"/>
  <g class="dz-arcs">${arcs}</g>
  <g class="hub"><circle class="hub-ring" cx="${hx}" cy="${hy}" r="10"/><circle class="hub-core" cx="${hx}" cy="${hy}" r="7"/></g>
</svg>`;
}

function mapSection(t, s, locale) {
  return `<section class="section map-section" id="integrations">
  <div class="container map-grid">
    <div class="map-copy reveal">
      <p class="eyebrow">${esc(s.map.eyebrow)}</p>
      <h2 class="h-xl">${esc(s.map.title)}</h2>
      <p class="lead">${esc(s.map.text)}</p>
      <dl class="stats">${s.stats
        .map((st) => `<div><dt><span data-count="${st.value}">${st.value}</span></dt><dd>${esc(st.label)}</dd></div>`)
        .join("")}</dl>
      <p class="map-legend"><i></i>${esc(s.map.legend)}</p>
      ${moreLink(href(locale, "integrations"), PAGES[locale].more.integrations)}
    </div>
    <div class="map-art reveal">${algeriaMap()}</div>
  </div>
</section>`;
}

function marquee(t) {
  const row = INTEGRATIONS.map((name) => `<span class="mq-item">${esc(name)}</span>`).join("");
  return `<section class="marquee" aria-label="${esc(t.strip)}">
  <p class="marquee-label">${esc(t.strip)}</p>
  <div class="mq-track"><div class="mq-row">${row}${row}</div></div>
</section>`;
}

/* ─────────────────────────── statement, tour, vault, faq, final ─────────────────────────── */

function statement(t) {
  return `<section class="section statement">
  <div class="container narrow">
    <p class="eyebrow reveal">${esc(t.problem.eyebrow)}</p>
    <h2 class="h-lg">${esc(t.problem.title)}</h2>
  </div>
  <div class="container pains">${t.problem.items
    .map((item, i) => `<article class="pain reveal" style="--d:${i * 90}ms"><span class="pain-n">0${i + 1}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`)
    .join("")}</div>
</section>`;
}

function tour(t, s, shot) {
  const items = t.features.items;
  return `<section class="section tour" data-tour>
  <div class="container">
    <div class="section-head reveal">
      <p class="eyebrow">${esc(s.tour.eyebrow)}</p>
      <h2 class="h-xl">${esc(s.tour.title)}</h2>
    </div>
    <div class="tour-tabs" role="tablist">${items
      .map((item, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-tab="${i}"><span class="tab-ic">${ICONS[item.key]}</span><span>${esc(item.title)}</span><i class="tab-progress"></i></button>`)
      .join("")}</div>
    <div class="tour-stage" data-tilt-soft>
      <div class="laptop">
        <div class="laptop-screen">${items
          .map((item, i) => `<img src="${shot(item.key)}" alt="${esc(item.title)}" loading="lazy" decoding="async" width="1440" height="900" data-shot="${i}"${i === 0 ? ' class="is-on"' : ""}>`)
          .join("")}</div>
        <div class="laptop-base" aria-hidden="true"></div>
      </div>
      <div class="tour-caption">${items
        .map((item, i) => `<div data-caption="${i}"${i === 0 ? ' class="is-on"' : ""}><ul>${item.points.map((p) => `<li>${ICONS.check}<span>${esc(p)}</span></li>`).join("")}</ul></div>`)
        .join("")}</div>
    </div>
  </div>
</section>`;
}

function vaultArt(s) {
  const at = (x, y, z) => {
    const [px, py] = iso(x, y, z);
    return [+(260 + px).toFixed(1), +(250 + py).toFixed(1)];
  };
  const box = (x0, y0, x1, y1, z0, z1, cls) =>
    `<g class="${cls}"><polygon class="f-left" points="${pts([at(x0, y1, z1), at(x1, y1, z1), at(x1, y1, z0), at(x0, y1, z0)])}"/><polygon class="f-right" points="${pts([at(x1, y0, z1), at(x1, y1, z1), at(x1, y1, z0), at(x1, y0, z0)])}"/><polygon class="f-top" points="${pts([at(x0, y0, z1), at(x1, y0, z1), at(x1, y1, z1), at(x0, y1, z1)])}"/></g>`;
  return `<svg class="vault-art" viewBox="0 0 520 480" aria-hidden="true">
  <defs><radialGradient id="v-halo"><stop offset="0" stop-color="#38bdf8" stop-opacity=".35"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="260" cy="300" rx="230" ry="120" fill="url(#v-halo)"/>
  <g class="orbit o1"><ellipse cx="260" cy="250" rx="210" ry="74"/><circle class="sat" r="5"><animateMotion dur="9s" repeatCount="indefinite" path="M50,250 a210,74 0 1,0 420,0 a210,74 0 1,0 -420,0"/></circle></g>
  <g class="orbit o2"><ellipse cx="260" cy="250" rx="160" ry="56"/><circle class="sat gold" r="4"><animateMotion dur="6.5s" repeatCount="indefinite" path="M420,250 a160,56 0 1,0 -320,0 a160,56 0 1,0 320,0"/></circle></g>
  ${box(-110, -110, 110, 110, 0, 26, "v-base")}
  ${box(-70, -70, 70, 70, 26, 150, "v-safe")}
  <g class="v-lock" transform="translate(${at(70, 0, 88).join(" ")})"><path d="M-14 -4 v-10 a14 14 0 0 1 28 0 v10" fill="none"/><rect x="-20" y="-4" width="40" height="32" rx="7"/><circle cx="0" cy="11" r="4"/></g>
  <g class="v-chip c1" transform="translate(60 92)"><rect width="150" height="40" rx="20"/><text x="75" y="25" text-anchor="middle">${esc(s.vault.encrypted)}</text></g>
  <g class="v-chip c2" transform="translate(320 360)"><rect width="150" height="40" rx="20"/><text x="75" y="25" text-anchor="middle">${esc(s.vault.offline)}</text></g>
</svg>`;
}

function vault(t, s, locale) {
  const icons = [ICONS.lock, ICONS.wifiOff, ICONS.backup, ICONS.team];
  return `<section class="section vault" id="security">
  <div class="container vault-grid">
    <div class="vault-visual reveal">${vaultArt(s)}</div>
    <div class="vault-copy">
      <p class="eyebrow reveal">${esc(t.security.eyebrow)}</p>
      <h2 class="h-xl reveal">${esc(t.security.title)}</h2>
      <p class="lead reveal">${esc(t.security.lead)}</p>
      <ul class="vault-list">${t.security.items
        .map((item, i) => `<li class="reveal" style="--d:${i * 70}ms"><span class="vl-ic">${icons[i]}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div></li>`)
        .join("")}</ul>
      ${moreLink(href(locale, "security"), PAGES[locale].more.security, "reveal")}
    </div>
  </div>
</section>`;
}

function pricingTeaser(t, locale) {
  const p = PAGES[locale];
  const pricing = licencePricing(locale);
  return `<section class="section teaser">
  <div class="container">
    <div class="teaser-card reveal">
      <div class="teaser-copy">
        <p class="eyebrow">${esc(p.nav.pricing)}</p>
        <h2 class="h-lg">${esc(p.pricingTeaser.title)}</h2>
        <p class="lead">${esc(p.pricingTeaser.text)}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="${href(locale, "download")}">${ICONS.download}<span>${esc(p.pricing.trial.cta)}</span></a>
          ${moreLink(href(locale, "pricing"), p.more.pricing)}
        </div>
      </div>
      <div class="teaser-plans" aria-hidden="true">
        <div class="mini-plan"><small>${esc(p.pricing.trial.name)}</small><strong>${esc(p.pricing.trial.price)}</strong><span>${esc(p.pricing.trial.per)}</span></div>
        <div class="mini-plan is-featured${pricing.ask ? " is-ask" : ""}">${pricing.offer ? `<span class="offer-tag">${esc(pricing.offer.save)}</span>` : ""}<small>${esc(p.pricing.licence.name)}</small><strong dir="auto">${esc(pricing.price)}</strong>${pricing.offer ? `<del dir="auto">${esc(pricing.offer.regular)}</del>` : ""}<span>${esc(pricing.offer ? pricing.offer.label : p.pricing.licence.per)}</span></div>
      </div>
    </div>
  </div>
</section>`;
}

function readySteps(t) {
  return `<section class="section ready">
  <div class="container">
    <div class="section-head center reveal"><p class="eyebrow">${esc(t.how.eyebrow)}</p><h2 class="h-xl">${esc(t.how.title)}</h2></div>
    <ol class="ready-row">${t.how.steps
      .map((st, i) => `<li class="reveal" style="--d:${i * 90}ms"><span class="big-n">${i + 1}</span><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></li>`)
      .join("")}</ol>
  </div>
</section>`;
}

function faq(t) {
  return `<section class="section faq" id="faq">
  <div class="container faq-grid">
    <div class="section-head reveal"><p class="eyebrow">${esc(t.faq.eyebrow)}</p><h2 class="h-xl">${esc(t.faq.title)}</h2></div>
    <div class="faq-list">${t.faq.items
      .map((item) => `<details class="reveal"><summary><span>${esc(item.q)}</span><i aria-hidden="true">${ICONS.plus}</i></summary><div class="faq-a"><p>${esc(call(item.a))}</p></div></details>`)
      .join("")}</div>
  </div>
</section>`;
}

function finalCta(t, s, locale) {
  const wa = whatsappHref(t.whatsappMessage);
  return `<section class="final">
  <div class="final-sky" aria-hidden="true">${stars(60, 29)}<div class="sun big"></div></div>
  <div class="container narrow center final-copy">
    <img class="final-mark" src="/img/mark.svg" alt="" width="64" height="64">
    <h2 class="display-2 reveal">${esc(s.final.title)}</h2>
    <p class="lead reveal">${esc(call(t.trial.text))}</p>
    <div class="cta-row center reveal">
      <a class="btn btn-primary btn-lg btn-glow" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.trial.primary)}</span></a>
      <a class="btn btn-glass btn-lg" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(t.trial.secondary)}</span></a>
    </div>
  </div>
  ${dunes("fd", "night")}
</section>`;
}

/* ─────────────────────────── pages ─────────────────────────── */

const EXTRA = {
  ar: { storeCta: "اطلب الآن · الدفع عند الاستلام", agentQ: "ما المنتجات التي توشك على النفاد؟", agentA: "3 منتجات: جلابة بيضاء (4)، عباية سوداء (2)، حقيبة جلدية (1)." },
  fr: { storeCta: "Commander · paiement à la livraison", agentQ: "Quels produits sont presque en rupture ?", agentA: "3 produits : djellaba blanche (4), abaya noire (2), sac en cuir (1)." },
  en: { storeCta: "Order now · cash on delivery", agentQ: "Which products are about to run out?", agentA: "3 products: white djellaba (4), black abaya (2), leather bag (1)." },
};

function salesHome(t, s, locale, shot) {
  const wa = whatsappHref(t.whatsappMessage);
  const stops = [
    ["inbox", 1],
    ["orders", 2],
    ["delivery", 3],
    ["accounting", 4],
  ];
  return `
<section class="home-hero">
  <div class="container home-hero-grid">
    <div class="home-hero-copy">
      <p class="eyebrow"><span class="dot"></span>${esc(t.hero.eyebrow)}</p>
      <h1>${esc(t.hero.title[0])}<span>${esc(t.hero.title[1])}</span></h1>
      <p class="lead">${esc(t.hero.lead)}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.hero.primary)}</span></a>
        <a class="btn btn-glass btn-lg" href="${wa}" rel="noopener">${ICONS.whatsapp}<span>${esc(t.hero.secondary)}</span></a>
      </div>
      <p class="hero-note">${esc(call(t.hero.note))}</p>
      <ul class="trust-row">${t.hero.trust.map((item) => `<li>${ICONS.check}<span>${esc(item)}</span></li>`).join("")}</ul>
    </div>
    <figure class="shot-frame">
      <img src="${shot("inbox")}" alt="${esc(t.features.items.find((item) => item.key === "inbox").title)}" width="1440" height="900">
    </figure>
  </div>
</section>
${statement(t)}
<section class="section path" id="how">
  <div class="container">
    <div class="section-head reveal">
      <p class="eyebrow">${esc(s.loop.eyebrow)}</p>
      <h2 class="h-xl">${esc(s.loop.title)}</h2>
    </div>
    ${stops
      .map(([key, index], i) => {
        const step = s.loop.steps[index];
        const flip = i % 2 === 1 ? " flip" : "";
        return `<article class="path-row${flip}">
          <div class="path-copy">
            <span class="big-n">${i + 1}</span>
            <h3 class="h-md">${esc(step.title)}</h3>
            <p>${esc(step.text)}</p>
          </div>
          <figure class="shot-frame">
            <img src="${shot(key)}" alt="${esc(step.title)}" width="1440" height="900" loading="lazy">
          </figure>
        </article>`;
      })
      .join("")}
  </div>
</section>
${pricingTeaser(t, locale)}
${faq(t)}
${finalCta(t, s, locale)}`;
}

export function homePage(locale, shot) {
  const t = CONTENT[locale];
  const s = { ...STORY[locale], ...EXTRA[locale] };
  return shell(
    { t, locale, page: "", title: t.meta.title, description: t.meta.description, preload: shot("inbox") },
    salesHome(t, s, locale, shot),
  );
}

export function downloadPage(locale) {
  const t = CONTENT[locale];
  const d = t.download;
  const body = `
<section class="page-hero">
  <div class="hero-sky" aria-hidden="true">${stars(60, 5)}<div class="sun"></div></div>
  <div class="container narrow center page-hero-copy">
    <span class="windows-badge">${ICONS.windows}</span>
    <h1 class="display-2">${esc(d.title)}</h1>
    <p class="lead">${esc(d.lead)}</p>
    <div class="cta-row center">
      <a class="btn btn-primary btn-lg btn-glow" href="${SITE.downloadUrl}" rel="noopener">${ICONS.download}<span>${esc(d.button)}</span></a>
    </div>
    <p class="hero-note">${esc(call(t.hero.note))}</p>
  </div>
  ${dunes("dd")}
</section>
<section class="section">
  <div class="container download-grid">
    <article class="panel reveal"><h2 class="h-md">${esc(d.stepsTitle)}</h2><ol class="numbered">${d.steps.map((st) => `<li>${esc(st)}</li>`).join("")}</ol></article>
    <article class="panel reveal"><h2 class="h-md">${esc(d.requirementsTitle)}</h2><ul class="checks">${d.requirements.map((r) => `<li>${ICONS.check}<span>${esc(r)}</span></li>`).join("")}</ul></article>
  </div>
  <div class="container center help-row reveal"><span>${esc(d.help)}</span> <a class="btn btn-glass" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${ICONS.whatsapp}<span>WhatsApp</span></a></div>
</section>`;
  return shell({ t, locale, page: "download", title: `${d.title} — SahelFlow`, description: d.lead }, body);
}

export function legalPage(locale, kind) {
  const t = CONTENT[locale];
  const title = kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle;
  const sections = (kind === "privacy" ? PRIVACY : TERMS)[locale];
  const body = `
<section class="page-hero compact"><div class="container narrow page-hero-copy"><h1 class="display-2">${esc(title)}</h1><p class="hero-note">${esc(t.legal.updated)}: ${LEGAL_UPDATED}</p></div></section>
<section class="section legal"><div class="container narrow">${sections
    .map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`)
    .join("")}</div></section>`;
  return shell({ t, locale, page: kind, title: `${title} — SahelFlow`, description: title }, body);
}

export function notFoundPage() {
  const t = CONTENT[SITE.defaultLocale];
  const body = `<section class="page-hero"><div class="hero-sky" aria-hidden="true">${stars(60, 3)}</div><div class="container narrow center page-hero-copy"><p class="eyebrow">404</p><h1 class="display-2">${esc(t.notFound.title)}</h1><p class="lead">${esc(t.notFound.text)}</p><div class="cta-row center"><a class="btn btn-primary" href="/">${esc(t.notFound.back)}</a></div></div>${dunes("nf")}</section>`;
  return shell({ t, locale: SITE.defaultLocale, page: "404", title: `404 — SahelFlow`, description: t.notFound.text }, body);
}

export function rootRedirect() {
  // Arabic by default; a visitor who chose another language keeps it.
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>SahelFlow</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="${SITE.origin}/${SITE.defaultLocale}/">
<script>(function(){var l="${SITE.defaultLocale}";try{var s=localStorage.getItem("sf-lang");if(s==="ar"||s==="fr"||s==="en")l=s}catch(e){}location.replace("/"+l+"/"+location.hash)})()</script>
<meta http-equiv="refresh" content="0; url=/${SITE.defaultLocale}/">
</head><body style="background:#04070d"></body></html>`;
}

/* ─────────────────────────── inner pages ─────────────────────────── */

function innerHero({ t, locale, eyebrow, title, lead, art = "", id }) {
  const p = PAGES[locale];
  return `<section class="page-hero inner-hero${art ? " has-art" : ""}">
  <div class="hero-sky" aria-hidden="true">${stars(70, id.length * 7)}<div class="sun"></div></div>
  <div class="container inner-hero-grid">
    <div class="page-hero-copy">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1 class="display-2">${esc(title)}</h1>
      <p class="lead">${esc(lead)}</p>
      <div class="cta-row">
        <a class="btn btn-primary btn-lg btn-glow" href="${href(locale, "download")}">${ICONS.download}<span>${esc(t.hero.primary)}</span></a>
        <a class="btn btn-glass btn-lg" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${ICONS.whatsapp}<span>${esc(p.nav.talk)}</span></a>
      </div>
    </div>
    ${art ? `<div class="inner-hero-art">${art}</div>` : ""}
  </div>
  ${dunes(`ih-${id}`)}
</section>`;
}

export function productPage(locale, shot) {
  const t = CONTENT[locale];
  const p = PAGES[locale];
  const s = { ...STORY[locale], ...EXTRA[locale] };
  const subnav = `<nav class="subnav" aria-label="${esc(p.product.subnav)}" data-subnav><div class="container subnav-row">${MODULES.map(
    (key) => `<a href="#${key}" data-spy="${key}"><span class="sn-ic">${ICONS[key]}</span><span>${esc(featureByKey(t, key).title)}</span></a>`,
  ).join("")}</div></nav>`;
  const rows = MODULES.map((key, i) => {
    const item = featureByKey(t, key);
    return `<section class="feature-row${i % 2 ? " flip" : ""}" id="${key}">
    <div class="feature-copy reveal">
      <p class="feature-index"><span class="fi-ic">${ICONS[key]}</span><span dir="ltr">0${i + 1}</span></p>
      <h2 class="h-lg">${esc(item.title)}</h2>
      <p class="lead">${esc(item.text)}</p>
      <ul class="checks">${item.points.map((point) => `<li>${ICONS.check}<span>${esc(point)}</span></li>`).join("")}</ul>
    </div>
    <figure class="feature-media reveal">
      <div class="screen-frame"><div class="screen-bar" aria-hidden="true"><i></i><i></i><i></i></div><img src="${shot(key)}" alt="${esc(item.title)}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async" width="1440" height="900"></div>
      <div class="feature-glow" aria-hidden="true"></div>
    </figure>
  </section>`;
  }).join("");
  const extras = `<section class="section extras">
  <div class="container">
    <div class="section-head reveal"><h2 class="h-xl">${esc(p.product.extrasTitle)}</h2></div>
    <div class="extras-grid">${p.product.extras
      .map(([title, text], i) => `<article class="extra reveal" style="--d:${(i % 3) * 70}ms"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`)
      .join("")}</div>
  </div>
</section>`;
  const body = `${innerHero({ t, locale, eyebrow: p.nav.product, title: p.product.title, lead: p.product.lead, id: "product" })}
${subnav}
<div class="container feature-rows">${rows}</div>
${extras}
${finalCta(t, s, locale)}`;
  return shell({ t, locale, page: "product", title: `${p.nav.product} — SahelFlow`, description: p.product.lead }, body);
}

/** Brand accents for the integration marks (wordmark initials, or an icon). */
const BRANDS = {
  whatsapp: { color: "#25d366", icon: "whatsapp" },
  yalidine: { color: "#ef4444", mark: "Y" },
  "zr-express": { color: "#f59e0b", mark: "ZR" },
  ecotrack: { color: "#22c55e", mark: "E" },
  "maystro-delivery": { color: "#8b5cf6", mark: "M" },
  "google-sheets": { color: "#34a853", icon: "sheet" },
  shopify: { color: "#95bf47", mark: "S" },
  youcan: { color: "#6366f1", mark: "YC" },
  woocommerce: { color: "#a78bfa", mark: "W" },
  "sahelflow-storefront": { color: "#38bdf8", icon: "storefront" },
  "boutique-sahelflow": { color: "#38bdf8", icon: "storefront" },
  "meta-pixel-conversions-api": { color: "#3b82f6", mark: "∞" },
  "meta-pixel-et-api-conversions": { color: "#3b82f6", mark: "∞" },
  sahelflow: { color: "#38bdf8", icon: "storefront" },
  "google-gemini": { color: "#60a5fa", icon: "sparkle" },
  "excel-csv": { color: "#22c55e", icon: "sheet" },
};
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function integrationsPage(locale) {
  const t = CONTENT[locale];
  const p = PAGES[locale];
  const s = { ...STORY[locale], ...EXTRA[locale] };
  const groups = p.integrations.groups
    .map(
      (group) => `<section class="int-group reveal">
    <h2 class="int-title">${esc(group.title)}</h2>
    <div class="int-grid">${group.items
      .map(([name, text, flag]) => {
        const brand = BRANDS[slug(name)] ?? {};
        const initials = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "SF";
        const mark = brand.icon ? ICONS[brand.icon] : esc(brand.mark ?? initials);
        return `<article class="int-card${flag ? " is-new" : ""}" id="${slug(name)}">
        <header><span class="int-logo" dir="ltr" style="--brand:${brand.color ?? "#38bdf8"}">${mark}</span><h3 dir="ltr">${esc(name)}</h3>${flag ? `<span class="badge-new">${esc(p.nav.newBadge)}</span>` : ""}</header>
        <p>${esc(text)}</p>
      </article>`;
      })
      .join("")}</div>
  </section>`,
    )
    .join("");
  const body = `${innerHero({ t, locale, eyebrow: p.nav.integrations, title: p.integrations.title, lead: p.integrations.lead, id: "integrations" })}
<section class="section int-section"><div class="container">${groups}
  <div class="help-row reveal"><span>${esc(p.integrations.missing)}</span> <a class="btn btn-glass" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${ICONS.whatsapp}<span>WhatsApp</span></a></div>
</div></section>
${finalCta(t, s, locale)}`;
  return shell({ t, locale, page: "integrations", title: `${p.nav.integrations} — SahelFlow`, description: p.integrations.lead }, body);
}

export function pricingPage(locale) {
  const t = CONTENT[locale];
  const p = PAGES[locale];
  const s = { ...STORY[locale], ...EXTRA[locale] };
  const wa = whatsappHref(t.whatsappMessage);
  const pricing = licencePricing(locale);
  const plan = (key, data, priceText, cta, url, featured = false) => `<article class="plan${featured ? " is-featured" : ""} reveal" data-plan="${key}">
    ${featured ? `<span class="plan-badge">${esc(data.badge)}</span>` : ""}
    <h2 class="plan-name">${esc(data.name)}</h2>
    ${key === "licence" && pricing.offer ? `<p class="plan-offer"><span class="offer-tag">${esc(pricing.offer.save)}</span><span>${esc(pricing.offer.label)}</span></p>` : ""}
    <p class="plan-price${key === "licence" && pricing.ask ? " is-ask" : ""}"><strong dir="auto">${esc(priceText)}${key === "licence" && pricing.offer ? ` <del dir="auto">${esc(pricing.offer.regular)}</del>` : ""}</strong><span>${esc(key === "licence" && pricing.offer ? `${data.per} · ${pricing.offer.then}` : data.per)}</span></p>
    <ul class="checks">${data.points.map((point) => `<li>${ICONS.check}<span>${esc(point)}</span></li>`).join("")}</ul>
    <a class="btn ${featured ? "btn-primary btn-glow" : "btn-glass"} plan-cta" href="${url}"${url.startsWith("http") ? ' rel="noopener"' : ""}>${url.startsWith("http") ? ICONS.whatsapp : ICONS.download}<span>${esc(cta)}</span></a>
  </article>`;
  const body = `${innerHero({ t, locale, eyebrow: p.nav.pricing, title: p.pricing.title, lead: p.pricing.lead, id: "pricing" })}
<section class="section plans-section">
  <div class="container">
    <div class="plans">
      ${plan("trial", p.pricing.trial, p.pricing.trial.price, p.pricing.trial.cta, href(locale, "download"))}
      ${plan("licence", p.pricing.licence, pricing.price, p.pricing.licence.cta, wa, true)}
      ${plan("custom", p.pricing.custom, p.pricing.custom.price, p.pricing.custom.cta, wa)}
    </div>
  </div>
</section>
<section class="section ready">
  <div class="container">
    <div class="section-head center reveal"><h2 class="h-xl">${esc(p.pricing.howTitle)}</h2></div>
    <ol class="ready-row">${p.pricing.how
      .map(([title, text], i) => `<li class="reveal" style="--d:${i * 90}ms"><span class="big-n">${i + 1}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`)
      .join("")}</ol>
  </div>
</section>
<section class="section faq">
  <div class="container faq-grid">
    <div class="section-head reveal"><p class="eyebrow">${esc(t.faq.eyebrow)}</p><h2 class="h-xl">${esc(p.nav.pricing)}</h2></div>
    <div class="faq-list">${p.pricing.faq
      .map(([q, a]) => `<details class="reveal"><summary><span>${esc(q)}</span><i aria-hidden="true">${ICONS.plus}</i></summary><div class="faq-a"><p>${esc(a)}</p></div></details>`)
      .join("")}</div>
  </div>
</section>
${finalCta(t, s, locale)}`;
  return shell({ t, locale, page: "pricing", title: `${p.nav.pricing} — SahelFlow`, description: p.pricing.lead }, body);
}

export function securityPage(locale) {
  const t = CONTENT[locale];
  const p = PAGES[locale];
  const s = { ...STORY[locale], ...EXTRA[locale] };
  const icons = [ICONS.lock, ICONS.key, ICONS.team, ICONS.backup, ICONS.sparkle, ICONS.shield];
  const body = `${innerHero({ t, locale, eyebrow: p.nav.security, title: p.security.title, lead: p.security.lead, art: vaultArt(s), id: "security" })}
<section class="section sec-section">
  <div class="container">
    <div class="sec-grid">${p.security.items
      .map(([title, text], i) => `<article class="sec-card reveal" style="--d:${(i % 3) * 70}ms"><span class="vl-ic">${icons[i]}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></article>`)
      .join("")}</div>
    <div class="flows reveal">
      <h2 class="h-md">${esc(p.security.flowsTitle)}</h2>
      <ul>${p.security.flows
        .map(([name, what]) => `<li><strong dir="auto">${esc(name)}</strong><span>${esc(what)}</span></li>`)
        .join("")}</ul>
    </div>
  </div>
</section>
${finalCta(t, s, locale)}`;
  return shell({ t, locale, page: "security", title: `${p.nav.security} — SahelFlow`, description: p.security.lead }, body);
}
