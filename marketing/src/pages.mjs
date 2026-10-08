// Every page of sahelflow.com, rendered from the copy files and the model.
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { shell } from "./layout.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { BRAND_NAMES, HELP_TOPICS, INTEGRATIONS, MODULES, PACKAGE, SOLUTIONS, monthlyOverUpdateYears } from "./model.mjs";
import {
  FLOW_SCENES,
  algeriaMap,
  assistantScene,
  bentoScene,
  compareSlider,
  coreDiagram,
  dunes,
  flowDiagram,
  heroStage,
  screenStack,
  specPanel,
  stars,
} from "./scenes.mjs";
import {
  appWindow,
  arrow,
  button,
  ctas,
  esc,
  faqJsonLd,
  faqList,
  href,
  icon,
  licencePricing,
  money,
  num,
  sectionHead,
  shotUrl,
  whatsappHref,
} from "./ui.mjs";

const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));
const meta = (locale, key) => COPY[locale].meta[key];

/* ───────────────────────────── shared blocks ───────────────────────────── */

function pageHero({ locale, eyebrow, eyebrowIcon, title, lead, actions = "", art = "", cls = "" }) {
  return `<section class="page-hero ${cls}">
  ${stars(50, title.length)}
  <div class="container page-hero-inner">
    <div class="page-hero-copy reveal">
      ${eyebrow ? `<p class="eyebrow">${eyebrowIcon ? icon(eyebrowIcon) : ""}${esc(eyebrow)}</p>` : ""}
      <h1 class="page-title">${esc(title)}</h1>
      ${lead ? `<p class="page-lead">${esc(lead)}</p>` : ""}
      ${actions}
    </div>
    ${art ? `<div class="page-hero-art reveal">${art}</div>` : ""}
  </div>
</section>`;
}

function finalCta(locale, { title, text } = {}) {
  const t = COPY[locale];
  return `<section class="final-cta" data-gl-host>
  ${stars(70, 3)}
  <canvas class="gl-canvas" data-gl data-gl-seed="2.4" data-gl-horizon="0.25" data-gl-offset="40" aria-hidden="true"></canvas>
  <div class="container final-inner reveal">
    <img class="final-mark" src="/img/mark.svg" alt="" width="64" height="64">
    <h2>${esc(title ?? t.home.final.title)}</h2>
    <p>${esc(text ?? t.home.final.text)}</p>
    ${ctas(locale)}
    <p class="hero-note">${esc(t.home.hero.note(SITE.trialDays))}</p>
  </div>
  ${dunes()}
</section>`;
}

const BRAND_HUES = {
  whatsapp: "#25d366", yalidine: "#ef4444", zr: "#f59e0b", ecotrack: "#10b981", maystro: "#3b82f6",
  sheets: "#16a34a", shopify: "#84cc16", youcan: "#f43f5e", woocommerce: "#a855f7", storefront: "#38bdf8",
  meta: "#3b82f6", gemini: "#8b5cf6", excel: "#15803d",
};
const monogram = (key) => BRAND_NAMES[key].replace(/[^A-Za-z]/g, "").slice(0, 2);
function brandTile(key) {
  return `<span class="brand-tile" style="--brand:${BRAND_HUES[key]}" aria-hidden="true">${esc(monogram(key))}</span>`;
}

function marquee(locale) {
  const t = COPY[locale];
  const names = Object.keys(BRAND_NAMES).map((key) => `<li>${brandTile(key)}<span>${esc(BRAND_NAMES[key])}</span></li>`).join("");
  return `<section class="marquee-band" aria-label="${esc(t.home.marquee)}">
  <p class="marquee-label">${esc(t.home.marquee)}</p>
  <div class="marquee"><ul class="marquee-track">${names}</ul><ul class="marquee-track" aria-hidden="true">${names}</ul></div>
</section>`;
}

function moduleCard(locale, key, { compact = false } = {}) {
  const m = moduleByKey[key];
  const c = COPY[locale].modules[key];
  return `<a class="module-card${compact ? " is-compact" : ""}" href="${href(locale, `product/${key}`)}" style="--hue:${m.hue}">
  <span class="module-icon">${icon(m.icon)}</span>
  <strong>${esc(c.name)}</strong>
  <span class="module-short">${esc(c.short)}</span>
  ${compact ? "" : `<ul class="module-points">${c.points.map((p) => `<li>${icon("check")}${esc(p)}</li>`).join("")}</ul>`}
  <span class="card-more">${esc(COPY[locale].common.seeModule)}${arrow()}</span>
</a>`;
}

function statusIcon(kind) {
  return `<span class="mark mark-${kind}">${icon(kind === "yes" ? "check" : kind === "no" ? "x" : "minus")}</span>`;
}

/* ───────────────────────────── home ───────────────────────────── */

function homeHero(locale) {
  const t = COPY[locale];
  const h = t.home.hero;
  return `<section class="hero" data-gl-host>
  ${stars(110, 11)}
  <canvas class="gl-canvas" data-gl data-gl-seed="0.35" aria-hidden="true"></canvas>
  <div class="hero-aurora" aria-hidden="true"></div>
  <div class="container hero-inner">
    <a class="announce reveal" href="${href(locale, "integrations")}#sheets"><span class="badge badge-new">${esc(t.common.new)}</span><span>${esc(t.home.announcement)}</span>${arrow()}</a>
    <p class="eyebrow reveal">${esc(h.eyebrow)}</p>
    <h1 class="hero-title reveal"><span>${esc(h.title[0])}</span> <span class="grad">${esc(h.title[1])}</span></h1>
    <p class="hero-lead reveal">${esc(h.lead)}</p>
    <div class="reveal">${ctas(locale)}</div>
    <p class="hero-note reveal">${esc(h.note(SITE.trialDays))}</p>
    <ul class="hero-trust reveal">${h.trust.map((x, i) => `<li>${icon(["wifiOff", "globe", "lock"][i])}<span>${esc(x)}</span></li>`).join("")}</ul>
  </div>
  <div class="container hero-stage-wrap reveal">${heroStage(locale)}</div>
</section>`;
}

