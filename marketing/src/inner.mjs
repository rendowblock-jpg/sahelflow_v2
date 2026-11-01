// The inner pages of sahelflow.com on the well-kept board: every block is one flat tile on a 12-column grid, 8 px gaps.
// Product, module (one template), solution, integrations, pricing, why, security, download, help, contact, legal, 404.
// Statuses always come from claims.mjs. Class prefix "i" (ib board, it tile) keeps these rules apart from the home.
import { claimById, installerIsSigned, integrationStatus } from "./claims.mjs";
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { SHEETS } from "./i18n/sheets.mjs";
import { shell } from "./layout.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { BRAND_NAMES, HELP_TOPICS, INTEGRATIONS, MODULES, PACKAGE, SOLUTIONS } from "./model.mjs";
import { button, esc, faqJsonLd, href, icon, licencePricing, money, num, screenImg, statusBadge, whatsappHref } from "./ui.mjs";


/** Drafts in three languages: they go to a native reader (audit/waves/C4-copy-for-native-read.md). */
const TEXT = {
  ar: {
    dayTitle: "يوم في المتجر",
    nopeTitle: "ما لا يفعله بعد",
    productDays: "تسعة أجزاء من يوم واحد",
    day: {
      inbox: "في الثامنة والنصف يكتب زبون على واتساب. المحادثة والطلب جنباً إلى جنب، فتؤكّد دون أن تنسخ شيئاً.",
      orders: "عند العاشرة تجد الطلبات الجديدة في صف واحد: تؤكّد أو تصحّح العنوان أو ترفض، ويُكتب كل تغيير في سجل الطلب.",
      delivery: "عند الظهر تشحن الطلبات المؤكَّدة، ويبقى رقم التتبع وحالة كل طرد في سطر الطلب نفسه.",
      risk: "قبل الشحن تُنبَّه إلى طلب من ولاية أو رقم سبق أن تعثّر، وأنت من يقرّر.",
      accounting: "في المساء ترى ما بِيع وما سُلِّم وما رجع، بالدينار الصحيح.",
      automations: "وأنت تتغدّى ترسل قواعدك التذكير أو تغيّر الحالة، وكل رسالة تلقائية مُباعَدة ومسجَّلة.",
      storefront: "في الليل يفتح زبون متجرك من هاتفه ويختار ويطلب، فيصل الطلب إلى الصف نفسه.",
      agents: "تسأل المساعد عن طرود الأمس المتأخرة، فيقترح التغيير وينتظر نقرتك.",
      team: "ابن عمّك يردّ على المحادثات بحسابه، ولا يرى إلا المتاجر التي منحتها له.",
    },
    facts: { "wilayas-69": "شاشة الولايات الـ69", "backup-restore-new-pc": "الاستعادة على حاسوب جديد" },
  },
  fr: {
    dayTitle: "Une journée à la boutique",
    nopeTitle: "Ce qu'il ne fait pas encore",
    productDays: "Les neuf parties d'une journée",
    day: {
      inbox: "À 8 h 40 un client écrit sur WhatsApp. La conversation et la commande sont côte à côte : vous confirmez sans rien recopier.",
      orders: "À 10 h, les nouvelles commandes sont dans une seule file : vous confirmez, corrigez l'adresse ou refusez, et chaque changement est écrit dans l'historique.",
      delivery: "À midi vous expédiez les commandes confirmées ; le numéro de suivi et l'état de chaque colis restent sur la ligne de la commande.",
      risk: "Avant d'expédier, une commande d'une wilaya ou d'un numéro qui a déjà posé problème est signalée, et c'est vous qui décidez.",
      accounting: "Le soir vous voyez ce qui a été vendu, livré et retourné, en dinars entiers.",
      automations: "Pendant que vous mangez, vos règles envoient le rappel ou changent l'état ; chaque message automatique est espacé et journalisé.",
      storefront: "La nuit un client ouvre votre boutique sur son téléphone, choisit et commande ; la commande arrive dans la même file.",
      agents: "Vous demandez à l'assistant les colis en retard d'hier ; il propose le changement et attend votre clic.",
      team: "Votre cousin répond aux conversations avec son propre compte et ne voit que les boutiques que vous lui avez données.",
    },
    facts: { "wilayas-69": "Écran des 69 wilayas", "backup-restore-new-pc": "Restauration sur un nouveau PC" },
  },
  en: {
    dayTitle: "A day in the shop",
    nopeTitle: "What it does not do yet",
    productDays: "Nine parts of one day",
    day: {
      inbox: "At 8:40 a customer writes on WhatsApp. The chat and the order sit side by side, so you confirm without copying anything.",
      orders: "By 10 the new orders are in one queue: you confirm, correct the address or reject, and each change is written in the order's history.",
      delivery: "At noon you ship the confirmed orders; each parcel keeps its tracking number and status on the order's own line.",
      risk: "Before you ship, an order from a wilaya or a number that went wrong before is flagged, and you decide.",
      accounting: "In the evening you see what was sold, delivered and returned, in whole dinars.",
      automations: "While you eat, your rules send the reminder or change the status; every automatic message is paced and logged.",
      storefront: "At night a customer opens your store on his phone, picks and orders; the order lands in the same queue.",
      agents: "You ask the assistant for yesterday's late parcels; it proposes the change and waits for your click.",
      team: "Your cousin answers the chats from his own login and sees only the shops you gave him.",
    },
    facts: { "wilayas-69": "69-wilaya screen", "backup-restore-new-pc": "Restore on a new PC" },
  },
};

