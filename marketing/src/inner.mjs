// The inner pages of sahelflow.com built from the Carnet parts: ruled sheets, stamps that come from claims.mjs,
// the red margin only on what needs care. Product, module (one template), solution, integrations, help, contact, legal, 404.
import { claimById, integrationStatus } from "./claims.mjs";
import { SITE } from "./config.mjs";
import { COPY } from "./i18n/index.mjs";
import { shell } from "./layout.mjs";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "./legal.mjs";
import { BRAND_NAMES, HELP_TOPICS, INTEGRATIONS, MODULES, SOLUTIONS } from "./model.mjs";
import { appWindow, button, ctas, esc, faqJsonLd, faqList, href, icon, statusBadge, whatsappHref } from "./ui.mjs";
import { brandTile, finalCta, pageHero, whatsappNote } from "./pages.mjs";

const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));
const meta = (locale, key) => COPY[locale].meta[key];

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

const nn = (i) => `<span class="nn" aria-hidden="true">${i + 1}</span>`;
const sec = (inner, cls = "") => `<section class="sheet-sec${cls ? ` ${cls}` : ""}"><div class="container narrow">${inner}</div></section>`;
const rowLink = (url, i, name, text, stamps = "") =>
  `<li><a class="rowlink" href="${url}">${nn(i)}<div><h3>${esc(name)}</h3>${text ? `<p>${esc(text)}</p>` : ""}${stamps ? `<span class="stamps">${stamps}</span>` : ""}</div>${icon("arrow", "flip")}</a></li>`;
const shotOf = (m) => m.shot ?? "dashboard";

/* ───────────────────────────── product ───────────────────────────── */