function whyTeaser(locale) {
  const w = COPY[locale].home.why;
  return `<section class="section why-teaser">
  <div class="container">
    ${sectionHead({ eyebrow: w.eyebrow, title: w.title, center: true })}
    <ul class="why-points reveal-stagger">${w.points.map(([big, small]) => `<li class="reveal"><b>${esc(big)}</b><span>${esc(small)}</span></li>`).join("")}</ul>
    <p class="center-cta">${button(href(locale, "why"), w.cta, { kind: "ghost", iconName: "scale" })}</p>
  </div>
</section>`;
}

function compareSection(locale) {
  const c = COPY[locale].home.compare;
  return `<section class="section">
  <div class="container">
    ${sectionHead({ eyebrow: c.eyebrow, title: c.title, lead: c.lead, center: true })}
    <div class="reveal">${compareSlider(locale)}</div>
  </div>
</section>`;
}

function flowSection(locale) {
  const f = COPY[locale].home.flow;
  const steps = f.steps
    .map(
      ([title, text], i) => `<article class="flow-step" data-flow-step="${i}">
  <span class="flow-num">${String(i + 1).padStart(2, "0")}</span>
  <h3>${esc(title)}</h3>
  <p>${esc(text)}</p>
  <div class="flow-inline" aria-hidden="true">${FLOW_SCENES[i](locale)}</div>
</article>`,
    )
    .join("");
  return `<section class="section flow" data-flow>
  <div class="container">
    ${sectionHead({ eyebrow: f.eyebrow, title: f.title, center: true })}
    <div class="flow-grid">
      <div class="flow-steps">
        <div class="flow-rail" aria-hidden="true"><i data-flow-progress></i></div>
        ${steps}
      </div>
      <div class="flow-stage" aria-hidden="true">
        <div class="flow-stage-inner" data-flow-stage data-active="0">
          ${FLOW_SCENES.map((scene, i) => `<div class="flow-scene" data-scene="${i}">${scene(locale)}</div>`).join("")}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function tourSection(locale) {
  const t = COPY[locale];
  const tabs = MODULES.map(
    (m, i) => `<button class="tour-tab" type="button" role="tab" id="tour-tab-${m.key}" aria-controls="tour-${m.key}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" style="--hue:${m.hue}" data-tour-tab>
  ${icon(m.icon)}<span>${esc(t.modules[m.key].name)}</span><i class="tour-progress" aria-hidden="true"></i>
</button>`,
  ).join("");
  const panels = MODULES.map((m, i) => {
    const c = t.modules[m.key];
    const media = m.shot
      ? appWindow(m.shot, locale)
      : `<figure class="app-window scene-window"><div class="app-window-bar" aria-hidden="true"><i></i><i></i><i></i><span>SahelFlow</span></div>${assistantScene(locale)}<figcaption class="sr-only">${esc(t.common.illustration)}</figcaption></figure>`;
    return `<div class="tour-panel${i === 0 ? " is-active" : ""}" role="tabpanel" id="tour-${m.key}" aria-labelledby="tour-tab-${m.key}" data-tour-panel>
  <div class="tour-media">${media}</div>
  <div class="tour-caption">
    <h3>${esc(c.title)}</h3>
    <ul>${c.points.map((p) => `<li>${icon("check")}${esc(p)}</li>`).join("")}</ul>
    <a class="text-link" href="${href(locale, `product/${m.key}`)}">${esc(t.common.seeModule)}${arrow()}</a>
  </div>
</div>`;
  }).join("");
  return `<section class="section tour" data-tour>
  <div class="container">
    ${sectionHead({ eyebrow: t.home.tour.eyebrow, title: t.home.tour.title, lead: t.home.tour.lead, center: true })}
    <div class="tour-tabs" role="tablist" aria-label="${esc(t.common.allModules)}">${tabs}</div>
    <div class="tour-panels">${panels}</div>
  </div>
</section>`;
}

function bentoSection(locale) {
  const b = COPY[locale].home.bento;
  const icons = { offline: "wifiOff", search: "search", languages: "languages", shops: "storefront", report: "bell", import: "upload" };
  return `<section class="section">
  <div class="container">
    ${sectionHead({ eyebrow: b.eyebrow, title: b.title, center: true })}
    <div class="bento reveal-stagger">
      ${b.items
        .map(
          ([key, title, text], i) => `<article class="bento-card reveal${[0, 3, 4].includes(i) ? " is-wide" : ""}" data-spotlight>
  <div class="bento-visual" aria-hidden="true">${bentoScene(key, locale)}</div>
  <h3>${icon(icons[key])}<span>${esc(title)}</span></h3>
  <p>${esc(text)}</p>
</article>`,
        )
        .join("")}
    </div>
  </div>
</section>`;
}

function mapSection(locale) {
  const m = COPY[locale].home.map;
  return `<section class="section map-section">
  <div class="container map-grid">
    <div class="map-copy reveal">
      <p class="eyebrow">${esc(m.eyebrow)}</p>
      <h2 class="section-title">${esc(m.title)}</h2>
      <p class="section-lead">${esc(m.text)}</p>
      <dl class="stats">${m.stats.map(([value, label]) => `<div><dt data-count="${value}">${value}</dt><dd>${esc(label)}</dd></div>`).join("")}</dl>
    </div>
    <figure class="map-figure reveal" data-tilt="7">${algeriaMap()}<figcaption>${esc(m.legend)}</figcaption></figure>
  </div>
</section>`;
}

function calculatorSection(locale) {
  const c = COPY[locale].home.calculator;
  const d = { orders: 600, rate: 25, fee: 700 };
  const monthly = Math.round(d.orders * (d.rate / 100) * d.fee);
  const field = (name, label, value, min, max, step, suffix) => `<label class="calc-field">
  <span class="calc-label">${esc(label)}</span>
  <span class="calc-control"><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" data-calc-input><output data-calc-out="${name}">${num(value)}${suffix}</output></span>
</label>`;
  return `<section class="section calc-section">
  <div class="container calc-grid">
    <div class="reveal">
      <p class="eyebrow">${esc(c.eyebrow)}</p>
      <h2 class="section-title">${esc(c.title)}</h2>
      <p class="section-lead">${esc(c.lead)}</p>
      <p class="calc-note">${icon("lock")}<span>${esc(c.note)}</span></p>
      <a class="text-link" href="${href(locale, "product/risk")}">${esc(c.cta)}${arrow()}</a>
    </div>
    <form class="calc-card reveal" data-calc="returns" data-currency="${locale === "ar" ? "دج" : "DA"}" onsubmit="return false">
      ${field("orders", c.orders, d.orders, 50, 5000, 50, "")}
      ${field("rate", c.rate, d.rate, 5, 50, 1, " %")}
      ${field("fee", c.fee, d.fee, 200, 1500, 50, locale === "ar" ? " دج" : " DA")}
      <div class="calc-result">
        <div><span>${esc(c.monthly)}</span><b data-calc-result="monthly">${money(monthly, locale)}</b></div>
        <div><span>${esc(c.yearly)}</span><b data-calc-result="yearly">${money(monthly * 12, locale)}</b></div>
      </div>
    </form>
  </div>
</section>`;
}

function securityTeaser(locale) {
  const s = COPY[locale].home.security;
  return `<section class="section vault-section">
  <div class="container vault-grid">
    <div class="vault-art reveal" aria-hidden="true">
      <div class="vault-ring r1"></div><div class="vault-ring r2"></div><div class="vault-ring r3"></div>
      <div class="vault-core">${icon("lock")}</div>
      <span class="vault-chip c1">AES-256-GCM</span><span class="vault-chip c2">${icon("wifiOff")}</span><span class="vault-chip c3">${icon("key")}</span>
    </div>
    <div class="reveal">
      <p class="eyebrow">${esc(s.eyebrow)}</p>
      <h2 class="section-title">${esc(s.title)}</h2>
      <p class="section-lead">${esc(s.lead)}</p>
      <dl class="vault-list">${s.items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <a class="text-link" href="${href(locale, "security")}">${esc(s.cta)}${arrow()}</a>
    </div>
  </div>
</section>`;
}

function pricingTeaser(locale) {
  const t = COPY[locale];
  const p = t.home.pricing;
  const lp = licencePricing(locale);
  return `<section class="section">
  <div class="container">
    <div class="price-teaser reveal" data-spotlight>
      <div>
        <p class="eyebrow">${esc(p.eyebrow)}</p>
        <h2 class="section-title">${esc(p.title)}</h2>
        <p class="section-lead">${esc(p.text)}</p>
      </div>
      <div class="price-teaser-figure">
        ${lp.offer ? `<span class="badge badge-offer">${esc(lp.offer.label)}</span>` : ""}
        <p class="price-big">${lp.offer ? `<s>${esc(lp.offer.regular)}</s>` : ""}<b>${esc(lp.price)}</b></p>
        ${lp.amount ? `<p class="price-sub">${esc(p.perMonth(money(monthlyOverUpdateYears(lp.amount), locale)))}</p>` : ""}
        ${button(href(locale, "pricing"), p.cta, { kind: "primary", iconName: "arrow" })}
      </div>
    </div>
  </div>
</section>`;
}

function homeFaq(locale) {
  const t = COPY[locale];
  const items = [
    t.helpPage.topics.start[2][2],
    t.helpPage.topics.start[2][1],
    t.helpPage.topics.licence[2][0],
    t.helpPage.topics.whatsapp[2][1],
    t.helpPage.topics.team[2][0],
    t.helpPage.topics.licence[2][2],
  ];
  return `<section class="section" id="faq">
  <div class="container narrow">
    ${sectionHead({ eyebrow: t.common.questions, title: t.home.faqTitle, center: true })}
    ${faqList(items, { name: "home-faq" })}
    <p class="center-cta">${button(href(locale, "help"), t.nav.resourceLinks.help[0], { kind: "ghost", iconName: "help" })}</p>
  </div>
</section>`;
}

export function homePage(locale) {
  const [title, description] = meta(locale, "home");
  const body = [
    homeHero(locale),
    marquee(locale),
    whyTeaser(locale),
    flowSection(locale),
    tourSection(locale),
    compareSection(locale),
    bentoSection(locale),
    mapSection(locale),
    calculatorSection(locale),
    securityTeaser(locale),
    pricingTeaser(locale),
    homeFaq(locale),
    finalCta(locale),
  ].join("\n");
  return shell({ locale, pageId: "home", path: "", title, description, preload: shotUrl("inbox", locale) }, body);
}

/* ───────────────────────────── product ───────────────────────────── */

export function productPage(locale) {
  const t = COPY[locale];
  const p = t.productPage;
  const [title, description] = meta(locale, "product");
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "layers", title: p.title, lead: p.lead, actions: ctas(locale), cls: "is-center" })}
<section class="section tight">
  <div class="container">${screenStack(locale)}</div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: p.coreTitle, lead: p.coreText, center: true })}
    <div class="reveal">${coreDiagram(locale)}</div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ eyebrow: p.modulesTitle, title: t.home.tour.lead, center: true })}
    <div class="module-grid reveal-stagger">${MODULES.map((m) => moduleCard(locale, m.key)).join("")}</div>
  </div>
</section>
${tourSection(locale)}
<section class="section">
  <div class="container">
    ${sectionHead({ title: p.principlesTitle, center: true })}
    <div class="principles reveal-stagger">${p.principles.map(([k, v], i) => `<article class="principle reveal"><span class="principle-num">0${i + 1}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></article>`).join("")}</div>
  </div>
</section>
${bentoSection(locale)}
${finalCta(locale)}`;
  return shell({ locale, pageId: "product", path: "product", title, description, preload: shotUrl("dashboard", locale) }, body);
}

export function modulePage(locale, key) {
  const t = COPY[locale];
  const m = moduleByKey[key];
  const c = t.modules[key];
  const index = MODULES.findIndex((x) => x.key === key);
  const related = [1, 2, 3].map((d) => MODULES[(index + d) % MODULES.length].key);
  const heroArt = m.shot
    ? appWindow(m.shot, locale, { eager: true, cls: "is-hero" })
    : `<figure class="app-window scene-window is-hero"><div class="app-window-bar" aria-hidden="true"><i></i><i></i><i></i><span>SahelFlow</span></div>${assistantScene(locale)}<figcaption class="scene-label">${esc(t.common.illustration)}</figcaption></figure>`;
  const visuals = [...m.gallery];
  const sections = c.sections
    .map(([title, text, bullets], i) => {
      const shot = visuals[i];
      const visual = shot ? appWindow(shot, locale) : specPanel(title, bullets, m.hue);
      return `<section class="feature-row${i % 2 ? " is-flipped" : ""}">
  <div class="feature-copy reveal">
    <span class="feature-num" style="--hue:${m.hue}">0${i + 1}</span>
    <h2>${esc(title)}</h2>
    <p>${esc(text)}</p>
    <ul class="check-list">${bullets.map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`).join("")}</ul>
  </div>
  <div class="feature-visual reveal">${visual}</div>
</section>`;
    })
    .join("");
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SahelFlow", item: `${SITE.origin}${href(locale)}` },
      { "@type": "ListItem", position: 2, name: t.nav.product, item: `${SITE.origin}${href(locale, "product")}` },
      { "@type": "ListItem", position: 3, name: c.name, item: `${SITE.origin}${href(locale, `product/${key}`)}` },
    ],
  };
  const body = `<section class="page-hero module-hero" style="--hue:${m.hue}">
  ${stars(50, index + 5)}
  <div class="container">
    <nav class="crumbs" aria-label="breadcrumb"><a href="${href(locale, "product")}">${esc(t.nav.product)}</a>${icon("chevron", "crumb-sep")}<span aria-current="page">${esc(c.name)}</span></nav>
    <div class="module-hero-copy reveal">
      <p class="eyebrow module-eyebrow"><span class="module-icon">${icon(m.icon)}</span>${esc(c.name)}</p>
      <h1 class="page-title">${esc(c.title)}</h1>
      <p class="page-lead">${esc(c.lead)}</p>
      ${ctas(locale)}
      <ul class="chip-row">${c.points.map((p) => `<li>${icon("check")}${esc(p)}</li>`).join("")}</ul>
    </div>
    <div class="module-hero-art reveal">${heroArt}</div>
  </div>
</section>
<div class="container features">${sections}</div>
<section class="section">
  <div class="container narrow">
    ${sectionHead({ eyebrow: t.common.questions, title: c.name, center: true })}
    ${faqList(c.faq, { name: `faq-${key}` })}
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: t.common.related, center: true })}
    <div class="module-grid is-three reveal-stagger">${related.map((k) => moduleCard(locale, k, { compact: true })).join("")}</div>
  </div>
