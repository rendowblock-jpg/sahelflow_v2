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
<h2>${esc(title ?? HOME[locale].close.h2)}</h2>
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

const unitOf = (locale) => (locale === "ar" ? "دج" : "DA");
const cash = (amount, locale) => `<span class="money"><span class="num">${num(amount)}</span>&nbsp;<span class="unit">${unitOf(locale)}</span></span>`;
const latin = (text) => esc(text).replace(/Windows/g, '<span class="lat">Windows</span>');

/** A real screenshot at 480 / 800 / 1200 px. Tiles crop it with object-fit; --z / --ox / --oy zoom into a close-up. */
function boardImg(key, locale, { sizes, alt = "", eager = false, cls = "" }) {
  const set = [480, 800, 1200].map((w) => `${shotUrl(key, locale, w)} ${w}w`).join(", ");
  return `<img${cls ? ` class="${cls}"` : ""} src="${shotUrl(key, locale, 800)}" srcset="${set}" sizes="${sizes}" width="1200" height="750" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
}

function homeHero(locale) {
  const h = HOME[locale].hero;
  const t = COPY[locale];
  const facts = h.facts
    .map(([v, l], i) => `<li class="tile t-fact rise" style="--i:${i + 3}"><b class="fv">${latin(v)}</b><span>${latin(l)}</span></li>`)
    .join("");
  return `<section class="board hero" aria-labelledby="h1" data-rise>
<div class="tile t-name rise" style="--i:0"><p class="name" dir="ltr">SahelFlow</p></div>
<div class="tile t-line rise" style="--i:1"><h1 id="h1">${esc(h.h1)}</h1><p>${esc(h.sub)}</p></div>
<div class="tile t-act rise" style="--i:2">${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}<a class="text-link" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(t.home.hero.secondary)}</a></div>
<div class="tile t-shot shutter"><div class="hero-stage" data-hero3d><span class="crop">${boardImg("inbox", locale, { sizes: "(min-width: 1100px) 50vw, 100vw", alt: h.alt, eager: true })}</span></div></div>
<ul class="facts-row">${facts}</ul>
</section>`;
}

function boardSection(locale) {
  const b = HOME[locale].board;
  const st = HOME[locale].status;
  const total = b.rows.reduce((n, r) => n + r[3], 0);
  const rows = b.rows
    .map(([who, place, item, amount, status], i) => {
      const row = `<li class="orow is-${status}" style="--i:${i}"><b class="o-who">${esc(who)}</b><span class="o-place">${esc(place)}</span><span class="o-item">${esc(item)}</span><span class="o-sum">${cash(amount, locale)}</span><span class="stamp sp-${status}">${esc(st[status])}</span></li>`;
      return i === 0
        ? `${row}<li class="oreason" aria-label="${esc(b.reasonTitle)}"><b>${esc(b.reasonTitle)}</b><span>${esc(b.reason)}</span></li>`
        : row;
    })
    .join("");
  return `<section class="band" id="orders" aria-labelledby="h-orders">
<div class="tile t-head rise-wrap" data-rise><h2 id="h-orders" class="rise" style="--i:0">${esc(b.h2)}</h2><p class="rise" style="--i:1">${esc(b.lead)}</p></div>
<ul class="orders" data-ui="orders-board" data-rise>${rows}</ul>
<p class="tile t-sum"><span>${esc(b.sum(b.rows.length, `${num(total)} ${unitOf(locale)}`))}</span><span class="muted">${esc(b.sample)}</span></p>
</section>`;
}

function howSection(locale) {
  const h = HOME[locale].how;
  const st = HOME[locale].status;
  const fields = h.steps
    .map((s, i) => {
      const [who, place, item, amount] = h.card;
      const extra = i === 0 ? `<p class="bubble">${esc(h.msg)}</p>` : `<p class="cnote">${esc(s.note)}</p>`;
      return `<li class="field f${i + 1}" data-rise><h3 class="rise" style="--i:0">${esc(s.title)}</h3><p class="rise" style="--i:1">${esc(s.text)}</p>
<div class="ocard rise" style="--i:2" data-ui="order-card">${extra}<b>${esc(who)}</b><span>${esc(place)}</span><span>${esc(item)}</span><span class="ocard-foot">${cash(amount, locale)}<span class="stamp sp-${s.chip}">${esc(st[s.chip])}</span></span></div></li>`;
    })
    .join("");
  return `<section class="band" id="how" aria-labelledby="h-how">
<div class="tile t-head" data-rise><h2 id="h-how" class="rise" style="--i:0">${esc(h.h2)}</h2></div>
<ol class="fields">${fields}</ol>
</section>`;
}

/* The mosaic: size class, module key, screenshot key, zoom and origin of the close-up. */
const MOSAIC = [
  ["m64", "delivery", "delivery", 1, "0%", "0%"],
  ["m62", "accounting", "accounting", 1.35, "0%", "0%"],
  ["m32", "risk", "risk", 1.7, "30%", "20%"],
  ["m32", "automations", "flow", 1.7, "70%", "30%"],
  ["m32", "orders", "orders", 1.7, "20%", "40%"],
  ["m32", "storefront", "studio", 1.7, "50%", "10%"],
  ["m32", "agents", "team", 1.7, "60%", "50%"],
  ["m32", "inbox", "inbox", 1.7, "10%", "80%"],
];
function featsSection(locale) {
  const f = HOME[locale].feats;
  const t = COPY[locale];
  const tiles = MOSAIC.map(([cls, mod, shot, z, ox, oy], i) => {
    const big = cls === "m64" || cls === "m62";
    return `<li class="tile t-crop ${cls}" style="--z:${z};--ox:${ox};--oy:${oy}"><span class="crop">${boardImg(shot, locale, { sizes: `(min-width: 760px) ${Math.ceil((big ? 50 : 25) * z)}vw, 100vw`, alt: "" })}</span><span class="cap">${esc(t.modules[mod]?.name ?? mod)}</span></li>`;
  }).join("");
  return `<section class="band" id="screens" aria-labelledby="h-screens">
