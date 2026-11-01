// The home page, v3: "the sentence is the layout".
// One short sentence at poster scale, with a live piece of the product where a word would be (the WhatsApp message),
// then the same grammar at smaller scale: a statement and its proof. Colour changes by chapter, as flat fields.
// Every claim comes from claims.mjs / model.mjs / the vetted copy files; the words below are only the new connective copy.
import { COPY } from "./i18n/index.mjs";
import { integrationStatus } from "./claims.mjs";
import { BRAND_NAMES, INTEGRATIONS, PACKAGE } from "./model.mjs";
import { SITE } from "./config.mjs";
import { fmtMoney, readOrder } from "./orderparse.mjs";
import { esc, faqJsonLd, href, icon, licencePricing, money, phoneDisplay, screenImg, statusBadge, whatsappHref } from "./ui.mjs";

const C = {
  ar: {
    hero: {
      w1: "من", slot: "واتساب", w2: "حتى", w3: "الدينار",
      lead: "SahelFlow تطبيق على حاسوبك: رسالة الزبون تصبح طلبية، وتعرف بمن تتصل قبل أن تشحن، وترى ما حصّلته كل شركة توصيل وما بقي لك عندها.",
      facts: ["تجربة مجانية 7 أيام", "دفعة واحدة، بلا اشتراك", "بياناتك تبقى على حاسوبك"],
      chat: { name: "أمين ب.", text: "سلام، نحب 2 قميص أبيض M. وهران، 0550 00 00 00", time: "10:42", chip: "طلبية جديدة" },
    },
    how: {
      h2: "من الرسالة إلى المال في أربع خطوات",
      names: ["الرسالة", "الطلبية", "الطرد", "المال"],
      steps: [
        ["تصلك الرسالة", "يكتب الزبون على واتساب بكلماته. تختار الرسالة ويصوغ SahelFlow الطلبية لتراجعها."],
        ["تتحول إلى طلبية", "الاسم والهاتف والولاية والمنتجات في بطاقة واحدة. تراجعها قبل أن تنتقل إلى الخطوة التالية."],
        ["تتصل أولاً ثم تشحن", "طابور التأكيد يرتّب بمن تتصل أولاً. بعد التأكيد تُنشئ الطرد لشركة التوصيل (الربط مع الشركات قيد الاختبار)."],
        ["يعود المال إليك", "ترى ما حصّلته كل شركة توصيل وما بقي لك عندها، وربحك بعد رسوم التوصيل والمرتجعات."],
      ],
      slider: "الخطوة",
      sample: "بيانات تجريبية: متجر نموذجي، لا حساب حقيقي",
    },
    card: {
      order: "طلبية", status: { new: "جديدة", call: "اتصل أولاً", ok: "مؤكدة" },
      f: { product: "المنتج", phone: "هاتف الزبون", wilaya: "الولاية", goods: "البضاعة", delivery: "التوصيل", total: "المبلغ عند الاستلام" },
      miss: { product: "أضف منتجاً", wilaya: "اسأل عن الولاية", phone: "الهاتف ناقص" },
      queue: "طابور التأكيد", reason: "أول طلبية من هذا الرقم", parcel: "الطرد", door: "إلى الباب", collect: "عند الاستلام",
      delivered: "تم التسليم", owes: "عليها لك", courier: "Yalidine",
      people: ["أمين ب.", "سارة م.", "كريم ل."], towns: ["وهران", "قسنطينة", "الجزائر"], more: ["سطيف"],
    },
    type: {
      h2: "اكتب كما يكتب زبونك",
      label: "رسالة الزبون",
      try: "جرّب:",
      examples: ["نحب حذاء 42 أسود، سطيف، 0661 00 00 00", "ثلاث شنطات زرقاء، الجزائر 0770 00 00 00", "قميصين أبيض L، قسنطينة 0550 00 00 00"],
      note: "هذا عرض فقط: الصفحة تقرأ جملتك بقواعد بسيطة وبمتجر تجريبي. في التطبيق تراجع كل طلبية قبل أن تُشحن.",
    },
    feat: {
      h2: "خمس مهام، نافذة واحدة",
      rows: {
        inbox: "الرسائل تصبح طلبيات",
        orders: "اعرف بمن تتصل أولاً",
        risk: "شاهد الخسارة قبل أن تشحن",
        delivery: "الطرود من داخل التطبيق",
        accounting: "اعرف ما لك عند كل شركة توصيل",
      },
    },
    proof: { all: "نختبر الربط مع", some: "الربط مع", note: "على كل ربط بطاقته: متاح، أو قيد الاختبار، أو قيد التخطيط.", link: "كل التكاملات" },
    price: { a: "ادفع مرة واحدة:", b: "وهو لك.", offer: (P) => `عرض الإطلاق لأول ${P.seats} تاجراً، ثم ${P.regular}. يشمل ${P.shops} متاجر و${P.team} أعضاء فريق وخمس سنوات من التحديثات، بعد تجربة مجانية لمدة ${P.trial} أيام.`, plain: (P) => `يشمل ${P.shops} متاجر و${P.team} أعضاء فريق وخمس سنوات من التحديثات، بعد تجربة مجانية لمدة ${P.trial} أيام.`, more: "كل ما يشمله الترخيص" },
    faq: { h2: "أسئلة قبل أن تبدأ", wa: "هل ربط واتساب رسمي؟", data: null },
    cta: { pre: "اسم متجري", ph: "اكتبه هنا", post: "، هيا", btn: "نبدأ", after: "يفتح هذا واتساب برسالتك، ونردّ عليك هناك.", msg: (s) => `السلام عليكم، اسم متجري ${s} وأريد بدء التجربة المجانية لـ SahelFlow.` },
    foot: { a: "ثبّته اليوم،", b: "جرّبه سبعة أيام مجاناً.", meta: "Windows 10 و 11", contact: "تواصل معنا" },
  },
  fr: {
    hero: {
      w1: "De", slot: "WhatsApp", w2: "au", w3: "dinar",
      lead: "SahelFlow est une application pour votre PC Windows : le message du client devient une commande, vous savez qui appeler avant d'expédier, et vous voyez ce que chaque livreur a encaissé et vous doit encore.",
      facts: ["7 jours d'essai gratuit", "Un seul paiement, sans abonnement", "Vos données restent sur votre PC"],
      chat: { name: "Amine B.", text: "Salam, je veux 2 chemises blanches M. Oran, 0550 00 00 00", time: "10:42", chip: "Nouvelle commande" },
    },
    how: {
      h2: "Du message à l'argent, en quatre étapes",
      names: ["Message", "Commande", "Colis", "Argent"],
      steps: [
        ["Le message arrive.", "Un client écrit sur WhatsApp avec ses mots. Vous choisissez le message et SahelFlow prépare la commande, que vous vérifiez."],
        ["Il devient une commande.", "Nom, téléphone, wilaya et produits arrivent dans une seule fiche. Vous la vérifiez avant de passer à la suite."],
        ["Vous appelez, puis vous expédiez.", "La file de confirmation classe qui appeler d'abord. Une fois confirmée, vous créez le colis pour votre livreur (les connexions livreurs sont en test)."],
        ["L'argent revient.", "Voyez ce que chaque livreur a encaissé et ce qui doit encore vous parvenir, et votre bénéfice après frais de livraison et retours."],
      ],
      slider: "Étape",
      sample: "Données de démonstration : boutique modèle, aucun compte réel",
    },
    card: {
      order: "Commande", status: { new: "Nouvelle", call: "À appeler", ok: "Confirmée" },
      f: { product: "Produit", phone: "Téléphone du client", wilaya: "Wilaya", goods: "Marchandise", delivery: "Livraison", total: "À encaisser" },
      miss: { product: "Ajoutez un produit", wilaya: "Demandez la wilaya", phone: "Téléphone manquant" },
      queue: "File de confirmation", reason: "Première commande de ce numéro", parcel: "Colis", door: "à domicile", collect: "à encaisser",
      delivered: "Livrée", owes: "vous doit", courier: "Yalidine",
      people: ["Amine B.", "Sara M.", "Karim L."], towns: ["Oran", "Constantine", "Alger"], more: ["Sétif"],
    },
    type: {
      h2: "Écrivez comme votre client.",
      label: "Message du client",
      try: "Essayez :",
      examples: ["Je veux des baskets noires 42, Sétif, 0661 00 00 00", "3 sacs bleus, Alger 0770 00 00 00", "2 chemises blanches L, Constantine 0550 00 00 00"],
      note: "Une démonstration : cette page lit votre phrase avec quelques règles simples et une boutique modèle. Dans l'application, vous vérifiez chaque commande avant qu'elle parte.",
    },
    feat: {
      h2: "Cinq tâches, une fenêtre.",
      rows: {
        inbox: "Les messages deviennent des commandes",
        orders: "Sachez qui appeler d'abord",
        risk: "Voyez la perte avant d'expédier",
        delivery: "Les colis depuis l'appli",
        accounting: "Sachez ce que chaque livreur vous doit",
      },
    },
    proof: { all: "Nous testons les connexions avec", some: "Connexions avec", note: "Chaque connexion porte son étiquette : disponible, en test ou prévue.", link: "Toutes les intégrations" },
    price: { a: "Payez une fois :", b: "c'est à vous.", offer: (P) => `Offre de lancement pour les ${P.seats} premiers vendeurs, puis ${P.regular}. Comprend ${P.shops} boutiques, ${P.team} membres d'équipe et cinq ans de mises à jour, après ${P.trial} jours d'essai gratuit.`, plain: (P) => `Comprend ${P.shops} boutiques, ${P.team} membres d'équipe et cinq ans de mises à jour, après ${P.trial} jours d'essai gratuit.`, more: "Tout ce que comprend la licence" },
    faq: { h2: "Des questions avant de commencer.", wa: "La connexion WhatsApp est-elle officielle ?" },
    cta: { pre: "Ma boutique s'appelle", ph: "son nom", post: ", on", btn: "démarre", after: "Cela ouvre WhatsApp avec votre message, et nous vous répondons là-bas.", msg: (s) => `Bonjour, ma boutique s'appelle ${s} et je voudrais commencer l'essai gratuit de SahelFlow.` },
    foot: { a: "Installez-le aujourd'hui,", b: "essayez-le sept jours gratuitement.", meta: "Windows 10 et 11", contact: "Nous contacter" },
  },
  en: {
    hero: {
      w1: "From", slot: "WhatsApp", w2: "to", w3: "the dinar",
      lead: "SahelFlow is a Windows app: a customer's message becomes an order, you know who to call before you ship, and you see what each courier collected and still owes you.",
      facts: ["Free for 7 days", "One payment, no subscription", "Your data stays on your PC"],
      chat: { name: "Amine B.", text: "Hi, I want 2 white shirts, size M. Oran, 0550 00 00 00", time: "10:42", chip: "New order" },
    },
    how: {
      h2: "Message to money, in four steps",
      names: ["Message", "Order", "Parcel", "Cash"],
      steps: [
        ["The message arrives.", "A customer writes on WhatsApp in their own words. You pick the message and SahelFlow drafts the order for you to review."],
        ["It becomes an order.", "Name, phone, wilaya and products land in one card. You check it before it moves on."],
        ["You call, then you ship.", "The confirmation queue ranks who to call first. Once confirmed, you create the parcel for your courier (courier connections are in testing)."],
        ["The cash comes back.", "See what each courier collected and what still reaches you, and your profit after delivery fees and returns."],
      ],
      slider: "Step",
      sample: "Sample data: a model shop, no real account",
    },
    card: {
      order: "Order", status: { new: "New", call: "Call first", ok: "Confirmed" },
      f: { product: "Product", phone: "Customer phone", wilaya: "Wilaya", goods: "Goods", delivery: "Delivery", total: "To collect" },
      miss: { product: "Add a product", wilaya: "Ask for the wilaya", phone: "Phone missing" },
      queue: "Confirmation queue", reason: "First order from this number", parcel: "Parcel", door: "to the door", collect: "to collect",
      delivered: "Delivered", owes: "owes you", courier: "Yalidine",
      people: ["Amine B.", "Sara M.", "Karim L."], towns: ["Oran", "Constantine", "Algiers"], more: ["Sétif"],
    },
    type: {
      h2: "Write it like your customer does.",
      label: "Customer message",
      try: "Try:",
      examples: ["I want black sneakers size 42, Sétif, 0661 00 00 00", "3 blue bags, Algiers 0770 00 00 00", "2 white shirts L, Constantine 0550 00 00 00"],
      note: "A demonstration: this page reads your sentence with a few plain rules and a model shop. In the app, you review every order before it ships.",
    },
    feat: {
      h2: "Five jobs, one window.",
      rows: {
        inbox: "Messages become orders",
        orders: "Know who to call first",
        risk: "See the loss before you ship",
        delivery: "Parcels from inside the app",
        accounting: "Know what each courier owes you",
      },
    },
    proof: { all: "We are testing connections with", some: "Connections with", note: "Every connection carries its label: available, in testing or planned.", link: "All integrations" },
    price: { a: "Pay once:", b: "it is yours.", offer: (P) => `Launch offer for the first ${P.seats} sellers, then ${P.regular}. Includes ${P.shops} shops, ${P.team} team members and five years of updates, after a ${P.trial}-day free trial.`, plain: (P) => `Includes ${P.shops} shops, ${P.team} team members and five years of updates, after a ${P.trial}-day free trial.`, more: "Everything the licence includes" },
    faq: { h2: "Questions before you start.", wa: "Is the WhatsApp connection official?" },
    cta: { pre: "My shop is", ph: "its name", post: ", let's", btn: "start", after: "This opens WhatsApp with your message, and we answer you there.", msg: (s) => `Hi, my shop is ${s} and I'd like to start the SahelFlow free trial.` },
    foot: { a: "Install it today,", b: "try it free for seven days.", meta: "Windows 10 and 11", contact: "Contact us" },
  },
};