</section>
${finalCta(locale)}`;
  return shell(
    { locale, pageId: `module:${key}`, path: `product/${key}`, title: `${c.name} — SahelFlow`, description: c.lead, preload: m.shot ? shotUrl(m.shot, locale) : null, jsonLd: [crumbs, faqJsonLd(c.faq)] },
    body,
  );
}

/* ───────────────────────────── solutions ───────────────────────────── */

export function solutionPage(locale, key) {
  const t = COPY[locale];
  const s = t.solutions[key];
  const sol = SOLUTIONS.find((x) => x.key === key);
  const lead = moduleByKey[s.modules[0]];
  const body = `${pageHero({
    locale,
    eyebrow: s.name,
    eyebrowIcon: sol.icon,
    title: s.title,
    lead: s.lead,
    actions: ctas(locale),
    art: lead.shot ? appWindow(lead.shot, locale, { eager: true }) : "",
  })}
<section class="section">
  <div class="container">
    <div class="pain-grid reveal-stagger">${s.pains.map(([k, v]) => `<article class="pain reveal"><span class="pain-x">${icon("x")}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></article>`).join("")}</div>
  </div>
</section>
<section class="section">
  <div class="container">
    <ol class="steps reveal-stagger">${s.steps.map(([k, v], i) => `<li class="step reveal"><span class="step-num">${i + 1}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></li>`).join("")}</ol>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: t.common.allModules, center: true })}
    <div class="module-grid is-four reveal-stagger">${s.modules.map((k) => moduleCard(locale, k, { compact: true })).join("")}</div>
  </div>