/** What each module does not do yet: the claim ids whose status is not live. Statuses come from claims.mjs only. */
const NOT_YET = {
  inbox: ["whatsapp"],
  orders: ["shopify", "youcan", "woocommerce", "excel"],
  delivery: ["yalidine", "zr", "ecotrack", "maystro"],
  risk: ["wilayas-69"],
  accounting: ["sheets", "excel"],
  automations: ["whatsapp"],
  storefront: ["storefront", "meta"],
  agents: ["gemini"],
  team: ["backup-restore-new-pc"],
};

function notYet(locale, key) {
  const label = (id) => BRAND_NAMES[id] ?? TEXT[locale].facts[id] ?? id;
  const rows = (NOT_YET[key] ?? [])
    .map((id) => ({ id, status: claimById(id).status }))
    .filter((c) => c.status !== "live")
    .map((c) => `<li data-claim="${c.id}" data-claim-status="${c.status}">${statusBadge(c.status, locale)}<span>${esc(label(c.id))}</span></li>`);
  return rows.length ? `<ul class="nope">${rows.join("")}</ul>` : "";
}

/** Distinct not-live statuses of a module as stamps (product index rows). */
function stampsOf(locale, key) {
  const statuses = new Set((NOT_YET[key] ?? []).map((id) => claimById(id).status).filter((s) => s !== "live"));
  return ["testing", "planned"].filter((s) => statuses.has(s)).map((s) => statusBadge(s, locale)).join("");
}

/* ───────────────────────────── board parts ───────────────────────────── */

const MORE = {
  ar: { how: "كيف يعمل", pains: "ما الذي يعطّلك اليوم", steps: "كيف يساعدك SahelFlow", tiers: "كل شيء مشمول. بلا فئات.", buy: "الشراء يستغرق خمس دقائق.", bridge: "الخطوات" },
  fr: { how: "Comment ça marche", pains: "Ce qui vous freine aujourd'hui", steps: "Comment SahelFlow vous aide", tiers: "Tout est inclus. Pas de formules.", buy: "Acheter prend cinq minutes.", bridge: "Les étapes" },
  en: { how: "How it works", pains: "What gets in your way today", steps: "How SahelFlow helps", tiers: "Everything is included. No tiers.", buy: "Buying takes five minutes.", bridge: "The steps" },
};
const SIZES = "(min-width: 900px) 700px, 100vw";
const meta = (locale, key) => COPY[locale].meta[key];
const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));
const dlHref = (locale) => href(locale, "download");

/** One flat tile. `i` (0..) makes it rise once on load, 50 ms after the one before. */
const tile = (cls, inner, { i, tag = "div", attrs = "" } = {}) =>
  `<${tag} class="it ${cls}${i != null ? " in-rise" : ""}"${i != null ? ` style="--i:${i}"` : ""}${attrs ? ` ${attrs}` : ""}>${inner}</${tag}>`;
const board = (inner, cls = "") => `<section class="ib${cls ? ` ${cls}` : ""}">${inner}</section>`;
const head = (title, lead = "") => `<div class="ih"><h2>${esc(title)}</h2>${lead ? `<p>${esc(lead)}</p>` : ""}</div>`;

/** Column spans that leave no empty cell on a 12-column row: n tiles, three to a row where it divides. */
function spans(n) {
  const base = n % 3 === 0 ? Array(n).fill(4) : n === 1 ? [12] : n === 2 ? [6, 6] : n === 4 ? [6, 6, 6, 6] : n === 5 ? [4, 4, 4, 6, 6] : Array(n).fill(4);
  return base.map((s) => `ic${s}`);
}