const FEATURE_ORDER = [
  ["inbox", "inbox"],
  ["orders", "queue"],
  ["risk", "risk"],
  ["delivery", "delivery"],
  ["accounting", "analytics"],
];
/** How wide each margin picture is, as a share of its column. Deliberately unequal. */
const PIC_WIDTH = [100, 84, 92, 80, 88];

const NB = "\u00a0";

/* ───────────── fragments of the product (built in HTML from sample data; each root carries data-ui) ───────────── */

export function orderCard(c, data, { state = "call", id = "1042", live = false } = {}) {
  const k = c.card;
  const r = data;
  const productLine = r.product ? [`${r.qty} ×`, r.product.label, r.color?.label, r.size ? `· ${r.size}` : ""].filter(Boolean).join(" ") : "";
  const missing = (key) => `<span class="v-miss">${esc(k.miss[key])}</span>`;
  const wilayaLine = r.wilaya ? `${r.wilaya.code} · ${r.wilaya.name}` : "";
  return `<article class="v-card" data-ui${live ? " data-card" : ""} data-miss-product="${esc(k.miss.product)}" data-miss-wilaya="${esc(k.miss.wilaya)}" data-miss-phone="${esc(k.miss.phone)}" data-curr="${esc(NB + (c.lang === "ar" ? "دج" : "DA"))}">
  <header class="v-card-h"><h3><span class="num">#${id}</span> ${esc(k.order)}</h3><span class="v-stamp v-stamp-${state}" data-f="status">${esc(k.status[state])}</span></header>
  <dl class="v-card-l">
    <div><dt>${esc(k.f.product)}</dt><dd data-f="product">${productLine ? esc(productLine) : missing("product")}</dd></div>
    <div><dt>${esc(k.f.phone)}</dt><dd class="num" data-f="phone">${r.phone ? esc(r.phone) : missing("phone")}</dd></div>
    <div><dt>${esc(k.f.wilaya)}</dt><dd data-f="wilaya">${wilayaLine ? esc(wilayaLine) : missing("wilaya")}</dd></div>
    <div><dt>${esc(k.f.goods)}</dt><dd data-f="goods">${r.goods != null ? esc(fmtMoney(r.goods, c.lang)) : "–"}</dd></div>
    <div><dt>${esc(k.f.delivery)}</dt><dd data-f="delivery">${r.delivery != null ? esc(fmtMoney(r.delivery, c.lang)) : "–"}</dd></div>
    <div class="v-card-t"><dt>${esc(k.f.total)}</dt><dd data-f="total">${r.total != null ? esc(fmtMoney(r.total, c.lang)) : "–"}</dd></div>
  </dl>
</article>`;
}