</section>
${whyTeaser(locale)}
${finalCta(locale)}`;
  return shell({ locale, pageId: `solution:${key}`, path: `solutions/${key}`, title: `${s.name} — SahelFlow`, description: s.lead }, body);
}

/* ───────────────────────────── integrations ───────────────────────────── */

export function integrationsPage(locale) {
  const t = COPY[locale];
  const p = t.integrationsPage;
  const [title, description] = meta(locale, "integrations");
  const chips = [`<button type="button" class="chip-btn" aria-pressed="true" data-filter="all">${esc(p.all)}</button>`, ...INTEGRATIONS.map((g) => `<button type="button" class="chip-btn" aria-pressed="false" data-filter="${g.group}">${esc(p.groups[g.group])}</button>`)].join("");
  const groups = INTEGRATIONS.map(
    (g) => `<section class="int-group" data-group="${g.group}">
  <h2 class="int-group-title">${esc(p.groups[g.group])}</h2>
  <div class="int-grid">${g.items
    .map(
      (key) => `<article class="int-card reveal" id="${key}" data-spotlight>
  <header>${brandTile(key)}<h3>${esc(BRAND_NAMES[key])}</h3>${key === "sheets" ? `<span class="badge badge-new">${esc(t.common.new)}</span>` : ""}</header>
  <p>${esc(p.items[key])}</p>
</article>`,
    )
    .join("")}</div>
