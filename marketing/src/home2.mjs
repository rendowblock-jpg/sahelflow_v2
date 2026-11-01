// The home page. The first screen is Algeria itself in motion (src/map.js): orders arrive from the towns, parcels fly out, the cash
// comes back. Then one order is followed from WhatsApp message to parcel as you scroll (src/stage.js). The promises are reused from
// the copy files that claims.mjs already guards; the few new words are in i18n/home2.mjs.
import { COPY } from "./i18n/index.mjs";
import { HOME } from "./i18n/home.mjs";
import { H2 } from "./i18n/home2.mjs";
import { SITE } from "./config.mjs";
import { PACKAGE } from "./model.mjs";
import { CITIES, MAP_HEIGHT, MAP_WIDTH, mapDots, project } from "./algeria.mjs";
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

/* ───────── 1. first screen: Algeria in motion ───────── */
const TOWNS = ["algiers", "oran", "constantine", "annaba", "setif", "bejaia", "tlemcen", "biskra", "ghardaia", "ouargla", "bechar", "adrar", "tamanrasset", "eloued"];

function mapCfg(locale) {
  const names = H2[locale].cities;
  return {
    w: MAP_WIDTH,
    h: MAP_HEIGHT,
    d: mapDots(0.42).map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(","),
    c: TOWNS.map((k) => {
      const [x, y] = project(CITIES[k]);
      return [k, Math.round(x), Math.round(y), names[k]];
    }),
    amt: HOME[locale].board.rows.map((r) => r[3]),
    u: unitOf(locale),
    call: HOME[locale].status.toCall,
  };
}

function hero(locale) {
  const x = H2[locale];
  const t = COPY[locale];
  const facts = HOME[locale].hero.facts.map(([v, l]) => `<li><b>${latin(v)}</b><span>${latin(l)}</span></li>`).join("");
  const words = x.hero.h1
    .split(" ")
    .map((w, i) => `<span class="w"><i style="--i:${i}">${esc(w)}</i></span>`)
    .join(" ");
  return `<section class="hero" aria-labelledby="h1">
<canvas class="map" data-map="${esc(JSON.stringify(mapCfg(locale)))}" aria-hidden="true"></canvas>
<div class="hero-copy">
<h1 id="h1">${words}</h1>
<p class="lead">${esc(x.hero.sub)}</p>
<div class="hero-act">${button(href(locale, "download"), t.home.hero.primary, { kind: "primary", size: "lg" })}<a class="text-link" href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(t.home.hero.secondary)}</a></div>
<ul class="facts">${facts}</ul>
</div>
<div class="tally" aria-hidden="true"><div class="tally-row"><b class="tally-n" data-tally>18${"\u00a0"}400</b><span class="tally-u">${unitOf(locale)}</span></div><small>${esc(x.mapCaption)}</small></div>
<p class="sr-only">${esc(x.mapAlt)}</p>
</section>`;
}

/* ───────── 2. one order, followed by the scroll ───────── */
function story(locale) {
  const h = HOME[locale];
  const x = H2[locale];
  const [who, place, item, amount] = h.how.card;
  const steps = h.how.steps;
  const list = steps
    .map((s, i) => `<li${i === 0 ? ' class="on"' : ""} data-i="${i}"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`)
    .join("");
  const labels = [h.status.new, h.status.toCall, h.status.confirmed, h.status.shipped];
  return `<section class="story" id="how" aria-labelledby="h-how" data-story>
<div class="story-pin">
<div class="story-rail" aria-hidden="true"><i></i></div>
<div class="story-text">
<h2 id="h-how">${esc(h.how.h2)}</h2>
<p class="story-lead">${esc(x.storyLead)}</p>
<ol class="story-steps">${list}</ol>
</div>
<div class="scene" aria-hidden="true">
<div class="wa">
<div class="wa-bar"><i class="wa-av">${esc([...who][0])}</i><b>${esc(who)}</b><span>WhatsApp</span></div>
<div class="wa-body"><p class="wa-msg"><span class="wa-ghost">${esc(h.how.msg)}</span><span class="wa-typed">${esc(h.how.msg)}</span></p></div>
</div>
<div class="ocard">
<div class="r oc-head" style="--n:0"><b>${esc(who)}</b><span class="chip chip-ship" data-chip data-labels="${esc(JSON.stringify(labels))}">${esc(h.status.shipped)}</span></div>
<p class="r oc-place" style="--n:1">${esc(place)}</p>
<p class="r oc-item" style="--n:2">${esc(item)}</p>
<p class="r oc-sum" style="--n:3">${cash(amount, locale)}</p>
<div class="verdict"><p class="note"><b>${esc(h.board.reasonTitle)}</b><span>${esc(h.board.reason)}</span></p><p class="okbar"><span>${esc(steps[2].note)}</span></p></div>
<div class="lab">${bars("DZ48210097")}<span class="num" dir="ltr">DZ 4821 0097</span><small>${esc(steps[3].note)}</small></div>
<div class="stamp">${esc(h.status.toCall)}</div>
<div class="cashchip">+${cash(amount, locale)}</div>
</div>
</div>
</div>
</section>`;
}

/* ───────── 2b. a live strip of orders ───────── */
function ticker(locale) {
  const h = HOME[locale];
  const kind = { toCall: "call", confirmed: "ok", shipped: "ship", delivered: "new" };
  const one = h.board.rows
    .map(([who, place, item, amount, st]) => `<span class="tk"><b>${esc(who)}</b><i>${esc(place)}</i><em>${esc(item)}</em><u>${cash(amount, locale)}</u><span class="chip chip-${kind[st]}">${esc(h.status[st])}</span></span>`)
    .join("");
  const rev = h.board.rows
    .slice()
    .reverse()
    .map(([who, place, item, amount, st]) => `<span class="tk"><b>${esc(who)}</b><i>${esc(place)}</i><em>${esc(item)}</em><u>${cash(amount, locale)}</u><span class="chip chip-${kind[st]}">${esc(h.status[st])}</span></span>`)
    .join("");
  return `<section class="ticker" aria-hidden="true">
<div class="tk-row">${one}${one}</div>
<div class="tk-row rev">${rev}${rev}</div>
<p class="tk-cap">${esc(h.board.sample)}</p>
</section>`;
}

/* ───────── 3. the screens: the real app, playing ───────── */
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
      `<li><button type="button" data-sc="${i}"${i === 0 ? ' aria-current="true"' : ""}>${esc(t.modules[mod].name)}</button><i class="bar" aria-hidden="true"></i><p>${esc(t.modules[mod].short)}</p></li>`,
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
${[hero, story, ticker, screens, archive, pricing, faq, close].map((f) => f(locale)).join("\n")}
</div>
<script src="/assets/map.js?v=${SITE.asset}" defer></script>
<script src="/assets/stage.js?v=${SITE.asset}" defer></script>`;
}