function stageFragments(c, locale) {
  const k = c.card;
  const first = readOrder(c.hero.chat.text, locale);
  const m = (n) => esc(fmtMoney(n, locale));
  const chat = `<div class="v-frag v-frag-chat" data-ui>
  <p class="v-chat-who"><i class="v-dot" aria-hidden="true"></i>${esc(c.hero.chat.name)}</p>
  <p class="v-bubble"><span>${esc(c.hero.chat.text)}</span><small class="num">${esc(c.hero.chat.time)}</small></p>
</div>`;
  const order = `<div class="v-frag" data-ui>${orderCard(c, first, { state: "new" })}</div>`;
  const queue = `<div class="v-frag" data-ui>
  <section class="v-q" aria-label="${esc(k.queue)}">
    <h3>${esc(k.queue)}</h3>
    <ul>
      <li class="v-q-hot"><div><b><span class="num">#1042</span> ${esc(k.people[0])} · ${esc(k.towns[0])}</b><span>${esc(k.reason)}</span></div><span class="v-stamp v-stamp-call">${esc(k.status.call)}</span></li>
      <li><div><b><span class="num">#1041</span> ${esc(k.people[1])} · ${esc(k.towns[1])}</b></div><span class="v-stamp v-stamp-ok">${esc(k.status.ok)}</span></li>
    </ul>
    <p class="v-q-parcel"><b>${esc(k.parcel)}</b> ${esc(k.courier)} · ${esc(k.door)} · <span>${m(first.total)}</span> ${esc(k.collect)}</p>
  </section>
</div>`;
  const rows = [["1042", k.towns[0], 5400], ["1039", k.more[0], 4200], ["1037", k.towns[2], 3200]];
  const total = rows.reduce((s, r) => s + r[2], 0);
  const cash = `<div class="v-frag" data-ui>
  <section class="v-q" aria-label="${esc(k.courier)}">
    <h3>${esc(k.courier)}</h3>
    <ul class="v-bal">
      ${rows.map(([id, town, amt]) => `<li><span><b class="num">#${id}</b> ${esc(town)} · ${esc(k.delivered)}</span><span>${m(amt)}</span></li>`).join("\n      ")}
    </ul>
    <p class="v-bal-t"><span>${esc(k.courier)} ${esc(k.owes)}</span><b>${m(total)}</b></p>
  </section>
</div>`;
  return [chat, order, queue, cash];
}

/* ───────────── sections ───────────── */

function heroSection(c, t, locale) {
  const h = c.hero;
  const chat = h.chat;
  return `<section class="v-hero" aria-labelledby="h-hero">
<div class="v-hero-top" data-tone="bone">
<h1 id="h-hero" class="v-sentence">
<span class="v-line"><span class="v-w v-up" style="--i:0">${esc(h.w1)}</span><span class="v-slot v-up" style="--i:1" role="img" aria-label="${esc(h.slot)}" data-chat data-chip="${esc(chat.chip)}"><span class="v-chat" data-ui aria-hidden="true"><span class="v-chat-bar"><i class="v-dot"></i>${esc(chat.name)}</span><span class="v-bubble"><span class="v-typed" data-typed data-text="${esc(chat.text)}">${esc(chat.text)}</span><small class="num">${esc(chat.time)}</small></span><span class="v-chip" data-hero-chip>${esc(chat.chip)}</span></span></span><span class="v-w v-up" style="--i:2">${esc(h.w2)}</span></span>
<span class="v-line"><span class="v-w v-up" style="--i:3">${esc(h.w3)}</span></span>
</h1>
<div class="v-intro">
<p class="v-lead v-r" style="--i:0">${esc(h.lead)}</p>
<div class="v-actions v-r" style="--i:1">
<a class="v-btn" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.home.hero.primary)}</span></a>
<a class="v-text" href="${esc(whatsappHref(t.whatsappMessage))}" rel="noopener">${esc(t.home.hero.secondary)}</a>
</div>
</div>
</div>
<div class="v-hero-low" data-tone="green">
<ul class="v-facts v-r" style="--i:2">${h.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
</div>
</section>`;
}

function howSection(c, locale) {
  const H = c.how;
  const frags = stageFragments(c, locale);
  const on = (i) => (i === 0 ? ' data-on=""' : "");
  return `<section class="v-how" aria-labelledby="h-how" data-how>
<div class="v-how-main">
<div class="v-how-l" data-tone="green">
<h2 id="h-how" class="v-h2 v-r">${esc(H.h2)}</h2>
<div class="v-stack v-how-texts" data-how-texts aria-live="off">
${H.steps.map(([title, text], i) => `<div class="v-st-t"${on(i)}><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`).join("\n")}
</div>
</div>
<div class="v-how-r" data-tone="surface">
<div class="v-stack v-how-frags">
${frags.map((f, i) => `<div class="v-st-f"${on(i)}>${f}</div>`).join("\n")}
</div>
<p class="v-sample">${esc(H.sample)}</p>
</div>
</div>
<div class="v-how-ctl" data-tone="bone">
<div class="v-range-wrap" style="--t:0">
<div class="v-track" aria-hidden="true"><i></i></div>
<input class="v-range" type="range" min="0" max="3" step="1" value="0" aria-label="${esc(H.slider)}" aria-valuetext="${esc(H.names[0])}" data-range>
</div>
<ol class="v-names">${H.names.map((n, i) => `<li><button type="button" data-go="${i}"${i === 0 ? ' aria-current="step"' : ""}>${esc(n)}</button></li>`).join("")}</ol>
</div>
</section>`;
}

function typeSection(c, locale) {
  const T = c.type;
  const first = readOrder(c.hero.chat.text, locale);
  return `<section class="v-type" aria-labelledby="h-type" data-tone="bone" data-type data-locale="${locale}">
<h2 id="h-type" class="v-h3 v-r">${esc(T.h2)}</h2>
<div class="v-input-row v-r" style="--i:1"><input class="v-big-input" id="msg" type="text" value="${esc(c.hero.chat.text)}" autocomplete="off" spellcheck="false" aria-labelledby="h-type" data-msg></div>
<div class="v-type-out v-r" style="--i:2">
${orderCard(c, first, { state: "call", live: true })}
<div class="v-type-side">
<p class="v-try"><span>${esc(T.try)}</span></p>
<ul class="v-ex">${T.examples.map((e) => `<li><button type="button" data-ex="${esc(e)}">${esc(e)}</button></li>`).join("")}</ul>
<p class="v-note">${esc(T.note)}</p>
</div>
</div>
</section>`;
}

function featSection(c, t, locale) {
  const rows = FEATURE_ORDER.map(([key, shot], i) => {
    const mod = t.modules[key];
    const w = PIC_WIDTH[i];
    return `<article class="v-row" style="--w:${w}%">
<div class="v-row-t v-r">
<h3>${esc(c.feat.rows[key])}</h3>
<p>${esc(mod.lead)}</p>
${key === "delivery" ? `<p class="v-badges">${statusBadge("testing", locale)}</p>` : ""}
<a class="v-text" href="${href(locale, `product/${key}`)}">${esc(t.common.seeModule)}${icon("arrow", "flip")}</a>
</div>
<figure class="v-pic v-r" style="--i:1">
<span class="v-frame">${screenImg(shot, locale, { alt: t.common.realScreenshot, sizes: "(min-width: 900px) 46vw, 92vw" })}</span>
<figcaption>${esc(t.common.demoData)}</figcaption>
</figure>
</article>`;
  }).join("\n");
  return `<section class="v-feat" aria-labelledby="h-feat" data-tone="sage">
<h2 id="h-feat" class="v-h2 v-r">${esc(c.feat.h2)}</h2>
<div class="v-rows">
${rows}
</div>
</section>`;
}

function proofSection(c, t, locale) {
  const names = INTEGRATIONS.flatMap((g) => g.items).filter((k) => k !== "storefront");
  const allTesting = names.every((k) => integrationStatus(k) === "testing");
  const list = names.map((k) => `<span class="v-n" dir="ltr">${esc(BRAND_NAMES[k])}</span>`).join(`<span class="v-sep">${locale === "ar" ? "،" : ","} </span>`);
  return `<section class="v-proof" aria-labelledby="h-proof" data-tone="bone" data-cycle>
<div class="v-proof-s v-r"><h2 id="h-proof" class="v-proof-h">${esc(allTesting ? c.proof.all : c.proof.some)}</h2> ${list}.</div>
<p class="v-proof-note v-r" style="--i:1">${esc(c.proof.note)} <a class="v-text" href="${href(locale, "integrations")}">${esc(c.proof.link)}${icon("arrow", "flip")}</a></p>
</section>`;
}

function priceSection(c, t, locale) {
  const p = licencePricing(locale);
  const P = {
    seats: PACKAGE.launchOfferSeats,
    regular: money(PACKAGE.priceDzd, locale),
    shops: PACKAGE.includedShops,
    team: PACKAGE.teamMembers,
    trial: PACKAGE.trialDays,
  };
  const amount = p.amount;
  const unit = locale === "ar" ? "دج" : "DA";
  const priceHtml = p.ask
    ? `<span class="v-price">${esc(p.price)}</span>`
    : `<span class="v-price"><span class="num" data-count-to="${amount}">${esc(new Intl.NumberFormat("fr-FR").format(amount).replace(/[\u202f\u00a0\s]/g, NB))}</span>${NB}${unit}</span>`;
  const support = p.offer ? c.price.offer(P) : c.price.plain(P);
  return `<section class="v-price-s" aria-labelledby="h-price" data-tone="green">
<h2 id="h-price" class="v-sentence-m v-r"><span>${esc(c.price.a)}</span> ${priceHtml} <span>${esc(c.price.b)}</span></h2>
<div class="v-price-row v-r" style="--i:1">
<p class="v-price-sup">${esc(support)}</p>
<div class="v-price-act">
<a class="v-btn v-btn-on" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.home.hero.primary)}</span></a>
<a class="v-text" href="${href(locale, "pricing")}">${esc(c.price.more)}${icon("arrow", "flip")}</a>
</div>
</div>
</section>`;
}

export function homeFaq(locale) {
  const t = COPY[locale];
  const c = C[locale];
  const items = [[c.faq.wa, t.common.whatsappNote], t.securityPage.faq[0], ...t.pricingPage.faq.slice(1)];
  return items;
}

function faqSection(c, locale) {
  const items = homeFaq(locale);
  return `<section class="v-faq" aria-labelledby="h-faq" data-tone="bone">