</section>`,
  ).join("");
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "sheet", title: p.title, lead: p.lead, cls: "is-center" })}
${marquee(locale)}
<section class="section">
  <div class="container">
    <div class="chip-bar" role="toolbar" data-filter-bar>${chips}</div>
    ${groups}
    <p class="missing">${icon("whatsapp")}<a href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(p.missing)}</a></p>
  </div>
</section>
${finalCta(locale)}`;
  return shell({ locale, pageId: "integrations", path: "integrations", title, description }, body);
}

/* ───────────────────────────── pricing ───────────────────────────── */

export function pricingPage(locale) {
  const t = COPY[locale];
  const p = t.pricingPage;
  const lp = licencePricing(locale);
  const [title, description] = meta(locale, "pricing");
  const card = ({ name, price, per, points, cta, url, external, featured, badge, offer, sub }) => `<article class="plan${featured ? " is-featured" : ""} reveal" data-spotlight>
  ${badge ? `<span class="plan-badge">${esc(badge)}</span>` : ""}
  <h2 class="plan-name">${esc(name)}</h2>
  ${offer ? `<p class="plan-offer"><span class="badge badge-offer">${esc(offer.label)}</span><span class="badge badge-save">${esc(offer.save)}</span></p>` : ""}
  <p class="plan-price">${offer ? `<s>${esc(offer.regular)}</s>` : ""}<b>${esc(price)}</b><span>${esc(per)}</span></p>
  ${sub ? `<p class="plan-sub">${esc(sub)}</p>` : ""}
  <ul class="check-list">${points.map((x) => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>
  ${button(url, cta, { kind: featured ? "primary" : "ghost", external, size: "lg", iconName: featured ? "key" : external ? "whatsapp" : "download" })}
</article>`;
  const base = lp.amount ?? PACKAGE.priceDzd;
  const calc = base
    ? `<section class="section">
  <div class="container">
    <form class="calc-card pricing-calc reveal" data-calc="licence" data-base="${base}" data-extra="${PACKAGE.extraShopPriceDzd}" data-included="${PACKAGE.includedShops}" data-months="${PACKAGE.updateYears * 12}" data-currency="${locale === "ar" ? "دج" : "DA"}" onsubmit="return false">
      <h2 class="calc-title">${icon("calculator")}<span>${esc(p.calc.title)}</span></h2>
      <label class="calc-field"><span class="calc-label">${esc(p.calc.shops)}</span>
        <span class="calc-control"><input type="range" name="shops" min="${PACKAGE.includedShops}" max="${PACKAGE.maximumShops}" step="1" value="${PACKAGE.includedShops}" data-calc-input><output data-calc-out="shops">${PACKAGE.includedShops}</output></span>
      </label>
      <div class="shop-dots" aria-hidden="true">${Array.from({ length: PACKAGE.maximumShops }, (_, i) => `<i class="${i < PACKAGE.includedShops ? "is-in" : ""}" data-shop-dot="${i}">${icon("storefront")}</i>`).join("")}</div>
      <p class="calc-split" data-calc-split data-included-label="${esc(p.calc.included(PACKAGE.includedShops))}" data-extra-label="${esc(p.calc.extra("{n}"))}">${esc(p.calc.included(PACKAGE.includedShops))}</p>
      <div class="calc-result">
        <div><span>${esc(p.calc.total)}</span><b data-calc-result="total">${money(base, locale)}</b></div>
        <div><span data-calc-monthly-label="${esc(p.calc.monthly("{amount}", PACKAGE.updateYears))}">${esc(p.calc.monthly(money(monthlyOverUpdateYears(base), locale), PACKAGE.updateYears))}</span></div>
      </div>
      ${lp.offer ? `<p class="calc-note">${icon("sparkle")}<span>${esc(p.calc.offerNote)}</span></p>` : ""}
    </form>
  </div>
</section>`
    : "";
  const included = p.included(PACKAGE);
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "key", title: p.title, lead: p.lead, cls: "is-center" })}
<section class="section tight">
  <div class="container plans reveal-stagger">
    ${card({ name: p.trial.name, price: p.trial.price, per: p.trial.per(SITE.trialDays), points: p.trial.points, cta: p.trial.cta, url: href(locale, "download") })}
    ${card({ name: p.licence.name, price: lp.price, per: p.licence.per, points: p.licence.points(PACKAGE), cta: p.licence.cta, url: whatsappHref(t.whatsappMessage), external: true, featured: true, badge: p.licence.badge, offer: lp.offer, sub: lp.amount ? t.home.pricing.perMonth(money(monthlyOverUpdateYears(lp.amount), locale)) : null })}
    ${card({ name: p.extra.name, price: `+${money(PACKAGE.extraShopPriceDzd, locale)}`, per: p.extra.per, points: p.extra.points(PACKAGE), cta: p.extra.cta, url: whatsappHref(t.whatsappMessage), external: true })}
  </div>