<div class="tile t-head" data-rise><h2 id="h-screens" class="rise" style="--i:0">${esc(f.h2)}</h2><p class="rise" style="--i:1">${esc(f.lead)}</p></div>
<ul class="mosaic">${tiles}</ul>
</section>`;
}

function priceSection(locale) {
  const t = COPY[locale];
  const p = t.pricingPage;
  const lp = licencePricing(locale);
  const amount = lp.amount ?? PACKAGE.priceDzd;
  const H = HOME[locale].price;
  const rows = p.compareRows.map((row, i) => `<div class="cmp-row"><h3>${esc(row)}</h3><p>${esc(p.compareSahel[i])}</p><p class="muted-tile">${esc(p.compareSaas[i])}</p></div>`).join("");
  return `<section class="band" id="price" aria-labelledby="h-price">
<div class="tile t-head" data-rise><h2 id="h-price" class="rise" style="--i:0">${esc(H.h2)}</h2><p class="rise" style="--i:1">${esc(t.home.pricing.text)}</p></div>
<div class="plans" data-rise>
<div class="tile plan rise" style="--i:0"><h3>${esc(p.trial.name)}</h3><p class="pnum"><span class="num">${num(0)}</span> ${unitOf(locale)}</p><p>${esc(p.trial.per(SITE.trialDays))}</p><ul class="check-list">${p.trial.points.map((x) => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>${button(href(locale, "download"), p.trial.cta, { kind: "ghost", iconName: "download" })}</div>
<div class="tile plan plan-main rise" style="--i:1"><h3>${esc(p.licence.name)}</h3>${lp.offer ? `<p>${esc(lp.offer.label)}</p>` : ""}<p class="pnum"><span class="num" data-count-to="${amount}">${num(amount)}</span> ${unitOf(locale)}</p><p>${esc(p.licence.per)}${lp.offer ? ` · ${esc(lp.offer.then)}` : ""}</p><ul class="check-list">${p.licence.points(PACKAGE).map((x) => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>${button(href(locale, "pricing"), t.home.pricing.cta, { kind: "ghost", iconName: "arrow" })}</div>
</div>
<div class="cmp-table" role="group" aria-label="${esc(H.compare)}" data-rise>
<div class="cmp-row cmp-head"><h3>${esc(H.compare)}</h3><p>${esc(p.compareSahelName)}</p><p>${esc(p.compareSaasName)}</p></div>
${rows}
</div>
</section>`;
}

function faqSection(locale) {
  const t = COPY[locale];
  const items = [
    t.helpPage.topics.start[2][2],
    t.helpPage.topics.start[2][1],
    t.helpPage.topics.licence[2][0],
  ];
  const bands = items
    .map(([q, a], i) => `<div class="fband ${i % 2 ? "b2" : "b1"}"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`)
    .join("");
  return `<section class="band faqs" id="faq" aria-labelledby="h-faq">
<div class="tile t-head" data-rise><h2 id="h-faq" class="rise" style="--i:0">${esc(t.home.faqTitle)}</h2></div>
<div class="fbands">${bands}</div>
</section>`;
}

function closeSection(locale) {
  const t = COPY[locale];
  return `<section class="band close" aria-labelledby="h-close">
<div class="tile t-crop c-side" style="--z:1.8;--ox:20%;--oy:30%"><span class="crop">${boardImg("parcel", locale, { sizes: "(min-width: 760px) 40vw, 100vw" })}</span></div>
<div class="tile t-go" data-rise><h2 id="h-close" class="rise" style="--i:0">${esc(HOME[locale].close.h2)}</h2><p class="rise" style="--i:1">${esc(t.home.final.text)}</p><div class="rise" style="--i:2">${button(href(locale, "download"), t.home.hero.primary, { kind: "ghost", size: "lg" })}</div></div>
<div class="tile t-crop c-side" style="--z:1.8;--ox:80%;--oy:60%"><span class="crop">${boardImg("queue", locale, { sizes: "(min-width: 760px) 40vw, 100vw" })}</span></div>
</section>`;
}

export function homePage(locale) {
  const [title, description] = meta(locale, "home");
  const sections = [homeHero, boardSection, howSection, featsSection, priceSection, faqSection, closeSection].map((f) => f(locale)).join("\n");
  return shell({ locale, pageId: "home", path: "", title, description }, `<div class="page">\n${sections}\n</div>`);
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
      <ol class="ruled nn-list">${d.steps.map(([k, v], i) => `<li><span class="nn" aria-hidden="true">${icon("check")}</span><div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ol>
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
