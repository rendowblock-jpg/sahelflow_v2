// Every page of sahelflow.com, rendered from the copy files and the model.
import { SHEETS } from "./i18n/sheets.mjs";
import { claimById as claimOf, installerIsSigned } from "./claims.mjs";
import { screenImg as shotImg, statusBadge as factStamp } from "./ui.mjs";
import { SITE } from "./config.mjs";
import { integrationStatus, statusLabel, statusesOf } from "./claims.mjs";
import { COPY } from "./i18n/index.mjs";
import { shell } from "./layout.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { BRAND_NAMES, HELP_TOPICS, INTEGRATIONS, MODULES, PACKAGE, SOLUTIONS, monthlyOverUpdateYears } from "./model.mjs";
import { assistantScene, coreDiagram, flowDiagram, screenStack, specPanel } from "./scenes.mjs";
import { HOME } from "./i18n/home.mjs";
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
  statusBadge,
} from "./ui.mjs";

const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));
const meta = (locale, key) => COPY[locale].meta[key];

/* ───────────────────────────── shared blocks ───────────────────────────── */

export function pageHero({ locale, before = "", eyebrow, eyebrowIcon, title, lead, actions = "", art = "", cls = "" }) {
  return `<section class="sheet-head ${cls}${art ? " has-art" : ""}">
  <div class="container sheet-in">
    <div class="sheet-copy">
      ${before}
      ${eyebrow ? `<p class="eyebrow">${eyebrowIcon ? icon(eyebrowIcon) : ""}${esc(eyebrow)}</p>` : ""}
      <h1 class="page-title">${esc(title)}</h1>
      ${lead ? `<p class="page-lead">${esc(lead)}</p>` : ""}
      ${actions}
    </div>
    ${art ? `<div class="sheet-art">${art}</div>` : ""}
  </div>
</section>`;
}

export function finalCta(locale, { title, text } = {}) {
  const t = COPY[locale];
  return `<section class="end">
<div class="in">
<h2>${esc(title ?? t.home.final.title)}</h2>
<p>${esc(text ?? t.home.final.text)}</p>
${ctas(locale)}
<p class="fine">${esc(t.home.hero.note(SITE.trialDays))}</p>
</div>
</section>`;
}

const monogram = (key) => BRAND_NAMES[key].replace(/[^A-Za-z]/g, "").slice(0, 2);
export function brandTile(key) {
  return `<span class="brand-tile" aria-hidden="true">${esc(monogram(key))}</span>`;
}

function marquee(locale) {
  const t = COPY[locale];
  const keys = Object.keys(BRAND_NAMES);
  const items = keys
    .map((key) => {
      const status = integrationStatus(key);
      return `<li data-status="${status}">${brandTile(key)}<span class="bn">${esc(BRAND_NAMES[key])}</span>${statusBadge(status, locale)}</li>`;
    })
    .join("");
  const label = `${t.home.marquee} · ${statusesOf(keys).map((status) => statusLabel(status, locale)).join(" / ")}`;
  return `<div class="int-strip" role="group" aria-label="${esc(label)}"><p class="int-label">${esc(label)}</p><ul>${items}</ul></div>`;
}

