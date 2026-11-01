// The home page, rebuilt. One order is the subject of the page: it is the object in the first screen, the thing you drag through
// four moments, and the screens it lives in. Flat fields, one family, no outlines, no shadows, no gradients.
// Every promise is reused from the copy files that claims.mjs already guards; the few new words are in i18n/home2.mjs.
import { COPY } from "./i18n/index.mjs";
import { HOME } from "./i18n/home.mjs";
import { H2 } from "./i18n/home2.mjs";
import { SITE } from "./config.mjs";
import { PACKAGE } from "./model.mjs";
import { flowScene } from "./flow3d.mjs";
import { button, esc, href, licencePricing, money, num, shotUrl, whatsappHref } from "./ui.mjs";

const unitOf = (locale) => (locale === "ar" ? "دج" : "DA");
const cash = (amount, locale) =>
  `<span class="money"><span class="num">${num(amount)}</span>&nbsp;<span class="unit">${unitOf(locale)}</span></span>`;
const latin = (text) => esc(text).replace(/Windows/g, '<span class="lat">Windows</span>');

/** A parcel label's barcode: deterministic bars, drawn as one SVG. */
function bars(seed) {
  let x = 0;
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const rects = [];
  while (x < 118) {
    n = (n * 1103515245 + 12345) >>> 0;
    const w = 1 + ((n >>> 16) % 4);
    if ((n >>> 8) % 3) rects.push(`<rect x="${x}" y="0" width="${w}" height="34"/>`);
    x += w + 1 + ((n >>> 20) % 2);
  }
  return `<svg class="bars" viewBox="0 0 120 34" aria-hidden="true" focusable="false" preserveAspectRatio="none">${rects.join("")}</svg>`;
}

/* ───────── 1. first screen: the headline, and the route of one order ───────── */
function hero(locale) {
  const h = HOME[locale].hero;
  const t = COPY[locale];
  const facts = h.facts.map(([v, l]) => `<li><b>${latin(v)}</b><span>${latin(l)}</span></li>`).join("");
  return `<section class="hero" aria-labelledby="h1">
<div class="hero-copy">
<h1 id="h1">${esc(h.h1)}</h1>
<p class="lead">${esc(h.sub)}</p>
<div class="hero-act">${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}<a class="text-link" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(t.home.hero.secondary)}</a></div>
<ul class="facts">${facts}</ul>
</div>
<div class="hero-stage">${flowScene(locale)}</div>
</section>`;
}

/* ───────── 2. the live thing: drag one order through four moments ───────── */
const FIELD = ["green", "red", "ink", "kraft"];

function orderCard(locale, i) {
  const h = HOME[locale];
  const step = h.how.steps[i];
  const [who, place, item, amount] = h.how.card;
  const chipOf = { new: "new", toCall: "call", confirmed: "ok", shipped: "ship" }[step.chip];
  const head = `<div class="oc-head"><b>${esc(who)}</b><span class="chip chip-${chipOf}">${esc(h.status[step.chip])}</span></div>`;
  const body = `<p class="oc-place">${esc(place)}</p><p class="oc-item">${esc(item)}</p><p class="oc-sum">${cash(amount, locale)}</p>`;
  if (i === 0) return `<div class="oc" data-ui="order-card"><p class="oc-msg">${esc(h.how.msg)}</p>${head}${body}</div>`;
  if (i === 1) return `<div class="oc" data-ui="order-card">${head}${body}<p class="oc-note"><b>${esc(h.board.reasonTitle)}</b><span>${esc(h.board.reason)}</span></p></div>`;
  if (i === 2) return `<div class="oc" data-ui="order-card">${head}${body}<p class="oc-ok">${esc(step.note)}</p></div>`;
  return `<div class="oc" data-ui="order-card">${head}${body}<div class="oc-label">${bars("DZ48210097")}<span class="num" dir="ltr">DZ 4821 0097</span></div><p class="oc-ok">${esc(step.note)}</p></div>`;
}

function stages(locale) {
  const h = HOME[locale];
  const x = H2[locale];
  const items = h.how.steps
    .map(
      (s, i) => `<li class="st f-${FIELD[i]}${i === 0 ? " is-on" : ""}" data-i="${i}">
<div class="st-clause"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
<div class="st-field">${orderCard(locale, i)}</div>
</li>`,
    )
    .join("");
  const names = x.stageNames
    .map((n, i) => `<li><button type="button" data-go="${i}"${i === 0 ? ' aria-current="true"' : ""}>${esc(n)}</button></li>`)
    .join("");
  return `<section class="stages" id="how" aria-labelledby="h-how" data-stages>
<div class="sec-head" data-rise><h2 id="h-how" class="rise" style="--i:0">${esc(h.how.h2)}</h2><p class="rise" style="--i:1">${esc(x.stagesLead)}</p></div>
<ol class="st-list" aria-live="polite">${items}</ol>
<div class="st-ctl">
<div class="rail" style="--p:0"><span class="rail-fill"></span><input type="range" min="0" max="3" step="1" value="0" aria-label="${esc(x.sliderLabel)}"></div>
<ol class="st-names">${names}</ol>
</div>
</section>`;
}

/* ───────── 3. the screens: an index of the real app ───────── */
const SCREENS = [
  ["orders", "orders"],
  ["inbox", "inbox"],
  ["delivery", "delivery"],
  ["accounting", "accounting"],
  ["risk", "risk"],
];