</section>
${calc}
<section class="section">
  <div class="container">
    ${sectionHead({ title: p.includedTitle, lead: p.includedLead, center: true })}
    <dl class="included reveal">${included.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
  </div>
</section>
<section class="section">
  <div class="container narrow">
    ${sectionHead({ title: p.compareTitle, lead: p.compareLead(PACKAGE.updateYears), center: true })}
    <div class="vs-table reveal" role="table">
      <div class="vs-row vs-head" role="row"><span role="columnheader"></span><span role="columnheader" class="vs-us">${esc(p.compareSahelName)}</span><span role="columnheader">${esc(p.compareSaasName)}</span></div>
      ${p.compareRows.map((row, i) => `<div class="vs-row" role="row"><span role="rowheader">${esc(row)}</span><span role="cell" class="vs-us">${statusIcon("yes")}${esc(p.compareSahel[i])}</span><span role="cell">${statusIcon("no")}${esc(p.compareSaas[i])}</span></div>`).join("")}
    </div>
    <p class="center-cta">${button(href(locale, "why"), t.home.why.cta, { kind: "ghost", iconName: "scale" })}</p>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: p.howTitle, center: true })}
    <ol class="steps reveal-stagger">${p.how.map(([k, v], i) => `<li class="step reveal"><span class="step-num">${i + 1}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></li>`).join("")}</ol>
  </div>
</section>
<section class="section">
  <div class="container narrow">
    ${sectionHead({ eyebrow: t.common.questions, title: t.nav.pricing, center: true })}
    ${faqList(p.faq, { name: "pricing-faq" })}
  </div>
</section>
${finalCta(locale)}`;
  return shell({ locale, pageId: "pricing", path: "pricing", title, description, jsonLd: [faqJsonLd(p.faq)] }, body);
}

/* ───────────────────────────── why ───────────────────────────── */

export function whyPage(locale) {
  const t = COPY[locale];
  const w = t.why;
  const [title, description] = meta(locale, "why");
  const reasonIcons = ["key", "chart", "lock", "wifiOff", "whatsapp", "coins"];
  const cell = ([text, kind], us) => `<span role="cell"${us ? ' class="vs-us"' : ""}>${statusIcon(kind)}<span>${esc(text)}</span></span>`;
  const sahel = PACKAGE.priceDzd;
  const monthly = 9500;
  const years = PACKAGE.updateYears;
  const body = `${pageHero({ locale, eyebrow: w.eyebrow, eyebrowIcon: "scale", title: w.title, lead: w.lead, actions: ctas(locale, { primary: w.cta }), cls: "is-center" })}
<section class="section tight">
  <div class="container">
    <div class="reasons reveal-stagger">${w.reasons.map(([k, v], i) => `<article class="reason reveal" data-spotlight><span class="reason-icon">${icon(reasonIcons[i])}</span><h2>${esc(k)}</h2><p>${esc(v)}</p></article>`).join("")}</div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: w.tableTitle, lead: w.tableLead, center: true })}
    <div class="vs-scroll reveal">
      <div class="vs-table is-three" role="table">
        <div class="vs-row vs-head" role="row"><span role="columnheader"></span>${w.columns.map((col, i) => `<span role="columnheader"${i === 0 ? ' class="vs-us"' : ""}>${i === 0 ? `<img src="/img/mark.svg" alt="" width="20" height="20">` : ""}${esc(col)}</span>`).join("")}</div>
        ${w.rows.map(([label, a, b, c]) => `<div class="vs-row" role="row"><span role="rowheader">${esc(label)}</span>${cell(a, true)}${cell(b)}${cell(c)}</div>`).join("")}
      </div>
    </div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: w.costTitle, lead: w.costLead, center: true })}
    <form class="calc-card cost-calc reveal" data-calc="cost" data-sahel="${sahel}" data-currency="${locale === "ar" ? "دج" : "DA"}" onsubmit="return false">
      <label class="calc-field"><span class="calc-label">${esc(w.costMonthly)}</span>
        <span class="calc-control"><input type="range" name="monthly" min="1900" max="24500" step="100" value="${monthly}" data-calc-input><output data-calc-out="monthly">${money(monthly, locale)}</output></span></label>
      <label class="calc-field"><span class="calc-label">${esc(w.costYears)}</span>
        <span class="calc-control"><input type="range" name="years" min="1" max="${years}" step="1" value="${years}" data-calc-input><output data-calc-out="years">${years}</output></span></label>
      <div class="cost-bars">
        <div class="cost-bar is-them"><span>${esc(w.costSubscription)}</span><i style="--w:100%" data-cost-bar="them"></i><b data-calc-result="them">${money(monthly * years * 12, locale)}</b></div>
        <div class="cost-bar is-us"><span>${esc(w.costSahel)}</span><i style="--w:${((sahel / (monthly * years * 12)) * 100).toFixed(1)}%" data-cost-bar="us"></i><b>${money(sahel, locale)}</b></div>
      </div>
      <p class="cost-saved"><span>${esc(w.costSaved)}</span><b data-calc-result="saved">${money(monthly * years * 12 - sahel, locale)}</b></p>
      <p class="calc-note">${icon("calculator")}<span>${esc(w.costNote)}</span></p>
    </form>
  </div>