function open({ title, lead, actions = "", art = "", crumbs = "", cls = "" }) {
  return `<section class="ib iopen${art ? " has-art" : ""}${cls ? ` ${cls}` : ""}">${tile("icopy", `${crumbs}<h1 class="ih1">${esc(title)}</h1>${lead ? `<p class="ilede">${esc(lead)}</p>` : ""}${actions}`, { i: 0 })}${art}</section>`;
}
const primary = (locale) => {
  const t = COPY[locale];
  return `<div class="iact">${button(dlHref(locale), t.home.hero.primary, { iconName: "download", size: "lg" })}<span class="ifine">${esc(t.home.hero.note(SITE.trialDays))}</span></div>`;
};
function shot(key, locale, label) {
  return tile("ishot", `${screenImg(key, locale, { alt: label, lazy: false, high: true, sizes: SIZES })}<figcaption class="icap">${esc(COPY[locale].common.demoData)}</figcaption>`, { i: 1, tag: "figure" });
}
function close(locale, { title, text } = {}) {
  const t = COPY[locale];
  return board(
    tile(
      "iclose it-acc",
      `<div><h2>${esc(title ?? t.home.final.title)}</h2><p>${esc(text ?? t.home.final.text)}</p></div><div class="iclose-act">${button(dlHref(locale), t.home.hero.primary, { iconName: "download", size: "lg" })}${button(whatsappHref(t.whatsappMessage), t.nav.talk, { iconName: "whatsapp", external: true, size: "lg" })}<p class="ifine">${esc(t.home.hero.note(SITE.trialDays))}</p></div>`,
    ),
    "iend",
  );
}
const noteBoard = (locale) => board(tile("it-2 inote", `${icon("whatsapp")}<p>${esc(COPY[locale].common.whatsappNote)}</p>`));
const faqItems = (items, name, extra = "") =>
  items
    .map(([q, a], i) => `<details class="it iq${i % 2 ? " it-2" : ""} ${extra}" name="${name}"><summary><span>${esc(q)}</span>${icon("plus", "faq-icon")}</summary><div class="iq-a"><p>${esc(a)}</p></div></details>`)
    .join("");
const checks = (items) => `<ul class="ichecks">${items.map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`).join("")}</ul>`;

/** Nine flat marks, one per module: filled shapes only (m1 bronze, m2 ink, m3 the tile's own ink-on-bronze). */
const MARKS = {
  inbox: '<path class="m1" d="M6 8a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H22l-9 8v-8h-3a4 4 0 0 1-4-4z"/><rect class="m3" x="12" y="12" width="24" height="3.5" rx="1.75"/><rect class="m3" x="12" y="20" width="15" height="3.5" rx="1.75"/>',
  orders: '<rect class="m1" x="5" y="7" width="38" height="9" rx="3"/><rect class="m2" x="5" y="20" width="38" height="9" rx="3"/><rect class="m1" x="5" y="33" width="24" height="9" rx="3"/>',
  delivery: '<path class="m1" d="M24 3 43 12v24L24 45 5 36V12z"/><path class="m2" d="M24 3l19 9-19 9L5 12z"/><path class="m3" d="M22 22v22l2 1 2-1V22z" opacity="0"/>',
  risk: '<path class="m1" d="M24 4 45 41H3z"/><rect class="m3" x="22" y="16" width="4" height="13" rx="2"/><circle class="m3" cx="24" cy="34.5" r="2.5"/>',
  automations: '<path class="m1" d="M28 3 9 27h13l-3 18 20-26H26z"/>',
  agents: '<path class="m1" d="M20 4c1.6 9.6 4.4 12.4 14 14-9.6 1.6-12.4 4.4-14 14-1.6-9.6-4.4-12.4-14-14 9.6-1.6 12.4-4.4 14-14z"/><path class="m2" d="M37 28c.8 4.8 2.2 6.2 7 7-4.8.8-6.2 2.2-7 7-.8-4.8-2.2-6.2-7-7 4.8-.8 6.2-2.2 7-7z"/>',
  storefront: '<path class="m1" d="M8 5h32l5 13H3z"/><rect class="m2" x="7" y="22" width="34" height="21" rx="3"/><rect class="m1" x="19" y="29" width="10" height="14" rx="2"/>',
  team: '<circle class="m1" cx="17" cy="15" r="7"/><path class="m1" d="M3 41c0-8 6-13 14-13s14 5 14 13z"/><circle class="m2" cx="34" cy="17" r="6"/><path class="m2" d="M30 30c9 0 15 4 15 11H34c0-5-1.5-8.5-4-11z"/>',
  accounting: '<rect class="m2" x="6" y="26" width="9" height="16" rx="2.5"/><rect class="m1" x="19.5" y="14" width="9" height="28" rx="2.5"/><rect class="m2" x="33" y="5" width="9" height="37" rx="2.5"/>',
};
const mark = (key, cls = "") => `<svg class="imark${cls ? ` ${cls}` : ""}" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">${MARKS[key]}</svg>`;