function screens(locale) {
  const t = COPY[locale];
  const f = HOME[locale].feats;
  const names = SCREENS.map(
    ([mod], i) =>
      `<li><button type="button" data-sc="${i}"${i === 0 ? ' aria-current="true"' : ""}>${esc(t.modules[mod].name)}</button><p>${esc(t.modules[mod].short)}</p></li>`,
  ).join("");
  const figs = SCREENS.map(([, shot], i) => {
    const set = [480, 800, 1200].map((w) => `${shotUrl(shot, locale, w)} ${w}w`).join(", ");
    return `<figure class="sc-fig${i === 0 ? " is-on" : ""}" data-fig="${i}"><img src="${shotUrl(shot, locale, 1200)}" srcset="${set}" sizes="(min-width: 900px) 72vw, 100vw" width="1200" height="750" alt="${esc(t.modules[SCREENS[i][0]].short)}"${i === 0 ? "" : ' loading="lazy"'} decoding="async"></figure>`;
  }).join("");
  return `<section class="screens" id="screens" aria-labelledby="h-screens" data-screens>
<div class="sc-list">
<div class="sc-head" data-rise><h2 id="h-screens" class="rise" style="--i:0">${esc(f.h2)}</h2><p class="rise" style="--i:1">${esc(f.lead)}</p></div>
<ul class="sc-names">${names}</ul>
<a class="text-link" href="${href(locale, "product")}">${esc(t.common.allModules)}</a>
</div>
<div class="sc-stage" aria-label="${esc(H2[locale].screensLabel)}">${figs}</div>
</section>`;
}

/* ───────── 4. one old photograph, one sentence ───────── */
function archive(locale) {
  const b = H2[locale].band;
  return `<section class="archive" aria-label="${esc(b.alt)}">
<figure class="ar-pic"><img src="/img/photo/biskra-market-1600.jpg" srcset="/img/photo/biskra-market-900.jpg 900w, /img/photo/biskra-market-1600.jpg 1600w" sizes="(min-width: 900px) 72vw, 100vw" width="1600" height="1180" alt="${esc(b.alt)}" loading="lazy" decoding="async"></figure>
<div class="ar-text" data-rise><p class="ar-line rise" style="--i:0">${esc(b.sentence)}</p><p class="ar-cap rise" style="--i:1">${esc(b.caption)}</p></div>
</section>`;
}

/* ───────── 5. prices, set like a menu ───────── */
function pricing(locale) {
  const t = COPY[locale];
  const p = t.pricingPage;
  const lp = licencePricing(locale);
  const H = HOME[locale].price;
  const row = (name, price, text) =>
    `<li class="pm rise"><div class="pm-top"><h4>${esc(name)}</h4><span class="pm-price">${price}</span></div><p>${esc(text)}</p></li>`;
  const trial = row(p.trial.name, esc(t.common.free), `${p.trial.per(SITE.trialDays)}. ${p.trial.points.slice(0, 3).join(". ")}.`);
  const licence = row(
    p.licence.name,
    lp.ask ? esc(lp.price) : `<span class="num">${esc(lp.price)}</span>`,
    lp.offer ? `${lp.offer.label}, ${lp.offer.then}. ${t.home.pricing.text}` : t.home.pricing.text,
  );
  const extra = row(p.extra.name, `<span class="num">+${esc(money(PACKAGE.extraShopPriceDzd, locale))}</span>`, p.extra.per);
  const compare = p.compareRows
    .map((name, i) => row(name, esc(p.compareSahel[i]), `${p.compareSaasName}: ${p.compareSaas[i]}`))
    .join("");
  return `<section class="pricing" id="price" aria-labelledby="h-price">
<div class="pr-head" data-rise><h2 id="h-price" class="rise" style="--i:0">${esc(H.h2)}</h2>${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}</div>
<div class="pr-list" data-rise>
<div class="pgroup"><h3 class="rise">${esc(t.nav.pricing)}</h3><ul>${trial}${licence}${extra}</ul></div>
<div class="pgroup"><h3 class="rise">${esc(H.compare)}</h3><ul>${compare}</ul></div>
</div>
</section>`;
}

/* ───────── 6. questions, as reading text ───────── */
const FAQ_PICK = [["start", 0], ["start", 1], ["start", 2], ["whatsapp", 0], ["whatsapp", 3], ["orders", 0], ["orders", 1], ["delivery", 0], ["licence", 0], ["licence", 2], ["data", 0], ["team", 0]];

function faq(locale) {
  const t = COPY[locale];
  const items = FAQ_PICK.map(([topic, i]) => t.helpPage.topics[topic][2][i]);
  const paras = items.map(([q, a]) => `<p class="rise"><b>${esc(q)}</b> ${esc(a)}</p>`).join("");
  return `<section class="faqs" id="faq" aria-labelledby="h-faq">
<div class="fq-head" data-rise><h2 id="h-faq" class="rise" style="--i:0">${esc(t.home.faqTitle)}</h2><a class="text-link" href="${href(locale, "help")}">${esc(t.nav.resourceLinks.help[0])}</a></div>
<div class="fq-text" data-rise>${paras}</div>
</section>`;
}

/* ───────── 7. one sentence, one action ───────── */
function close(locale) {
  const t = COPY[locale];
  return `<section class="close" aria-labelledby="h-close" data-rise>
<h2 id="h-close" class="rise" style="--i:0">${esc(HOME[locale].close.h2)}</h2>
<div class="rise" style="--i:1">${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}</div>
</section>`;
}

export function homeBody(locale) {
  return `<div class="home">
${[hero, stages, screens, archive, pricing, faq, close].map((f) => f(locale)).join("\n")}
</div>
<script src="/assets/stage.js?v=${SITE.asset}" defer></script>
<script src="/assets/flow.js?v=${SITE.asset}" defer></script>`;
}