</section>
<section class="section">
  <div class="container narrow">
    ${sectionHead({ title: w.honestTitle, center: true })}
    <div class="honest reveal-stagger">${w.honest.map(([k, v]) => `<article class="reveal"><h3>${esc(k)}</h3><p>${esc(v)}</p></article>`).join("")}</div>
  </div>
</section>
${finalCta(locale, { title: w.cta })}`;
  return shell({ locale, pageId: "why", path: "why", title, description }, body);
}

/* ───────────────────────────── security ───────────────────────────── */

export function securityPage(locale) {
  const t = COPY[locale];
  const s = t.securityPage;
  const [title, description] = meta(locale, "security");
  const icons = ["lock", "shield", "key", "backup", "sparkle", "check"];
  const body = `${pageHero({ locale, eyebrow: s.eyebrow, eyebrowIcon: "shield", title: s.title, lead: s.lead, cls: "is-center" })}
<section class="section tight">
  <div class="container">
    <div class="reasons reveal-stagger">${s.items.map(([k, v], i) => `<article class="reason reveal" data-spotlight><span class="reason-icon">${icon(icons[i])}</span><h2>${esc(k)}</h2><p>${esc(v)}</p></article>`).join("")}</div>
  </div>
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: s.flowsTitle, lead: s.flowsLead, center: true })}
    <div class="reveal">${flowDiagram(locale)}</div>
  </div>
</section>
<section class="section">
  <div class="container narrow">
    ${sectionHead({ eyebrow: t.common.questions, title: s.eyebrow, center: true })}
    ${faqList(s.faq, { name: "security-faq" })}
  </div>
</section>
${finalCta(locale)}`;
  return shell({ locale, pageId: "security", path: "security", title, description, jsonLd: [faqJsonLd(s.faq)] }, body);
}

/* ───────────────────────────── download ───────────────────────────── */

export function downloadPage(locale) {
  const t = COPY[locale];
  const d = t.downloadPage;
  const [title, description] = meta(locale, "download");
  const body = `<section class="page-hero download-hero" data-gl-host>
  ${stars(80, 21)}
  <canvas class="gl-canvas" data-gl data-gl-seed="1.2" data-gl-horizon="0.3" data-gl-offset="90" aria-hidden="true"></canvas>
  <div class="container download-inner reveal">
    <span class="download-mark">${icon("windows")}</span>
    <p class="eyebrow">${esc(d.eyebrow)}</p>
    <h1 class="page-title">${esc(d.title)}</h1>
    <p class="page-lead">${esc(d.lead)}</p>
    <p>${button(SITE.downloadUrl, d.button, { iconName: "download", size: "xl" })}</p>
    <p class="hero-note">${esc(d.meta)} · ${esc(t.home.hero.note(SITE.trialDays))}</p>
  </div>
  ${dunes()}
</section>
<section class="section">
  <div class="container">
    ${sectionHead({ title: d.stepsTitle, center: true })}
    <ol class="steps reveal-stagger">${d.steps.map(([k, v], i) => `<li class="step reveal"><span class="step-num">${i + 1}</span><h3>${esc(k)}</h3><p>${esc(v)}</p></li>`).join("")}</ol>
    <p class="notice reveal">${icon("shield")}<span>${esc(d.smartscreen)}</span></p>
  </div>
</section>
<section class="section">
  <div class="container narrow">
    <div class="req-card reveal">
      <h2>${icon("windows")}<span>${esc(d.requirementsTitle)}</span></h2>
      <ul class="check-list">${d.requirements.map((r) => `<li>${icon("check")}<span>${esc(r)}</span></li>`).join("")}</ul>
    </div>
    <div class="help-band reveal">
      <p>${esc(d.help)}</p>
      ${button(whatsappHref(t.whatsappMessage), d.helpCta, { kind: "glass", iconName: "whatsapp", external: true })}
    </div>
  </div>
</section>`;
  return shell({ locale, pageId: "download", path: "download", title, description }, body);
}

/* ───────────────────────────── help ───────────────────────────── */

export function helpPage(locale) {
  const t = COPY[locale];
  const h = t.helpPage;
  const [title, description] = meta(locale, "help");
  const all = HELP_TOPICS.flatMap((topic) => h.topics[topic.key][2]);
  const body = `<section class="page-hero help-hero">
  ${stars(60, 31)}
  <div class="container narrow reveal">
    <p class="eyebrow">${icon("help")}${esc(h.eyebrow)}</p>
    <h1 class="page-title">${esc(h.title)}</h1>
    <p class="page-lead">${esc(h.lead)}</p>
    <label class="help-search">${icon("search")}<input type="search" placeholder="${esc(h.search)}" aria-label="${esc(h.search)}" data-help-search></label>
  </div>