function modTile(locale, key, i, cls = "ic4") {
  const c = COPY[locale].modules[key];
  const chips = stampsOf(locale, key);
  return tile(
    `ilink ${cls}`,
    `${mark(key)}<div class="ilink-t"><h3>${esc(c.name)}</h3><p>${esc(c.short)}</p>${chips ? `<span class="ichips">${chips}</span>` : ""}</div>${icon("arrow", "flip ilink-go")}`,
    { i, tag: "a", attrs: `href="${href(locale, `product/${key}`)}"` },
  );
}

/** Agents have no screenshot (they need the seller's own Gemini key): a flat flow diagram from the module's own three sections. */
function agentFlow(locale, key) {
  const c = COPY[locale].modules[key];
  return tile("ishot iflow it-2", `${mark("agents", "imark-lg")}<ol class="iflow-steps">${c.sections.map(([k]) => `<li>${esc(k)}</li>`).join(`<li class="iflow-sep" aria-hidden="true">${icon("chevron")}</li>`)}</ol><p class="icap">${esc(c.short)}</p>`, { i: 1 });
}

/* ───────────────────────────── product ───────────────────────────── */

export function productPage(locale) {
  const t = COPY[locale];
  const p = t.productPage;
  const x = TEXT[locale];
  const [title, description] = meta(locale, "product");
  const body = `${open({ title: p.title, lead: p.lead, actions: primary(locale), art: shot("dashboard", locale, `${p.title} — ${t.common.realScreenshot}`) })}
${board(`${head(x.productDays)}${MODULES.map((m, i) => modTile(locale, m.key, i < 3 ? i + 2 : null, "ic4")).join("")}`)}
${board(`${head(p.principlesTitle)}${p.principles.map(([k, v]) => tile("ic3", `<h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${noteBoard(locale)}
${close(locale)}`;
  return shell({ locale, pageId: "product", path: "product", title, description }, body);
}

/* ───────────────────────────── modules: one template ───────────────────────────── */

export function modulePage(locale, key) {
  const t = COPY[locale];
  const m = moduleByKey[key];
  const c = t.modules[key];
  const x = TEXT[locale];
  const y = MORE[locale];
  const index = MODULES.findIndex((e) => e.key === key);
  const related = [1, 2, 3].map((d) => MODULES[(index + d) % MODULES.length].key);
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SahelFlow", item: `${SITE.origin}${href(locale)}` },
      { "@type": "ListItem", position: 2, name: t.nav.product, item: `${SITE.origin}${href(locale, "product")}` },
      { "@type": "ListItem", position: 3, name: c.name, item: `${SITE.origin}${href(locale, `product/${key}`)}` },
    ],
  };
  const nav = `<nav class="icrumbs" aria-label="breadcrumb"><a href="${href(locale, "product")}">${esc(t.nav.product)}</a>${icon("chevron", "crumb-sep")}<span aria-current="page">${esc(c.name)}</span></nav>`;
  const art = m.shot ? shot(m.shot, locale, `${c.name} — ${t.common.realScreenshot}`) : agentFlow(locale, key);
  const nope = notYet(locale, key);
  const body = `${open({ title: c.title, lead: c.lead, actions: primary(locale), art, crumbs: nav })}
${board(`${tile("ic12 it-2 iday", `<h2>${esc(x.dayTitle)}</h2><p class="dayline" data-day>${esc(x.day[key])}</p>`)}${c.points.map((pt, i) => tile(`${spans(c.points.length)[i]}`, `${icon("check", "ibullet")}<p class="ibenefit">${esc(pt)}</p>`)).join("")}`)}
${board(`${head(y.how)}${c.sections.map(([k, v, bullets], i) => tile(`ic12 irow${i % 2 ? " it-2" : ""}`, `<h3>${esc(k)}</h3><div><p>${esc(v)}</p>${checks(bullets)}</div>`)).join("")}`)}
${key === "inbox" ? noteBoard(locale) : ""}
${nope ? board(`${head(x.nopeTitle)}${tile("ic12 it-2", nope)}`) : ""}
${board(`${head(t.common.questions)}${faqItems(c.faq, `faq-${key}`)}`)}
${board(`${head(t.common.related)}${related.map((k) => modTile(locale, k, null, "ic4 ilink-s")).join("")}`)}
${close(locale)}`;
  return shell({ locale, pageId: `module:${key}`, path: `product/${key}`, title: `${c.name} — SahelFlow`, description: c.lead, preload: null, jsonLd: [crumbs, faqJsonLd(c.faq)] }, body);
}

/* ───────────────────────────── solutions ───────────────────────────── */

export function solutionPage(locale, key) {
  const t = COPY[locale];
  const s = t.solutions[key];
  const y = MORE[locale];
  const lead = moduleByKey[s.modules[0]];
  const art = lead.shot ? shot(lead.shot, locale, `${s.name} — ${t.common.realScreenshot}`) : shot("dashboard", locale, `${s.name} — ${t.common.realScreenshot}`);
  const body = `${open({ title: s.title, lead: s.lead, actions: primary(locale), art })}
${board(`${head(y.pains)}${s.pains.map(([k, v], i) => tile(spans(s.pains.length)[i], `<h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${board(`${head(y.steps)}${s.steps.map(([k, v], i) => tile(`ic12 irow${i % 2 ? " it-2" : ""}`, `<h3>${esc(k)}</h3><div><p>${esc(v)}</p></div>`)).join("")}`)}
${s.modules.includes("inbox") ? noteBoard(locale) : ""}
${board(`${head(t.common.allModules)}${s.modules.map((k, i) => modTile(locale, k, null, `${spans(s.modules.length)[i]} ilink-s`)).join("")}`)}
${close(locale)}`;
  return shell({ locale, pageId: `solution:${key}`, path: `solutions/${key}`, title: `${s.name} — SahelFlow`, description: s.lead }, body);
}

/** Not wired yet: build.mjs and model.mjs (ENG) have no "solutions" index page. See SITE-P2-INNER.md for the two-line patch. */
export function solutionsIndexPage(locale) {
  const t = COPY[locale];
  const items = SOLUTIONS.map((e, i) => {
    const s = t.solutions[e.key];
    return tile(`ilink ${spans(SOLUTIONS.length)[i]}`, `${icon(e.icon, "imark-i")}<div class="ilink-t"><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p></div>${icon("arrow", "flip ilink-go")}`, { i: i + 1, tag: "a", attrs: `href="${href(locale, `solutions/${e.key}`)}"` });
  }).join("");
  const body = `${open({ title: t.nav.solutions ?? "Solutions", lead: t.home.final.text, actions: primary(locale) })}
${board(items)}
${close(locale)}`;
  return shell({ locale, pageId: "solutions", path: "solutions", title: `${t.nav.solutions ?? "Solutions"} — SahelFlow`, description: t.home.final.text }, body);
}

/* ───────────────────────────── integrations ───────────────────────────── */

export function integrationsPage(locale) {
  const t = COPY[locale];
  const p = t.integrationsPage;
  const [title, description] = meta(locale, "integrations");
  const groups = INTEGRATIONS.map((g) => {
    const sp = spans(g.items.length);
    const cards = g.items
      .map((k, i) => {
        const status = integrationStatus(k);
        return tile(
          `iint ${sp[i]}`,
          `<div class="iint-h"><span class="ibrand" aria-hidden="true">${esc(BRAND_NAMES[k].replace(/[^A-Za-z]/g, "").slice(0, 2))}</span><h3>${esc(BRAND_NAMES[k])}</h3>${statusBadge(status, locale)}</div><p>${esc(p.items[k])}</p>${k === "whatsapp" ? `<p class="iaside">${esc(t.common.whatsappNote)}</p>` : ""}`,
          { attrs: `id="${k}" data-status="${status}"` },
        );
      })
      .join("");
    return board(`${head(p.groups[g.group])}${cards}`, "igroup");
  }).join("\n");
  const body = `${open({ title: p.title, lead: p.lead, actions: primary(locale) })}
${groups}
${board(tile("ic12 it-2 imore", `${icon("whatsapp")}<a href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(p.missing)}</a>`))}
${close(locale)}`;
  return shell({ locale, pageId: "integrations", path: "integrations", title, description }, body);
}

/* ───────────────────────────── pricing ───────────────────────────── */

const unitOf = (locale) => (locale === "ar" ? "دج" : "DA");
const kindMark = (kind) => `<span class="imk imk-${kind}" aria-hidden="true">${icon(kind === "no" ? "x" : kind === "partial" ? "minus" : "check")}</span>`;

function table({ caption, cols, rows }) {
  return `<div class="it itable ic12"><table class="itbl"><caption class="sr-only">${esc(caption)}</caption><thead><tr><th scope="col"><span class="sr-only">${esc(caption)}</span></th>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(([label, ...cells]) => `<tr><th scope="row">${esc(label)}</th>${cells.map(([text, kind], i) => `<td data-col="${esc(cols[i])}">${kind ? kindMark(kind) : ""}<span>${esc(text)}</span></td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function pricingPage(locale) {
  const t = COPY[locale];
  const p = t.pricingPage;
  const y = MORE[locale];
  const lp = licencePricing(locale);
  const [title, description] = meta(locale, "pricing");
  const amount = lp.amount ?? PACKAGE.priceDzd;
  const licence = tile(
    "iplan iplan-main it-acc",
    `<h2>${esc(p.licence.name)}</h2>${lp.offer ? `<p class="ichip-on">${esc(lp.offer.label)}</p>` : ""}<p class="iprice"><span class="num">${num(amount)}</span><span class="iunit">${unitOf(locale)}</span></p><p class="iper">${esc(p.licence.per)}${lp.offer ? ` · ${esc(lp.offer.then)}` : ""}</p>${checks(p.licence.points(PACKAGE))}<div class="iplan-act">${button(whatsappHref(t.whatsappMessage), p.licence.cta, { iconName: "whatsapp", external: true, size: "lg" })}</div>`,
    { i: 1, attrs: 'id="licence"' },
  );
  const trial = tile(
    "iplan ic5",
    `<h2>${esc(p.trial.name)}</h2><p class="iprice iprice-s"><span class="num">${esc(p.trial.price)}</span></p><p class="iper">${esc(p.trial.per(SITE.trialDays))}</p>${checks(p.trial.points)}<div class="iplan-act">${button(dlHref(locale), p.trial.cta, { kind: "ghost", iconName: "download" })}</div>`,
    { i: 2 },
  );
  const extra = tile(
    "iplan ic5 it-2",
    `<h2>${esc(p.extra.name)}</h2><p class="iprice iprice-s"><span class="num">+${money(PACKAGE.extraShopPriceDzd, locale)}</span></p><p class="iper">${esc(p.extra.per)}</p>${checks(p.extra.points(PACKAGE))}`,
    { i: 3 },
  );
  const body = `${open({ title: p.title, lead: p.lead })}
<section class="ib iplans" id="price" aria-label="${esc(p.licence.name)}">${licence}${trial}${extra}</section>
${board(`${head(y.tiers)}${table({ caption: p.includedTitle, cols: [t.common.included], rows: p.included(PACKAGE).map(([k, v]) => [k, [v, "yes"]]) })}`)}
${board(`${head(p.compareTitle, p.compareLead(PACKAGE.updateYears))}${table({ caption: p.compareTitle, cols: [p.compareSahelName, p.compareSaasName], rows: p.compareRows.map((r, i) => [r, [p.compareSahel[i], "yes"], [p.compareSaas[i], "no"]]) })}`)}
${board(`${head(y.buy)}${p.how.map(([k, v], i) => tile(spans(p.how.length)[i], `<h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${board(`${head(t.common.questions)}${faqItems(p.faq, "pricing-faq")}`)}
${close(locale)}`;
  return shell({ locale, pageId: "pricing", path: "pricing", title, description, jsonLd: [faqJsonLd(p.faq)] }, body);
}

/* ───────────────────────────── why ───────────────────────────── */

export function whyPage(locale) {
  const t = COPY[locale];
  const w = t.why;
  const [title, description] = meta(locale, "why");
  const reasonIcons = ["key", "chart", "lock", "wifiOff"];
  const body = `${open({ title: w.title, lead: w.lead, actions: `<div class="iact">${button(dlHref(locale), w.cta, { iconName: "download", size: "lg" })}<span class="ifine">${esc(t.home.hero.note(SITE.trialDays))}</span></div>` })}
${board(`${head(w.reasonsTitle)}${w.reasons.map(([k, v], i) => tile("ic3", `${icon(reasonIcons[i] ?? "key", "ibullet ibullet-l")}<h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${board(`${head(w.tableTitle, w.tableLead)}${table({ caption: w.tableTitle, cols: [w.columns[0] ?? "", w.columns[1] ?? ""], rows: w.rows.map(([label, a, b]) => [label, a, b]) })}`)}
${board(`${head(w.honestTitle)}${w.honest.map(([k, v], i) => tile(`${spans(w.honest.length)[i]} it-2`, `<p class="ichip-s">${esc(w.honestMark)}</p><h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${close(locale, { title: w.cta })}`;
  return shell({ locale, pageId: "why", path: "why", title, description }, body);
}

/* ───────────────────────────── security ───────────────────────────── */

export function securityPage(locale) {
  const t = COPY[locale];
  const s = t.securityPage;
  const S = SHEETS[locale];
  const y = MORE[locale];
  const [title, description] = meta(locale, "security");
  const fact = (id, [k, v], cls) => {
    const status = claimById(id).status;
    return tile(cls, `${statusBadge(status, locale)}<h3>${esc(k)}</h3><p>${esc(v)}</p>`, { attrs: `data-claim="${id}" data-claim-status="${status}"` });
  };
  const proven = [["local-first", 0], ["pin-roles", 2], ["ai-asks-first", 4], ["data-encrypted", 1], ["updates-verified", 5]];
  const sp = spans(proven.length);
  const body = `${open({ title: s.title, lead: s.lead, actions: primary(locale) })}
${board(`${head(S.secProven)}${proven.map(([id, n], i) => fact(id, s.items[n] ?? ["", ""], sp[i])).join("")}`)}
${board(`${head(S.secPending)}${fact("backup-restore-new-pc", s.items[3] ?? ["", ""], "ic12 it-2")}`)}
${board(`${head(s.flowsTitle, s.flowsLead)}${s.flows.map(([k, v], i) => tile(`ic12 irow${i % 2 ? " it-2" : ""}`, `<h3>${esc(k)}</h3><div><p>${esc(v)}</p></div>`)).join("")}`)}
${board(`${head(t.common.questions)}${faqItems(s.faq, "security-faq")}`)}
${close(locale)}`;
  return shell({ locale, pageId: "security", path: "security", title, description, jsonLd: [faqJsonLd(s.faq)] }, body);
}

/* ───────────────────────────── download ───────────────────────────── */

export function downloadPage(locale) {
  const t = COPY[locale];
  const d = t.downloadPage;
  const S = SHEETS[locale];
  const [title, description] = meta(locale, "download");
  const stepIcons = ["download", "lock", "globe"];
  const unsigned = installerIsSigned() ? "" : `<p class="inotice">${icon("shield")}<span>${esc(d.unsigned)}</span></p>`;
  const card = tile("ishot icard it-2", `${icon("windows", "icard-os")}<h2>${esc(d.meta)}</h2><h3>${esc(d.requirementsTitle)}</h3>${checks(d.requirements)}`, { i: 1 });
  const actions = `<div class="iact">${button(SITE.downloadUrl, d.button, { iconName: "download", size: "lg" })}<span class="ifine">${esc(t.home.hero.note(SITE.trialDays))}</span></div>`;
  const body = `${open({ title: d.title, lead: d.lead, actions, art: card, cls: "idl" })}
${board(`${head(d.stepsTitle)}${d.steps.map(([k, v], i) => tile("ic4 istep", `${icon(stepIcons[i] ?? "check", "ibullet ibullet-l")}<h3>${esc(k)}</h3><p>${esc(v)}</p>`)).join("")}`)}
${board(`${head(S.dlSmartTitle)}${tile("ic8 it-2", `<p>${esc(d.smartscreen)}</p>${unsigned}`)}${tile("ic4", `<p>${esc(d.help)}</p><div class="iplan-act">${button(whatsappHref(t.whatsappMessage), d.helpCta, { kind: "ghost", iconName: "whatsapp", external: true })}</div>`)}`)}`;
  return shell({ locale, pageId: "download", path: "download", title, description }, body);
}

/* ───────────────────────────── help, contact ───────────────────────────── */

export function helpPage(locale) {
  const t = COPY[locale];
  const h = t.helpPage;
  const [title, description] = meta(locale, "help");
  const all = HELP_TOPICS.flatMap((topic) => h.topics[topic.key][2]);
  const search = `<label class="hsearch">${icon("search")}<input type="search" placeholder="${esc(h.search)}" aria-label="${esc(h.search)}" data-help-search></label>`;
  const topics = HELP_TOPICS.map(
    (topic, i) =>
      `<details class="it iq iq-topic${i % 2 ? " it-2" : ""}" id="${topic.key}" data-help-topic><summary><span>${esc(h.topics[topic.key][0])} · ${h.topics[topic.key][2].length}</span>${icon("plus", "faq-icon")}</summary><div class="iq-nest">${h.topics[topic.key][2]
        .map(([q, a]) => `<details class="faq-item inest" name="help-${topic.key}"><summary><span>${esc(q)}</span>${icon("plus", "faq-icon")}</summary><div class="iq-a"><p>${esc(a)}</p></div></details>`)
        .join("")}</div></details>`,
  ).join("");
  const body = `${open({ title: h.title, lead: h.lead, actions: search })}
${noteBoard(locale)}
<div data-help-list>${board(`${topics}`, "itopics")}<p class="ib"><span class="it it-2 ic12 hnone" data-help-empty hidden>${esc(h.noResult)}</span></p></div>
${board(tile("iclose it-acc", `<div><h2>${esc(t.contactPage.title)}</h2><p>${esc(t.contactPage.lead)}</p></div><div class="iclose-act">${button(whatsappHref(t.whatsappMessage), t.nav.talk, { iconName: "whatsapp", external: true, size: "lg" })}</div>`), "iend")}`;
  return shell({ locale, pageId: "help", path: "help", title, description, jsonLd: [faqJsonLd(all)] }, body);
}

export function contactPage(locale) {
  const t = COPY[locale];
  const c = t.contactPage;
  const [title, description] = meta(locale, "contact");
  const card = (cls, [name, text], ic, url, cta, external, i) =>
    tile(`icontact ${cls}`, `${icon(ic, "ibullet ibullet-l")}<h2>${esc(name)}</h2><p>${esc(text)}</p><div class="iplan-act">${button(url, cta, { kind: cls.includes("it-acc") ? "primary" : "ghost", iconName: ic === "mail" ? "mail" : "whatsapp", external, size: "lg" })}</div>`, { i });
  const body = `${open({ title: c.title, lead: c.lead })}
${board(`${card("ic6 it-acc", c.whatsapp, "whatsapp", whatsappHref(t.whatsappMessage), c.write, true, 1)}${card("ic6", c.demo, "sparkle", whatsappHref(c.demoMessage), c.demo[0], true, 2)}${card("ic12 it-2", c.email, "mail", `mailto:${SITE.email}`, SITE.email, false, 3)}`, "icontacts")}`;
  return shell({ locale, pageId: "contact", path: "contact", title, description }, body);
}

/* ───────────────────────────── legal, 404 ───────────────────────────── */

export function legalPage(locale, kind) {
  const t = COPY[locale];
  const sections = (kind === "privacy" ? PRIVACY : TERMS)[locale];
  const heading = kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle;
  const [title, description] = meta(locale, kind);
  const toc = `<nav class="itoc it" aria-label="${esc(t.common.onThisPage)}"><h2>${esc(t.common.onThisPage)}</h2><ul>${sections.map(([h], i) => `<li><a href="#s${i}">${esc(h)}</a></li>`).join("")}</ul></nav>`;
  const text = `<article class="it idoc">${sections.map(([h, p], i) => `<h2 id="s${i}">${esc(h)}</h2><p>${esc(p)}</p>`).join("")}</article>`;
  const body = `${open({ title: heading, lead: `${t.legal.updated}: ${LEGAL_UPDATED}` })}
${board(`${toc}${text}`, "ilegal")}`;
  return shell({ locale, pageId: kind, path: kind, title, description }, body);
}

export function notFoundPage() {
  const locale = SITE.defaultLocale;
  const t = COPY[locale];
  const others = SITE.locales.filter((l) => l !== locale);
  const body = `${open({ title: t.notFound.title, lead: t.notFound.text, cls: "ilost", actions: `<div class="iact">${button(href(locale), t.notFound.back, { iconName: "arrow" })}${others.map((l) => button(href(l), COPY[l].notFound.back, { kind: "ghost", attrs: `lang="${l}" hreflang="${l}"` })).join("")}</div>` })}`;
  return shell({ locale, pageId: "404", path: "", title: `${t.notFound.title} — SahelFlow`, description: t.notFound.text }, body);
}