/** The calm number-safety sentence, shown wherever the WhatsApp inbox is sold. */
export function whatsappNote(locale) {
  return `<section class="section tight">
  <div class="container">
    <p class="notice reveal">${icon("whatsapp")}<span>${esc(COPY[locale].common.whatsappNote)}</span></p>
  </div>
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

const rich = (s) => esc(s).replace(/Windows/g, '<span class="lat">Windows</span>');
const unitOf = (locale) => (locale === "ar" ? "دج" : "DA");
const cash = (amount, locale) => `<span class="money"><span class="num">${num(amount)}</span>&nbsp;<span class="unit">${unitOf(locale)}</span></span>`;

/** The hero ledger: a message becomes a pencilled draft, the seller approves, the line is inked and stamped (CSS only). */
function ledgerFigure(locale) {
  const L = HOME[locale].ledger;
  const ln = (mg, tx) => `<div class="ln"><span class="mg">${mg}</span><span class="tx">${tx}</span></div>`;
  return `<figure class="lg go" data-ledger aria-labelledby="lgc">
<div class="lg-h"><span>${esc(L.page)}</span><span>${esc(L.date)}</span></div>
<div class="lg-m"><span class="lab">${esc(L.wa)} · <span class="num">14:02</span></span><p class="slip">${esc(L.msg)}</p></div>
<div class="lg-rows"><div class="dr" aria-hidden="true">
${ln("—", `<b>${esc(L.draftNote)}</b>`)}
${ln("", `<span>${esc(L.item)}</span><span>${esc(L.place)}</span>`)}
${ln("", `${cash(4800, locale)}<span class="ghost">${esc(L.approve)}</span>`)}
</div><div class="fin">
${ln(`<span class="num">${L.id}</span>`, `<b>${esc(L.name)}</b><span class="ph"><span class="num">${L.phone}</span></span>`)}
${ln("", `<span>${esc(L.item)}</span><span>${esc(L.place2)}</span>`)}
${ln("", `${cash(4800, locale)}<span class="stamp sp-toCall">${esc(L.stamp)}</span><span class="hn">${esc(L.hint)}</span>`)}
</div></div>
<figcaption class="cap" id="lgc"><span>${esc(L.caption)}</span><button class="lnk" data-replay type="button">${esc(L.replay)}</button></figcaption>
</figure>`;
}

function homeHero(locale) {
  const h = HOME[locale].hero;
  const t = COPY[locale];
  return `<section class="sec hero" aria-labelledby="h1">
<div>
<h1 id="h1">${esc(h.h1)}</h1>
<p class="lead">${rich(h.lead)}</p>
<div class="cta">${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}<span class="fine">${esc(t.home.hero.note(SITE.trialDays))}</span></div>
<p class="tag">${esc(h.tag)}</p>
</div>
${ledgerFigure(locale)}
</section>`;
}

function callSection(locale) {
  const c = HOME[locale].call;
  const rows = c.rows
    .map((r) => `<div class="mrow${r.mg ? " is-risk" : ""}"><span class="mg">${esc(r.mg) || "&nbsp;"}</span><span class="tx"><b>${esc(r.who)}</b><span>${esc(r.what)}</span>${cash(r.amount, locale)}<span class="stamp sp-${r.stamp}">${esc(r.label)}</span></span></div>`)
    .join("");
  return `<section class="sec" id="call" aria-labelledby="h-call">
<h2 id="h-call">${esc(c.h2)}</h2>
<p class="lead">${esc(c.p)}</p>
<div class="callbook">${rows}</div>
<p class="note">${esc(c.note)}</p>
</section>`;
}

const STEP_STAMP = ["sp-new", "sp-toCall", "sp-confirmed", "sp-shipped", "sp-delivered"];
function daySection(locale) {
  const d = HOME[locale].day;
  return `<section class="sec" id="day" aria-labelledby="h-day">
<h2 id="h-day">${esc(d.h2)}</h2>
<ol class="day">${d.steps.map((s, i) => `<li><span class="stamp ${STEP_STAMP[i]}">${esc(s.stamp)}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join("")}</ol>
</section>`;
}

function shotsSection(locale) {
  const h = HOME[locale].shots;
  const t = COPY[locale];
  const figs = ["inbox", "orders", "delivery"]
    .map((key, i) => {
      const m = t.modules[key];
      return `<figure class="shot">${shotImg(key, locale, { alt: `${m.name}: ${m.short}`, lazy: i !== 0 })}<figcaption>${esc(m.name)}</figcaption></figure>`;
    })
    .join("");
  return `<section class="sec" id="screens" aria-labelledby="h-screens">
<h2 id="h-screens">${esc(h.h2)}</h2>
<p class="lead">${esc(h.lead)}</p>
<div class="shots">${figs}</div>
</section>`;
}

function intSection(locale) {
  const t = COPY[locale];
  return `<section class="sec" id="int" aria-labelledby="h-int">
<h2 id="h-int">${esc(t.nav.integrations)}</h2>
<p class="lead">${esc(HOME[locale].int.p)}</p>
${marquee(locale)}
<p class="more">${button(href(locale, "integrations"), t.nav.integrations, { kind: "ghost", iconName: "arrow" })}</p>
</section>`;
}

function priceSection(locale) {
  const t = COPY[locale];
  const p = t.pricingPage.licence;
  const lp = licencePricing(locale);
  const amount = lp.amount ?? PACKAGE.priceDzd;
  const points = p.points(PACKAGE);
  return `<section class="sec" id="price" aria-labelledby="h-price">
<h2 id="h-price">${esc(t.home.pricing.title)}</h2>
<p class="lead">${esc(t.home.pricing.text)}</p>
<div class="pgrid">
<div class="plate">
${lp.offer ? `<span class="pc">${esc(lp.offer.label)}</span>` : ""}
<div class="pn2"><span class="num" data-count-to="${amount}">${num(amount)}</span><span class="pu">${unitOf(locale)}</span></div>
<span class="pc">${esc(p.per)}${lp.offer ? ` · ${esc(lp.offer.then)}` : ""}</span>
</div>
<div>
<ul class="incl">${points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
${button(href(locale, "pricing"), t.home.pricing.cta, { kind: "primary", iconName: "arrow" })}
</div>
</div>
</section>`;
}

function faqSection(locale) {
  const t = COPY[locale];
  const items = [
    t.helpPage.topics.start[2][2],
    t.helpPage.topics.start[2][1],
    t.helpPage.topics.licence[2][0],
    t.helpPage.topics.whatsapp[2][1],
    t.helpPage.topics.team[2][0],
  ];
  return `<section class="sec" id="faq" aria-labelledby="h-faq">
<h2 id="h-faq">${esc(t.home.faqTitle)}</h2>
${faqList(items, { name: "home-faq" })}
</section>`;
}

export function homePage(locale) {
  const [title, description] = meta(locale, "home");
  const sections = [homeHero, callSection, daySection, shotsSection, intSection, priceSection, faqSection].map((f) => f(locale)).join("\n");
  return shell({ locale, pageId: "home", path: "", title, description }, `<div class="page">\n${sections}\n</div>\n${finalCta(locale)}`);
}

/* ───────────────────────────── pricing ───────────────────────────── */

export function pricingPage(locale) {
  const t = COPY[locale];
  const p = t.pricingPage;
  const lp = licencePricing(locale);
  const [title, description] = meta(locale, "pricing");
  const amount = lp.amount ?? PACKAGE.priceDzd;
  const plate = `<div class="plate" id="licence">
${lp.offer ? `<span class="pc">${esc(lp.offer.label)}</span>` : ""}
<div class="pn2"><span class="num">${num(amount)}</span><span class="pu">${unitOf(locale)}</span></div>
<span class="pc">${esc(p.licence.per)}${lp.offer ? ` · ${esc(lp.offer.then)}` : ""}</span>
</div>`;
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "key", title: p.title, lead: p.lead })}
<section class="sheet-sec" id="price" aria-label="${esc(p.licence.name)}">
  <div class="container">
    <h2>${esc(p.licence.name)}</h2>
    <div class="pgrid">
      ${plate}
      <div>
        <ul class="incl">${p.licence.points(PACKAGE).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <p class="cta">${button(whatsappHref(t.whatsappMessage), p.licence.cta, { iconName: "whatsapp", external: true })}</p>
      </div>
    </div>
    <ul class="ruled">
      <li><h3>${esc(p.trial.name)}</h3><p>${esc(p.trial.per(SITE.trialDays))}</p>${button(href(locale, "download"), p.trial.cta, { kind: "ghost", iconName: "download" })}</li>
      <li><h3>${esc(p.extra.name)}</h3><p>+${money(PACKAGE.extraShopPriceDzd, locale)} · ${esc(p.extra.per)}</p></li>
    </ul>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(p.compareTitle)}</h2>
    <p class="lead">${esc(p.compareLead(PACKAGE.updateYears))}</p>
    <div class="cmp">
      <div class="cmp-h"><span>${esc(p.compareSahelName)}</span><span>${esc(p.compareSaasName)}</span></div>
      ${p.compareRows.map((row, i) => `<div class="cmp-r"><h3>${esc(row)}</h3><p>${statusIcon("yes")}<span>${esc(p.compareSahel[i])}</span></p><p>${statusIcon("no")}<span>${esc(p.compareSaas[i])}</span></p></div>`).join("")}
    </div>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(t.common.questions)}</h2>
    ${faqList(p.faq, { name: "pricing-faq" })}
  </div>