</section>
<section class="section tight">
  <div class="container">
    <div class="topic-grid reveal-stagger">${HELP_TOPICS.map((topic) => {
      const [name, text, items] = h.topics[topic.key];
      return `<a class="topic-card reveal" href="#${topic.key}" data-spotlight><span class="reason-icon">${icon(topic.icon)}</span><strong>${esc(name)}</strong><small>${esc(text)}</small><em>${items.length}</em></a>`;
    }).join("")}</div>
  </div>
</section>
<section class="section">
  <div class="container narrow" data-help-list>
    ${HELP_TOPICS.map((topic) => {
      const [name, , items] = h.topics[topic.key];
      return `<section class="help-topic" id="${topic.key}" data-help-topic><h2>${icon(topic.icon)}<span>${esc(name)}</span></h2>${faqList(items, { name: `help-${topic.key}` })}</section>`;
    }).join("")}
    <p class="help-empty" data-help-empty hidden>${esc(h.noResult)}</p>
    <div class="help-band reveal">
      <p>${esc(t.contactPage.title)}</p>
      ${button(whatsappHref(t.whatsappMessage), t.nav.talk, { kind: "glass", iconName: "whatsapp", external: true })}
    </div>
  </div>
</section>`;
  return shell({ locale, pageId: "help", path: "help", title, description, jsonLd: [faqJsonLd(all)] }, body);
}

/* ───────────────────────────── contact ───────────────────────────── */

export function contactPage(locale) {
  const t = COPY[locale];
  const c = t.contactPage;
  const [title, description] = meta(locale, "contact");
  const card = ([name, text], ic, url, cta, external) => `<article class="contact-card reveal" data-spotlight>
  <span class="reason-icon">${icon(ic)}</span><h2>${esc(name)}</h2><p>${esc(text)}</p>
  ${button(url, cta, { kind: "ghost", iconName: ic === "mail" ? "mail" : "whatsapp", external })}
</article>`;
  const body = `${pageHero({ locale, eyebrow: c.eyebrow, eyebrowIcon: "message", title: c.title, lead: c.lead, cls: "is-center" })}
<section class="section tight">
  <div class="container contact-grid reveal-stagger">
    ${card(c.whatsapp, "whatsapp", whatsappHref(t.whatsappMessage), c.write, true)}
    ${card(c.demo, "sparkle", whatsappHref(c.demoMessage), c.demo[0], true)}
    ${card(c.email, "mail", `mailto:${SITE.email}`, SITE.email, false)}
  </div>
</section>
${finalCta(locale)}`;
  return shell({ locale, pageId: "contact", path: "contact", title, description }, body);
}

/* ───────────────────────────── legal, 404, root ───────────────────────────── */

export function legalPage(locale, kind) {
  const t = COPY[locale];
  const sections = (kind === "privacy" ? PRIVACY : TERMS)[locale];
  const heading = kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle;
  const [title, description] = meta(locale, kind);
  const body = `<section class="page-hero legal-hero"><div class="container narrow"><h1 class="page-title">${esc(heading)}</h1><p class="page-lead">${esc(t.legal.updated)}: <time datetime="${LEGAL_UPDATED}">${LEGAL_UPDATED}</time></p></div></section>
<section class="section tight"><div class="container narrow prose">${sections.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join("")}</div></section>`;
  return shell({ locale, pageId: kind, path: kind, title, description }, body);
}

export function notFoundPage() {
  const locale = SITE.defaultLocale;
  const t = COPY[locale];
  const others = SITE.locales.filter((l) => l !== locale);
  const body = `<section class="page-hero notfound">
  ${stars(90, 404)}
  <div class="container narrow reveal">
    <p class="notfound-code">404</p>
    <h1 class="page-title">${esc(t.notFound.title)}</h1>
    <p class="page-lead">${esc(t.notFound.text)}</p>
    <p class="cta-row">${button(href(locale), t.notFound.back, { iconName: "arrow" })}${others.map((l) => button(href(l), COPY[l].notFound.back, { kind: "ghost", attrs: `lang="${l}" hreflang="${l}"` })).join("")}</p>
  </div>
  ${dunes()}
</section>`;
  return shell({ locale, pageId: "404", path: "", title: `${t.notFound.title} — SahelFlow`, description: t.notFound.text }, body);
}

export function rootRedirect() {
  const locales = JSON.stringify(SITE.locales);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SahelFlow</title>
<link rel="canonical" href="${SITE.origin}/${SITE.defaultLocale}/">
${SITE.locales.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE.origin}/${l}/">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${SITE.origin}/${SITE.defaultLocale}/">
<meta name="theme-color" content="#05070c">
<style>html{background:#05070c;color:#e8edf5;font-family:system-ui,sans-serif}a{color:#38bdf8}</style>
<script>
(function(){var l=${locales},c=null;try{c=localStorage.getItem("sf-lang")}catch(e){}
if(l.indexOf(c)<0){var n=(navigator.languages||[navigator.language||""]).map(function(x){return String(x).slice(0,2)});for(var i=0;i<n.length;i++){if(l.indexOf(n[i])>=0){c=n[i];break}}}
location.replace("/"+(l.indexOf(c)>=0?c:"${SITE.defaultLocale}")+"/")})();
</script>
<noscript><meta http-equiv="refresh" content="0; url=/${SITE.defaultLocale}/"></noscript>
</head>
<body><p><a href="/ar/">العربية</a> · <a href="/fr/">Français</a> · <a href="/en/">English</a></p></body>
</html>
`;
}