export function productPage(locale) {
  const t = COPY[locale];
  const p = t.productPage;
  const x = TEXT[locale];
  const [title, description] = meta(locale, "product");
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "layers", title: p.title, lead: p.lead, actions: ctas(locale), art: appWindow("dashboard", locale, { eager: true, label: `${p.title} — ${t.common.realScreenshot}` }) })}
${sec(`<h2>${esc(x.productDays)}</h2><ul class="ruled nn-list rows">${MODULES.map((m, i) => rowLink(href(locale, `product/${m.key}`), i, t.modules[m.key].name, x.day[m.key], stampsOf(locale, m.key))).join("")}</ul>`)}
${whatsappNote(locale)}
${sec(`<h2>${esc(p.principlesTitle)}</h2><ol class="ruled nn-list">${p.principles.map(([k, v], i) => `<li>${nn(i)}<div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ol>`)}
${finalCta(locale)}`;
  return shell({ locale, pageId: "product", path: "product", title, description }, body);
}

/* ───────────────────────────── modules: one template ───────────────────────────── */

export function modulePage(locale, key) {
  const t = COPY[locale];
  const m = moduleByKey[key];
  const c = t.modules[key];
  const x = TEXT[locale];
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
  const nav = `<nav class="crumbs" aria-label="breadcrumb"><a href="${href(locale, "product")}">${esc(t.nav.product)}</a>${icon("chevron", "crumb-sep")}<span aria-current="page">${esc(c.name)}</span></nav>`;
  const features = c.sections
    .map(([title, text, bullets], i) => `<li>${nn(i)}<div><h3>${esc(title)}</h3><p>${esc(text)}</p><ul class="check-list">${bullets.map((b) => `<li>${icon("check")}<span>${esc(b)}</span></li>`).join("")}</ul></div></li>`)
    .join("");
  const body = `${pageHero({ locale, before: nav, eyebrow: c.name, eyebrowIcon: m.icon, title: c.title, lead: c.lead, actions: ctas(locale), art: appWindow(shotOf(m), locale, { eager: true, label: `${c.name} — ${t.common.realScreenshot}` }) })}
${sec(`<h2>${esc(x.dayTitle)}</h2><p class="dayline" data-day>${esc(x.day[key])}</p>`, "day-sec")}
${sec(`<ol class="ruled nn-list">${features}</ol>`)}
${key === "inbox" ? whatsappNote(locale) : ""}
${sec(`<h2>${esc(x.nopeTitle)}</h2>${notYet(locale, key)}`)}
${sec(`<h2>${esc(t.common.questions)}</h2>${faqList(c.faq, { name: `faq-${key}` })}`)}
${sec(`<h2>${esc(t.common.related)}</h2><ul class="ruled rows">${related.map((k, i) => rowLink(href(locale, `product/${k}`), MODULES.findIndex((e) => e.key === k), t.modules[k].name, "")).join("")}</ul>`)}
${finalCta(locale)}`;
  return shell({ locale, pageId: `module:${key}`, path: `product/${key}`, title: `${c.name} — SahelFlow`, description: c.lead, preload: null, jsonLd: [crumbs, faqJsonLd(c.faq)] }, body);
}

/* ───────────────────────────── solutions ───────────────────────────── */

export function solutionPage(locale, key) {
  const t = COPY[locale];
  const s = t.solutions[key];
  const sol = SOLUTIONS.find((e) => e.key === key);
  const lead = moduleByKey[s.modules[0]];
  const body = `${pageHero({ locale, eyebrow: s.name, eyebrowIcon: sol.icon, title: s.title, lead: s.lead, actions: ctas(locale), art: appWindow(shotOf(lead), locale, { eager: true, label: `${s.name} — ${t.common.realScreenshot}` }) })}
${sec(`<ul class="ruled pains">${s.pains.map(([k, v]) => `<li><span class="nn" aria-hidden="true">${icon("x")}</span><div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ul>`)}
${sec(`<ol class="ruled nn-list">${s.steps.map(([k, v], i) => `<li>${nn(i)}<div><h3>${esc(k)}</h3><p>${esc(v)}</p></div></li>`).join("")}</ol>`)}
${s.modules.includes("inbox") ? whatsappNote(locale) : ""}
${sec(`<h2>${esc(t.common.allModules)}</h2><ul class="ruled rows">${s.modules.map((k) => rowLink(href(locale, `product/${k}`), MODULES.findIndex((e) => e.key === k), t.modules[k].name, "")).join("")}</ul>`)}
${finalCta(locale)}`;
  return shell({ locale, pageId: `solution:${key}`, path: `solutions/${key}`, title: `${s.name} — SahelFlow`, description: s.lead }, body);
}

/* ───────────────────────────── integrations ───────────────────────────── */

export function integrationsPage(locale) {
  const t = COPY[locale];
  const p = t.integrationsPage;
  const [title, description] = meta(locale, "integrations");
  const groups = INTEGRATIONS.map(
    (g) => `<section class="sheet-sec" data-group="${g.group}"><div class="container narrow"><h2>${esc(p.groups[g.group])}</h2><ul class="ruled ints">${g.items
      .map((k) => `<li><article class="int-card" id="${k}" data-status="${integrationStatus(k)}"><header>${brandTile(k)}<h3>${esc(BRAND_NAMES[k])}</h3>${statusBadge(integrationStatus(k), locale)}</header><p>${esc(p.items[k])}</p>${k === "whatsapp" ? `<p class="int-aside">${esc(t.common.whatsappNote)}</p>` : ""}</article></li>`)
      .join("")}</ul></div></section>`,
  ).join("\n");
  const body = `${pageHero({ locale, eyebrow: p.eyebrow, eyebrowIcon: "sheet", title: p.title, lead: p.lead })}
${groups}
${sec(`<p class="more">${icon("whatsapp")}<a href="${whatsappHref(t.whatsappMessage)}" rel="noopener">${esc(p.missing)}</a></p>`)}
${finalCta(locale)}`;
  return shell({ locale, pageId: "integrations", path: "integrations", title, description }, body);
}

/* ───────────────────────────── help, contact ───────────────────────────── */

export function helpPage(locale) {
  const t = COPY[locale];
  const h = t.helpPage;
  const [title, description] = meta(locale, "help");
  const all = HELP_TOPICS.flatMap((topic) => h.topics[topic.key][2]);
  const search = `<label class="hsearch">${icon("search")}<input type="search" placeholder="${esc(h.search)}" aria-label="${esc(h.search)}" data-help-search></label>`;
  const body = `${pageHero({ locale, eyebrow: h.eyebrow, eyebrowIcon: "help", title: h.title, lead: h.lead, actions: search })}
${whatsappNote(locale)}
<div data-help-list>
<div class="sheet-sec"><div class="container narrow faq">${HELP_TOPICS.map((topic) => `<details class="faq-item htopic" id="${topic.key}" data-help-topic><summary><span>${esc(h.topics[topic.key][0])} · ${h.topics[topic.key][2].length}</span>${icon("plus", "faq-icon")}</summary><div class="faq-answer">${faqList(h.topics[topic.key][2], { name: `help-${topic.key}` })}</div></details>`).join("")}</div></div>
<p class="hnone container narrow" data-help-empty hidden>${esc(h.noResult)}</p>
</div>
${sec(`<h2>${esc(t.contactPage.title)}</h2><div class="cta">${button(whatsappHref(t.whatsappMessage), t.nav.talk, { kind: "glass", iconName: "whatsapp", external: true })}</div>`)}`;
  return shell({ locale, pageId: "help", path: "help", title, description, jsonLd: [faqJsonLd(all)] }, body);
}

export function contactPage(locale) {
  const t = COPY[locale];
  const c = t.contactPage;
  const [title, description] = meta(locale, "contact");
  const row = ([name, text], ic, url, cta, external) => `<li><span class="nn" aria-hidden="true">${icon(ic)}</span><div><h3>${esc(name)}</h3><p>${esc(text)}</p>${button(url, cta, { kind: "ghost", iconName: ic === "mail" ? "mail" : "whatsapp", external })}</div></li>`;
  const body = `${pageHero({ locale, eyebrow: c.eyebrow, eyebrowIcon: "message", title: c.title, lead: c.lead })}
${sec(`<ul class="ruled nn-list">${row(c.whatsapp, "whatsapp", whatsappHref(t.whatsappMessage), c.write, true)}${row(c.demo, "sparkle", whatsappHref(c.demoMessage), c.demo[0], true)}${row(c.email, "mail", `mailto:${SITE.email}`, SITE.email, false)}</ul>`)}`;
  return shell({ locale, pageId: "contact", path: "contact", title, description }, body);
}

/* ───────────────────────────── legal, 404 ───────────────────────────── */

export function legalPage(locale, kind) {
  const t = COPY[locale];
  const sections = (kind === "privacy" ? PRIVACY : TERMS)[locale];
  const heading = kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle;
  const [title, description] = meta(locale, kind);
  const body = `${pageHero({ locale, title: heading, lead: `${t.legal.updated}: ${LEGAL_UPDATED}` })}
${sec(`<div class="legal-text">${sections.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join("")}</div>`)}`;
  return shell({ locale, pageId: kind, path: kind, title, description }, body);
}

export function notFoundPage() {
  const locale = SITE.defaultLocale;
  const t = COPY[locale];
  const others = SITE.locales.filter((l) => l !== locale);
  const body = `<section class="sheet-head lost"><div class="container narrow">
  <p class="eyebrow"><span class="stamp st-planned">404</span></p>
  <h1 class="page-title">${esc(t.notFound.title)}</h1>
  <p class="page-lead">${esc(t.notFound.text)}</p>
  <div class="cta">${button(href(locale), t.notFound.back, { iconName: "arrow" })}${others.map((l) => button(href(l), COPY[l].notFound.back, { kind: "ghost", attrs: `lang="${l}" hreflang="${l}"` })).join("")}</div>
</div></section>`;
  return shell({ locale, pageId: "404", path: "", title: `${t.notFound.title} — SahelFlow`, description: t.notFound.text }, body);
}