</section>
${finalCta(locale)}`;
  return shell({ locale, pageId: "pricing", path: "pricing", title, description, jsonLd: [faqJsonLd(p.faq)] }, body);
}

/* ───────────────────────────── why ───────────────────────────── */

export function whyPage(locale) {
  const w = COPY[locale].why;
  const [title, description] = meta(locale, "why");
  const reasonIcons = ["key", "chart", "lock", "wifiOff"];
  const row = ([label, a, b]) => `<div class="cmp-r"><h3>${esc(label)}</h3><p>${statusIcon(a[1])}<span>${esc(a[0])}</span></p><p>${statusIcon(b[1])}<span>${esc(b[0])}</span></p></div>`;
  const body = `${pageHero({ locale, eyebrow: w.eyebrow, eyebrowIcon: "scale", title: w.title, lead: w.lead, actions: ctas(locale, { primary: w.cta }) })}
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(w.reasonsTitle)}</h2>
    <ul class="ruled nn-list">${w.reasons.map(([k, v], i) => `<li><span class="nn" aria-hidden="true">${icon(reasonIcons[i] ?? "key")}</span><div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ul>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(w.tableTitle)}</h2>
    <p class="lead">${esc(w.tableLead)}</p>
    <div class="cmp">
      <div class="cmp-h"><span>${esc(w.columns[0] ?? "")}</span><span>${esc(w.columns[1] ?? "")}</span></div>
      ${w.rows.map(row).join("")}
    </div>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(w.honestTitle)}</h2>
    <div class="callbook">${w.honest.map(([k, v]) => `<div class="mrow is-risk"><span class="mg">${esc(w.honestMark)}</span><span class="tx"><b>${esc(k)}</b><span>${esc(v)}</span></span></div>`).join("")}</div>
  </div>
</section>
${finalCta(locale, { title: w.cta })}`;
  return shell({ locale, pageId: "why", path: "why", title, description }, body);
}

/* ───────────────────────────── security ───────────────────────────── */

export function securityPage(locale) {
  const t = COPY[locale];
  const s = t.securityPage;
  const S = SHEETS[locale];
  const [title, description] = meta(locale, "security");
  // Each stamped fact is tied to its entry in claims.mjs: the stamp always says that entry's status.
  const fact = (id, [k, v]) => {
    const status = claimOf(id).status;
    return `<li class="fact" data-claim="${id}" data-claim-status="${status}">${factStamp(status, locale)}<div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`;
  };
  const plain = (items) => items.map(([k, v]) => `<li><div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("");
  const body = `${pageHero({ locale, eyebrow: s.eyebrow, eyebrowIcon: "shield", title: s.title, lead: s.lead })}
<section class="sheet-sec">
  <div class="container two">
    <div><h2>${esc(S.secProven)}</h2><ul class="ruled facts">${fact("local-first", s.items[0] ?? ["", ""])}${fact("pin-roles", s.items[2] ?? ["", ""])}${fact("ai-asks-first", s.items[4] ?? ["", ""])}${fact("data-encrypted", s.items[1] ?? ["", ""])}${fact("updates-verified", s.items[5] ?? ["", ""])}</ul></div>
    <div><h2>${esc(S.secPending)}</h2><ul class="ruled facts">${fact("backup-restore-new-pc", s.items[3] ?? ["", ""])}</ul></div>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(s.flowsTitle)}</h2>
    <p class="lead">${esc(s.flowsLead)}</p>
    <ul class="ruled">${plain(s.flows)}</ul>
  </div>
</section>
<section class="sheet-sec">
  <div class="container narrow">
    <h2>${esc(t.common.questions)}</h2>
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
  const S = SHEETS[locale];
  const [title, description] = meta(locale, "download");
  // The honest sentence about the missing publisher certificate. Delete the comment line and the paragraph under it
  // when the installer is signed (claims.mjs installerIsSigned() then also returns true).
  const unsigned = installerIsSigned()
    ? ""
    : `<!-- founder: remove this sentence when the installer is signed -->
<p class="notice">${icon("shield")}<span>${esc(d.unsigned)}</span></p>`;
  const actions = `<p class="cta">${button(SITE.downloadUrl, d.button, { iconName: "download", size: "lg" })}<span class="fine">${esc(d.meta)} · ${esc(t.home.hero.note(SITE.trialDays))}</span></p>`;
  const body = `${pageHero({ locale, eyebrow: d.eyebrow, eyebrowIcon: "windows", title: d.title, lead: d.lead, actions })}
<section class="sheet-sec">
  <div class="container two">
    <div>
      <h2>${esc(d.stepsTitle)}</h2>
      <ol class="ruled nn-list">${d.steps.map(([k, v], i) => `<li><span class="nn">${i + 1}</span><div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ol>
    </div>
    <div>
      <h2>${esc(S.dlSmartTitle)}</h2>
      <p>${esc(d.smartscreen)}</p>
      ${unsigned}
    </div>
  </div>
</section>
<section class="sheet-sec">
  <div class="container two">
    <div class="panel req-card">
      <h2>${esc(d.requirementsTitle)}</h2>
      <ul class="check-list">${d.requirements.map((r) => `<li>${icon("check")}<span>${esc(r)}</span></li>`).join("")}</ul>
    </div>
    <div>
      <p>${esc(d.help)}</p>
      <p class="cta">${button(whatsappHref(t.whatsappMessage), d.helpCta, { kind: "ghost", iconName: "whatsapp", external: true })}</p>
    </div>
  </div>
</section>`;
  return shell({ locale, pageId: "download", path: "download", title, description }, body);
}

/* ───────────────────────────── help ───────────────────────────── */

/* help, contact, legal and 404 are in inner.mjs */

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

export { contactPage, helpPage, integrationsPage, legalPage, modulePage, notFoundPage, productPage, solutionPage } from "./inner.mjs";