<h2 id="h-faq" class="v-h3 v-r">${esc(c.faq.h2)}</h2>
<div class="v-faq-rows">
${items.map(([q, a], i) => `<div class="v-qa v-r" style="--i:${Math.min(i, 3)}"><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join("\n")}
</div>
</section>`;
}

function ctaSection(c, t, locale) {
  const k = c.cta;
  return `<section class="v-cta" aria-labelledby="h-cta" data-tone="sage">
<form class="v-cta-form v-r" action="#" data-wa="${esc(SITE.whatsapp)}" data-wa-msg="${esc(k.msg("{shop}"))}">
<h2 id="h-cta" class="v-sentence-m v-cta-s"><label for="shop">${esc(k.pre)}</label> <input class="v-cta-in" id="shop" name="shop" type="text" placeholder="${esc(k.ph)}" autocomplete="organization" maxlength="60"> <span>${esc(k.post)}</span> <a class="v-btn v-btn-act" href="${esc(whatsappHref(t.whatsappMessage))}" rel="noopener" data-wa-go>${esc(k.btn)}</a></h2>
</form>
<p class="v-cta-after v-r" style="--i:1">${esc(k.after)}</p>
</section>`;
}

/** The home page body (the shell, header and footer are added by layout.mjs). */
export function homeBody3(locale) {
  const c = { ...C[locale], lang: locale };
  const t = COPY[locale];
  return `${heroSection(c, t, locale)}
${howSection(c, locale)}
${typeSection(c, locale)}
${featSection(c, t, locale)}
${proofSection(c, t, locale)}
${priceSection(c, t, locale)}
${faqSection(c, locale)}
${ctaSection(c, t, locale)}`;
}

export { C as HOME3_COPY, faqJsonLd };
