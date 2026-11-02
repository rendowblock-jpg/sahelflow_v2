// The home page, v4 "Signal": dark, luminous, in motion.
// A 3D isometric lane that carries one order (message > order > parcel > cash), a pinned story over the real screens,
// five jobs as a lit grid, a live order reader, one price, and a closing sentence with a blank in it.
// Facts come from claims.mjs / model.mjs / config.mjs and the vetted copy in home3.mjs; only the connective words are new here.
import { COPY } from "./i18n/index.mjs";
import { integrationStatus, statusLabel } from "./claims.mjs";
import { BRAND_NAMES, INTEGRATIONS, PACKAGE } from "./model.mjs";
import { SITE } from "./config.mjs";
import { fmtMoney, readOrder } from "./orderparse.mjs";
import { HOME3_COPY as V, homeFaq, orderCard } from "./home3.mjs";
import { ARRIVE, TAGS, heroScene } from "./scene4.mjs";
import { esc, href, icon, licencePricing, money, screenImg, shotUrl, statusBadge, whatsappHref } from "./ui.mjs";
import { brandTile } from "./brandmark.mjs";
import { BRAND_MARKS } from "./brands.mjs";

const NB = "\u00a0";

const N = {
  ar: {
    zoom: "كبّر", close: "إغلاق",
    motion: { pause: "إيقاف الحركة مؤقتاً", play: "تشغيل الحركة", tCalm: "جهازك يطلب تقليل الحركة، لذلك نعرض لك نسخة هادئة.", bCalm: "فعّل كل الحركة", tFull: "كل الحركة مفعّلة رغم أن جهازك يطلب تقليلها.", bFull: "العودة إلى النسخة الهادئة" },
    hero: {
      l1: "من رسالة واتساب", l2: "إلى آخر دينار.", alt: "رسالة واتساب تتحول إلى طلبية ثم طرد ثم مال على مسار مضيء",
      lead: "كل طلبية تبدأ برسالة، وتنتهي بمال عند شركة توصيل. SahelFlow يربط الطرفين: يحوّل الرسائل إلى طلبيات، يقول لك بمن تتصل قبل أن تشحن، ويحسب ما حصّلته كل شركة وما بقي لك عندها.",
    },
    pain: {
      h2: "تبيع بالدفع عند الاستلام؟ تعرف هذه اللحظات.",
      items: [
        ["الطلبية التي ضاعت", "كتبها الزبون في واتساب، ثم غرقت بين مئة رسالة أخرى."],
        ["الطرد الذي عاد", "شحنتَ دون مكالمة تأكيد، فعاد الطرد وبقيت رسوم التوصيل عليك."],
        ["المال الذي لا تعرف أين هو", "تسأل شركة التوصيل: كم لي عندكم؟ فلا أحد يملك الرقم بالضبط."],
      ],
      close: "SahelFlow صُنع لهذه اللحظات الثلاث.",
    },
    story: {
      h2: "طلبية واحدة، من الرسالة إلى المال",
      steps: [
        ["الرسالة", "الزبون يكتب، وأنت لا تعيد الكتابة", "زبائنك يكتبون على واتساب بكلماتهم. الذكاء الاصطناعي يُعدّ مسودة الرد والطلب، وأنت تعتمد كل مسودة."],
        ["الطلبية", "كل شيء في بطاقة واحدة", "المنتج والمقاس واللون، الهاتف والولاية، سعر التوصيل والمبلغ المطلوب عند الاستلام. وما ينقص يُعلَّم لك لتسأل عنه الزبون."],
        ["الطرد", "اتصل أولاً، ثم اشحن", "طابور التأكيد يرتّب لك بمن تتصل أولاً، ولماذا. وبعد التأكيد تُنشئ الطرد لشركة التوصيل من داخل التطبيق (الربط مع الشركات قيد الاختبار)."],
        ["المال", "اعرف أين مالك", "ما حصّلته كل شركة توصيل، وما اقتطعته، وما بقي لك عندها. وربحك محسوباً من أرقامك، بعد رسوم التوصيل والمرتجعات."],
      ],
    },
    feat: {
      h2: "كل ما بين الرسالة والمال، في نافذة واحدة.",
      rows: {
        inbox: ["رسائل واتساب تصير طلبيات", "كل المحادثات في صندوق واحد يعمل منه فريقك كله. اختر رسالة أو خمساً، فيصوغ الذكاء الاصطناعي الطلبية لتراجعها. وأي ردّ يقترحه لا يُرسَل إلا بعد موافقتك."],
        orders: ["اعرف بمن تتصل أولاً", "كل طلبية تمرّ بمسار واحد واضح: جديدة، مؤكدة، مجهّزة، مشحونة، مسلَّمة، مع سجلّ كامل. طابور التأكيد يرتّب الزبائن حسب الأولوية، والمخزون يُحجز ويُحرَّر عنك."],
        risk: ["شاهد الخسارة قبل أن تشحن", "قبل الشحن ينبّهك SahelFlow إلى الطلبيات التي تستحق مكالمة تأكيد إضافية، ويقول لك السبب. وبعدها يريك أين تخسر فعلاً: بالولاية، وبالمنتج، وبالقناة."],
        delivery: ["طرودك من داخل التطبيق", "أنشئ الطرد وتابعه دون أن تغادر SahelFlow. الربط مع Yalidine وZR Express وEcoTrack وMaystro قيد الاختبار. وأسعار الولايات للباب أو للمكتب جاهزة (الولايات الإحدى عشرة الجديدة تستعمل مؤقتاً سعر ولايتها القديمة)."],
        accounting: ["اعرف ما لك عند كل شركة توصيل", "ما حصّلته كل شركة، وما اقتطعته، وما يجب أن يصلك. ربح محسوب من أرقامك أنت، بعد رسوم التوصيل والمرتجعات."],
      },
    },
    nums: { h: "ما يشمله الترخيص", labels: ["متاجر مشمولة", "أعضاء فريق", "سنوات من التحديثات", "أيام تجربة مجانية"] },
    price: {
      h2: "ادفع مرة واحدة.", sub: "بلا اشتراك شهري. الترخيص لك.",
      incl: (P) => [`${P.shops} متاجر`, `${P.team} أعضاء فريق`, `${P.years} سنوات من التحديثات`, "كل الوحدات التسع", `تجربة مجانية ${P.trial} أيام`],
    },
  },
  fr: {
    zoom: "Agrandir", close: "Fermer",
    motion: { pause: "Mettre l'animation en pause", play: "Relancer l'animation", tCalm: "Votre appareil demande moins d'animations : nous affichons une version calme.", bCalm: "Voir toutes les animations", tFull: "Toutes les animations sont actives, même si votre appareil en demande moins.", bFull: "Revenir à la version calme" },
    hero: {
      l1: "Du message WhatsApp", l2: "au dernier dinar.", alt: "Un message WhatsApp devient commande, colis puis argent sur une voie lumineuse",
      lead: "Chaque commande commence par un message et finit par de l'argent chez un livreur. SahelFlow relie les deux : il transforme les messages en commandes, vous dit qui appeler avant d'expédier, et calcule ce que chaque livreur a encaissé et vous doit encore.",
    },
    pain: {
      h2: "Vous vendez en paiement à la livraison ? Vous connaissez ces moments.",
      items: [
        ["La commande perdue", "Le client l'a écrite sur WhatsApp, puis elle s'est noyée parmi cent autres messages."],
        ["Le colis revenu", "Vous avez expédié sans appeler : le colis est revenu et les frais de livraison restent pour vous."],
        ["L'argent introuvable", "Vous demandez au livreur combien il vous doit, et personne n'a le chiffre exact."],
      ],
      close: "SahelFlow est fait pour ces trois moments.",
    },
    story: {
      h2: "Une commande, du message à l'argent",
      steps: [
        ["Message", "Le client écrit, vous ne retapez rien", "Vos clients écrivent sur WhatsApp avec leurs mots. L'IA prépare la réponse et la commande ; vous validez chaque brouillon."],
        ["Commande", "Tout tient dans une seule fiche", "Produit, taille, couleur, téléphone, wilaya, frais de livraison et montant à encaisser. Ce qui manque est signalé pour que vous le demandiez au client."],
        ["Colis", "Appelez d'abord, expédiez ensuite", "La file de confirmation classe qui appeler en premier, et pourquoi. Une fois confirmée, vous créez le colis pour votre livreur depuis l'appli (les connexions livreurs sont en test)."],
        ["Argent", "Sachez où est votre argent", "Ce que chaque livreur a encaissé, ce qu'il a retenu et ce qu'il vous doit encore. Et votre bénéfice, calculé à partir de vos chiffres, après frais de livraison et retours."],
      ],
    },
    feat: {
      h2: "Tout ce qu'il y a entre le message et l'argent, dans une seule fenêtre.",
      rows: {
        inbox: ["Les messages WhatsApp deviennent des commandes", "Toutes les conversations dans une seule boîte, partagée par votre équipe. Choisissez un message ou cinq : l'IA prépare la commande pour que vous la vérifiiez. Et aucune réponse qu'elle propose ne part sans votre accord."],
        orders: ["Sachez qui appeler en premier", "Chaque commande suit un chemin clair : nouvelle, confirmée, préparée, expédiée, livrée, avec tout l'historique. La file de confirmation classe vos clients par priorité, et le stock est réservé et libéré pour vous."],
        risk: ["Voyez la perte avant d'expédier", "Avant l'envoi, SahelFlow signale les commandes qui méritent un appel de confirmation de plus, et dit pourquoi. Ensuite il vous montre où vous perdez vraiment : par wilaya, par produit, par canal."],
        delivery: ["Vos colis, depuis l'appli", "Créez le colis et suivez-le sans quitter SahelFlow. Les connexions Yalidine, ZR Express, EcoTrack et Maystro sont en test. Les tarifs par wilaya, à domicile ou au bureau, sont prêts (les 11 nouvelles wilayas utilisent pour l'instant le tarif de leur ancienne wilaya)."],
        accounting: ["Sachez ce que chaque livreur vous doit", "Ce que chaque livreur a encaissé, ce qu'il a retenu et ce qui doit vous revenir. Un bénéfice calculé à partir de vos propres chiffres, après frais de livraison et retours."],
      },
    },
    nums: { h: "Ce que comprend la licence", labels: ["boutiques incluses", "membres d'équipe", "ans de mises à jour", "jours d'essai gratuit"] },
    price: {
      h2: "Payez une fois.", sub: "Pas d'abonnement mensuel. La licence est à vous.",
      incl: (P) => [`${P.shops} boutiques`, `${P.team} membres d'équipe`, `${P.years} ans de mises à jour`, "Les neuf modules", `${P.trial} jours d'essai gratuit`],
    },
  },
  en: {
    zoom: "Enlarge", close: "Close",
    motion: { pause: "Pause animation", play: "Play animation", tCalm: "Your device asks for reduced motion, so we show a calm version.", bCalm: "Show all animations", tFull: "All animations are on, although your device asks for less.", bFull: "Back to the calm version" },
    hero: {
      l1: "From a WhatsApp message", l2: "to the last dinar.", alt: "A WhatsApp message becomes an order, a parcel and then cash along a lit lane",
      lead: "Every order starts as a message and ends as cash sitting with a courier. SahelFlow connects the two: it turns messages into orders, tells you who to call before you ship, and shows what each courier collected and still owes you.",
    },
    pain: {
      h2: "Selling cash on delivery? You know these moments.",
      items: [
        ["The order that got lost", "The customer wrote it on WhatsApp, then it sank under a hundred other messages."],
        ["The parcel that came back", "You shipped without a call, it returned, and the delivery fee is still yours."],
        ["The money nobody can find", "You ask the courier how much they owe you, and nobody has the exact number."],
      ],
      close: "SahelFlow is built for those three moments.",
    },
    story: {
      h2: "One order, from message to money",
      steps: [
        ["Message", "The customer writes. You retype nothing.", "Your customers write on WhatsApp in their own words. The AI drafts the reply and the order; you approve each draft."],
        ["Order", "Everything on one card", "Product, size, colour, phone, wilaya, delivery fee and the amount to collect. Anything missing is flagged so you can ask the customer."],
        ["Parcel", "Call first, then ship", "The confirmation queue ranks who to call first, and why. Once confirmed, you create the parcel for your courier from inside the app (courier connections are in testing)."],
        ["Cash", "Know where your money is", "What each courier collected, what they kept and what still reaches you. And your profit, worked out from your own figures, after delivery fees and returns."],
      ],
    },
    feat: {
      h2: "Everything between the message and the money, in one window.",
      rows: {
        inbox: ["WhatsApp messages become orders", "Every conversation in one inbox your whole team works from. Pick one message or five and the AI drafts the order for you to review. Any reply it suggests is only sent after you approve it."],
        orders: ["Know who to call first", "Every order follows one clear path: new, confirmed, prepared, shipped, delivered, with a full history. The confirmation queue ranks customers by priority, and stock is reserved and released for you."],
        risk: ["See the loss before you ship", "Before you ship, SahelFlow flags the orders worth one more confirmation call and tells you why. Then it shows where you really lose: by wilaya, by product, by channel."],
        delivery: ["Your parcels, from inside the app", "Create the parcel and follow it without leaving SahelFlow. The Yalidine, ZR Express, EcoTrack and Maystro connections are in testing. Rates by wilaya, to the door or to the desk, are ready (the 11 new wilayas use their old wilaya's rate for now)."],
        accounting: ["Know what each courier owes you", "What each courier collected, what they kept and what should reach you. Profit worked out from your own figures, after delivery fees and returns."],
      },
    },
    nums: { h: "What the licence includes", labels: ["shops included", "team members", "years of updates", "free trial days"] },
    price: {
      h2: "Pay once.", sub: "No monthly subscription. The licence is yours.",
      incl: (P) => [`${P.shops} shops`, `${P.team} team members`, `${P.years} years of updates`, "All nine modules", `${P.trial}-day free trial`],
    },
  },
};

const words = (text, start = 0) =>
  text.split(" ").map((w, k) => `<span class="w"><span style="--i:${start + k}">${esc(w)}</span></span>`).join(" ");

const pauseButton = (n) => `<button type="button" class="h5-pause" data-pause aria-pressed="false" aria-label="${esc(n.motion.pause)}" data-l-pause="${esc(n.motion.pause)}" data-l-play="${esc(n.motion.play)}">${icon("pause", "i-pause")}${icon("play", "i-play")}</button>`;
const motionNote = (n) => `<p class="h5-motionnote" data-motion-note hidden data-t-calm="${esc(n.motion.tCalm)}" data-b-calm="${esc(n.motion.bCalm)}" data-t-full="${esc(n.motion.tFull)}" data-b-full="${esc(n.motion.bFull)}"><span data-mn-text></span> <button type="button" data-mn-btn></button></p>`;

function heroSection(n, t, locale) {
  const v = V[locale];
  const names = v.how.names;
  const first = readOrder(v.hero.chat.text, locale);
  const count = n.hero.l1.split(" ").length;
  const tags = TAGS.map(
    (p, i) => `<span class="h4-tag" style="--l:${p.left}%;--t:${p.top}%;--at:${ARRIVE[i]}s"><i></i>${esc(names[i])}</span>`,
  ).join("");
  return `<section class="h4-hero" aria-labelledby="h-hero" data-hero>
<div class="h4-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="h4-grid" aria-hidden="true"></div>
<div class="h4-hero-in">
<div class="h4-copy">
<h1 id="h-hero" class="h4-h1"><span class="ln">${words(n.hero.l1)}</span> <span class="ln ln-g">${words(n.hero.l2, count)}</span></h1>
<p class="h4-lead rv" style="--i:3">${esc(n.hero.lead)}</p>
<div class="h4-cta rv" style="--i:4">
<a class="v-btn" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.home.hero.primary)}</span></a>
<a class="v-text" href="${esc(whatsappHref(t.whatsappMessage))}" rel="noopener">${esc(t.home.hero.secondary)}</a>
</div>
<ul class="h4-chips rv" style="--i:5">${v.hero.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
${motionNote(n)}
</div>
<div class="h4-stage" data-stage>
${heroScene({ label: esc(n.hero.alt) })}
${tags}
<span class="h4-money" style="--l:${TAGS[3].left}%;--t:${TAGS[3].top}%;--at:${ARRIVE[3]}s" aria-hidden="true">+${esc(fmtMoney(first.total, locale))}</span>
${pauseButton(n)}
</div>
</div>
</section>`;
}

function winBar() {
  return `<div class="h4-dev-bar" aria-hidden="true"><i></i><i></i><i></i><img class="h5-barlogo" src="/img/logo-48.png" alt="" width="14" height="19"><b>SahelFlow</b></div>`;
}

function zoomLink(shot, locale, t, n, sizes, lazy = true) {
  return `<a class="h5-zoomlink" href="/img/screens/${shot}-${locale}.webp" data-zoom data-close="${esc(n.close)}">${screenImg(shot, locale, { alt: t.common.realScreenshot, sizes, lazy })}<span class="h5-hint" aria-hidden="true">${esc(n.zoom)}</span></a>`;
}

function painSection(n) {
  const P = n.pain;
  const ic = ["inbox", "risk", "accounting"];
  return `<section class="h5-pain" aria-labelledby="h-pain">
<div class="h5-wrap">
<h2 id="h-pain" class="h4-h2 rv">${esc(P.h2)}</h2>
<ul class="h5-pain-grid">
${P.items.map(([title, text], i) => `<li class="h5-pain-card rv" style="--i:${i}"><span class="h5-pain-ic">${icon(ic[i])}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("\n")}
</ul>
<p class="h5-pain-close rv">${esc(P.close)}</p>
</div>
</section>`;
}

function storySection(n, t, locale) {
  const S = n.story;
  const shots = ["inbox", "queue", "delivery", "analytics"];
  const on = (i) => (i === 0 ? ' data-on=""' : "");
  return `<section class="h4-story" id="story" aria-labelledby="h-story" data-story style="--n:4">
<header class="h4-story-head"><div class="h5-wrap"><h2 id="h-story" class="h4-h2 rv">${esc(S.h2)}</h2></div></header>
<div class="h4-story-track">
<div class="h4-story-pin">
<div class="h4-story-in">
<div class="h4-story-l">
<ol class="h4-steps" data-steps>
${S.steps.map(([name, title, text], i) => `<li${on(i)}><span class="h4-step-name">${esc(name)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("\n")}
</ol>
<div class="h4-rail" role="group" aria-label="${esc(V[locale].how.slider)}">
<i class="h4-rail-fill" aria-hidden="true"></i>
${S.steps.map(([name], i) => `<button type="button" data-go="${i}"${i === 0 ? ' aria-current="step"' : ""}>${esc(name)}</button>`).join("")}
</div>
</div>
<div class="h4-story-r">
<div class="h4-device" data-device>
${winBar()}
<div class="h4-shots">
${shots.map((s, i) => `<figure class="h4-shot"${on(i)}>${zoomLink(s, locale, t, n, "(min-width: 900px) 62vw, 92vw", i > 0)}</figure>`).join("\n")}
</div>
</div>
<p class="h4-sample">${esc(V[locale].how.sample)}</p>
</div>
</div>
</div>
</div>
</section>`;
}

const FEATS = [
  ["inbox", "inbox"],
  ["orders", "queue"],
  ["risk", "risk"],
  ["delivery", "delivery"],
  ["accounting", "analytics"],
];

function featSection(n, t, locale) {
  const rows = FEATS.map(([key, shot], i) => {
    const [title, text] = n.feat.rows[key];
    return `<article class="h5-row${i % 2 ? " is-flip" : ""} rv">
<div class="h5-row-t">
<h3>${esc(title)}</h3>
<p>${esc(text)}</p>
${key === "delivery" ? `<p class="h4-badge">${statusBadge("testing", locale)}</p>` : ""}
<a class="v-text" href="${href(locale, `product/${key}`)}">${esc(t.common.seeModule)}${icon("arrow", "flip")}</a>
</div>
<div class="h5-row-s">
<div class="h5-win">
${winBar()}
${zoomLink(shot, locale, t, n, "(min-width: 1100px) 760px, (min-width: 900px) 58vw, 92vw")}
</div>
<p class="h5-cap">${esc(t.common.demoData)}</p>
</div>
</article>`;
  }).join("\n");
  return `<section class="h4-feat" aria-labelledby="h-feat">
<div class="h5-wrap">
<h2 id="h-feat" class="h4-h2 rv">${esc(n.feat.h2)}</h2>
<div class="h5-rows">
${rows}
</div>
</div>
</section>`;
}

const DEMO = {
  ar: {
    h2: "شاهد رسالة زبون تتحول إلى طلبية",
    sub: "اختر زبوناً أو اكتب رسالته بنفسك. تقرأ الصفحة الجملة وتملأ البطاقة: المنتج والهاتف والولاية والمبلغ عند الاستلام.",
    who: [["أمين ب.", "وهران"], ["كريم ل.", "سطيف"], ["سارة م.", "الجزائر"], ["ياسين ر.", "قسنطينة"]],
    pick: "اختر زبوناً", customer: "زبون جديد", you: "زبونك", placeholder: "اكتب كما يكتب زبونك…", send: "أرسل", result: "الطلبية التي بُنيت",
    ready: "جاهزة لطابور التأكيد", missing: "ينقصها:", sep: "، ", f: { product: "المنتج", phone: "الهاتف", wilaya: "الولاية" },
    note: "عرض توضيحي بقواعد بسيطة ومتجر تجريبي. في التطبيق تراجع كل طلبية قبل أن تُشحن.",
  },
  fr: {
    h2: "Regardez un message client devenir une commande",
    sub: "Choisissez un client ou écrivez son message vous-même. La page lit la phrase et remplit la fiche : produit, téléphone, wilaya et montant à encaisser.",
    who: [["Amine B.", "Oran"], ["Karim L.", "Sétif"], ["Sara M.", "Alger"], ["Yacine R.", "Constantine"]],
    pick: "Choisissez un client", customer: "Nouveau client", you: "Votre client", placeholder: "Écrivez comme votre client…", send: "Envoyer", result: "La commande obtenue",
    ready: "Prête pour la file de confirmation", missing: "Il manque :", sep: ", ", f: { product: "le produit", phone: "le téléphone", wilaya: "la wilaya" },
    note: "Démonstration avec des règles simples et une boutique modèle. Dans l'appli, vous vérifiez chaque commande avant l'expédition.",
  },
  en: {
    h2: "Watch a customer's message become an order",
    sub: "Pick a customer or write their message yourself. The page reads the sentence and fills the card: product, phone, wilaya and the amount to collect.",
    who: [["Amine B.", "Oran"], ["Karim L.", "Sétif"], ["Sara M.", "Algiers"], ["Yacine R.", "Constantine"]],
    pick: "Pick a customer", customer: "New customer", you: "Your customer", placeholder: "Write like your customer…", send: "Send", result: "The order it builds",
    ready: "Ready for the confirmation queue", missing: "Still missing:", sep: ", ", f: { product: "a product", phone: "a phone number", wilaya: "the wilaya" },
    note: "A demonstration with simple rules and a model shop. In the app you review every order before it ships.",
  },
};

/** Keep a phone number on one line. */
const nbPhone = (s) => s.replace(/(\d{4}) (\d{2}) (\d{2}) (\d{2})/g, "$1\u00a0$2\u00a0$3\u00a0$4");

function demoSection(locale) {
  const v = V[locale];
  const D = DEMO[locale];
  const msgs = [v.hero.chat.text, ...v.type.examples];
  const first = readOrder(msgs[0], locale);
  const ok = first.missing.length === 0;
  const status = ok ? D.ready : `${D.missing} ${first.missing.map((k) => D.f[k]).join(D.sep)}`;
  const initial = (str) => [...str][0];
  const tabs = D.who
    .map(([name, town], i) => `<button type="button" data-ex="${esc(msgs[i])}" data-who="${esc(name)}" aria-pressed="${i === 0}"><b>${esc(name)}</b><small>${esc(town)}</small></button>`)
    .join("");
  return `<section class="h6-demo" aria-labelledby="h-demo" data-type data-locale="${locale}" data-ready="${esc(D.ready)}" data-missing="${esc(D.missing)}" data-sep="${esc(D.sep)}" data-you="${esc(D.you)}" data-f-product="${esc(D.f.product)}" data-f-phone="${esc(D.f.phone)}" data-f-wilaya="${esc(D.f.wilaya)}">
<div class="h5-wrap">
<header class="h6-head"><h2 id="h-demo" class="h4-h2 rv">${esc(D.h2)}</h2><p class="h6-sub rv">${esc(D.sub)}</p></header>
<div class="h6-grid rv">
<div class="h6-left">
<p class="h6-pick" id="h6-pick">${esc(D.pick)}</p>
<div class="h6-who" role="group" aria-labelledby="h6-pick">${tabs}</div>
<div class="h6-phone" data-ui>
<div class="h6-bar"><span class="h6-av" data-avatar aria-hidden="true">${esc(initial(D.who[0][0]))}</span><span class="h6-id"><b data-chat-name>${esc(D.who[0][0])}</b><small>${esc(D.customer)}</small></span></div>
<div class="h6-msgs">
<p class="h6-bubble" data-bubble><span class="h6-ghost" data-ghost aria-hidden="true">${esc(nbPhone(msgs[0]))}</span><span class="h6-live" data-live>${esc(nbPhone(msgs[0]))}</span><small class="num">${esc(v.hero.chat.time)}</small></p>
<p class="h6-typing" data-typing hidden aria-hidden="true"><i></i><i></i><i></i></p>
</div>
<form class="h6-compose" action="#" data-compose>
<label class="sr-only" for="msg">${esc(D.placeholder)}</label>
<input id="msg" type="text" data-msg placeholder="${esc(D.placeholder)}" autocomplete="off" spellcheck="false">
<button type="submit" class="h6-send" aria-label="${esc(D.send)}">${icon("arrow", "flip")}</button>
</form>
</div>
</div>
<div class="h6-right">
<p class="h6-label">${esc(D.result)}</p>
${orderCard({ ...v, lang: locale }, first, { state: "call", live: true })}
<p class="h6-status ${ok ? "is-ok" : "is-warn"}" data-status role="status">${esc(status)}</p>
</div>
</div>
<p class="h6-note rv">${esc(D.note)}</p>
</div>
</section>`;
}

function numsSection(n) {
  const items = [
    [PACKAGE.includedShops, n.nums.labels[0]],
    [PACKAGE.teamMembers, n.nums.labels[1]],
    [PACKAGE.updateYears, n.nums.labels[2]],
    [PACKAGE.trialDays, n.nums.labels[3]],
  ];
  return `<section class="h4-nums" aria-labelledby="h-nums">
<h2 id="h-nums" class="sr-only">${esc(n.nums.h)}</h2>
<ul>${items.map(([num, label], i) => `<li class="rv" style="--i:${i}"><b class="num" data-count-to="${num}">${num}</b><span>${esc(label)}</span></li>`).join("")}</ul>
</section>`;
}

/** The connections section: one line of logo pills that drifts by itself (a marquee). Copy in three languages. */
const DISPLAY = ["whatsapp", "yalidine", "gemini", "shopify", "sheets", "zr", "openai", "youcan", "meta", "ecotrack", "groq", "woocommerce", "excel", "maystro", "storefront"];
const HUE = {
  whatsapp: "#25d366", gemini: "#7c6cf2", openai: "#111827", groq: "#0ea5e9", yalidine: "#ea5b54", zr: "#ffb824", ecotrack: "#2e4a86", maystro: "#008aff",
  shopify: "#7ab55c", youcan: "#e1116f", woocommerce: "#873eff", storefront: "#0ea5e9", sheets: "#34a853", excel: "#217346", meta: "#0467df",
};
const FEED = {
  ar: {
    h2: "نختبر الربط مع الأدوات التي تستعملها أصلاً",
    sub: "واتساب وشركات التوصيل والمتاجر والجداول والذكاء الاصطناعي. على كل رابط حالته مكتوبة بجانبه، ولن نكتب «متصل» قبل أن نجرّبه على حساب حقيقي.",
    eyebrowAll: (n) => `${n} ربطاً، كلها قيد الاختبار`,
    eyebrowSome: (n) => `${n} ربطاً، لكل منها حالتها`,
    more: "تفاصيل كل ربط",
    calm: "جهازك يطلب حركة أقل، فيتحرك الشريط ببطء. يوقفه الزر.",
  },
  fr: {
    h2: "Nous testons la connexion avec les outils que vous utilisez déjà",
    sub: "WhatsApp, transporteurs, boutiques, tableurs et IA. Chaque connexion affiche son statut, et nous n'écrirons « connecté » qu'après un essai sur un vrai compte.",
    eyebrowAll: (n) => `${n} connexions, toutes en test`,
    eyebrowSome: (n) => `${n} connexions, chacune avec son statut`,
    more: "Le détail de chaque connexion",
    calm: "Votre appareil demande moins d'animations : la ligne avance lentement. Le bouton l'arrête.",
  },
  en: {
    h2: "We are testing links with the tools you already use",
    sub: "WhatsApp, couriers, stores, spreadsheets and AI. Each link carries its status next to it, and we will not write “connected” until it has run against a real account.",
    eyebrowAll: (n) => `${n} links, all in testing`,
    eyebrowSome: (n) => `${n} links, each with its own status`,
    more: "Details of every link",
    calm: "Your device asks for less motion, so the line moves slowly. The button stops it.",
  },
};

function feedSection(n, t, locale) {
  const F = FEED[locale];
  const keys = Object.keys(BRAND_NAMES);
  for (const k of keys) if (!HUE[k]) throw new Error(`feed: no colour for ${k} in home5.mjs HUE`);
  if (DISPLAY.length !== keys.length || DISPLAY.some((k) => !keys.includes(k)) || new Set(DISPLAY).size !== keys.length) {
    throw new Error("feed: DISPLAY in home5.mjs must list every brand exactly once");
  }
  const allTesting = keys.every((k) => integrationStatus(k) === "testing");
  const card = (key) => {
    const status = integrationStatus(key);
    return `<li data-status="${status}" data-brand="${key}" class="h7-card" style="--c:${HUE[key]}">${brandTile(key)}<span class="h7-txt"><span class="h7-name"><bdi>${esc(BRAND_NAMES[key])}</bdi></span><span class="h7-st" data-st="${status}"><i aria-hidden="true"></i>${esc(statusLabel(status, locale))}</span></span></li>`;
  };
  const eyebrow = (allTesting ? F.eyebrowAll : F.eyebrowSome)(keys.length);
  return `<section class="h7-feed" aria-labelledby="h-int" data-feed>
<div class="h5-wrap">
<header class="h7-head rv"><p class="h7-eyebrow"><i aria-hidden="true"></i>${esc(eyebrow)}</p><h2 id="h-int" class="h4-h2">${esc(F.h2)}</h2><p class="h6-sub">${esc(F.sub)}</p></header>
</div>
<div class="h7-rows rv" data-feed-rows data-marquee>
<i class="h7-spot" aria-hidden="true"></i>
<ul class="h7-row" data-feed-row aria-label="${esc(F.h2)}">${DISPLAY.map(card).join("")}</ul>
</div>
<div class="h5-wrap">
<div class="h7-ctl rv"><button type="button" class="h5-pause h7-pause" data-feed-pause aria-pressed="false" aria-label="${esc(n.motion.pause)}" data-l-pause="${esc(n.motion.pause)}" data-l-play="${esc(n.motion.play)}">${icon("pause", "i-pause")}${icon("play", "i-play")}</button><p class="h7-calmnote" data-calm-note hidden>${esc(F.calm)}</p></div>
<p class="h7-note rv">${esc(BRAND_MARKS[locale])} <a class="v-text" href="${href(locale, "integrations")}">${esc(F.more)}${icon("arrow", "flip")}</a></p>
</div>
</section>`;
}

function priceSection(n, t, locale) {
  const v = V[locale];
  const p = licencePricing(locale);
  const P = {
    seats: PACKAGE.launchOfferSeats,
    regular: money(PACKAGE.priceDzd, locale),
    shops: PACKAGE.includedShops,
    team: PACKAGE.teamMembers,
    years: PACKAGE.updateYears,
    trial: PACKAGE.trialDays,
  };
  const unit = locale === "ar" ? "دج" : "DA";
  const amount = p.ask
    ? `<p class="h4-amount"><span>${esc(p.price)}</span></p>`
    : `<p class="h4-amount"><span class="num" data-count-to="${p.amount}">${esc(new Intl.NumberFormat("fr-FR").format(p.amount).replace(/[\u202f\u00a0\s]/g, NB))}</span><small>${unit}</small></p>`;
  return `<section class="h4-price" aria-labelledby="h-price">
<div class="h4-price-card rv">
<div class="h4-price-l">
<h2 id="h-price" class="h4-h2">${esc(n.price.h2)}</h2>
<p class="h4-price-sub">${esc(n.price.sub)}</p>
<ul class="h4-incl">${n.price.incl(P).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
</div>
<div class="h4-price-r">
${p.offer ? `<span class="h4-offer">${esc(p.offer.label)}</span>` : ""}
${amount}
${p.offer ? `<p class="h4-was"><s>${esc(p.offer.regular)}</s> <em>${esc(p.offer.save)}</em></p>` : ""}
<p class="h4-price-sup">${esc(p.offer ? v.price.offer(P) : v.price.plain(P))}</p>
<div class="h4-price-act">
<a class="v-btn" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.home.hero.primary)}</span></a>
<a class="v-text" href="${href(locale, "pricing")}">${esc(v.price.more)}${icon("arrow", "flip")}</a>
</div>
</div>
</div>
</section>`;
}

const FAQ_H2 = { ar: "أسئلة عليك طرحها أولاً", fr: "Les questions à poser d'abord", en: "Questions to ask first" };
const DARJA = {
  en: "It is built to read Darja, French, Arabic or a mix.",
  fr: "Elle est conçue pour lire la darja, le français, l'arabe ou un mélange.",
  ar: "صُمّم ليقرأ الدارجة والفرنسية والعربية أو خليطاً منها.",
};

/** The home questions: the vetted ones, plus the help-centre answer that says the reading of Darja is built, not measured. */
export function homeFaq5(locale) {
  const t = COPY[locale];
  const base = homeFaq(locale);
  let darja = null;
  for (const topic of Object.values(t.helpPage.topics)) for (const item of topic[2] || []) if (!darja && item[1] && item[1].includes(DARJA[locale])) darja = item;
  return darja ? [base[0], darja, ...base.slice(1)] : base;
}

function faqSection(locale) {
  const v = V[locale];
  const items = homeFaq5(locale);
  return `<section class="h4-faq" aria-labelledby="h-faq">
<div class="h4-faq-in">
<h2 id="h-faq" class="h4-h2 rv">${esc(FAQ_H2[locale])}</h2>
<div class="h4-qas">
${items.map(([q, a], i) => `<details class="h4-qa rv" name="home-faq"${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
</div>
</div>
</section>`;
}

function ctaSection(t, locale) {
  const k = V[locale].cta;
  return `<section class="h4-final" aria-labelledby="h-cta">
<div class="h4-final-glow" aria-hidden="true"></div>
<form class="h4-final-form rv" action="#" data-wa="${esc(SITE.whatsapp)}" data-wa-msg="${esc(k.msg("{shop}"))}">
<h2 id="h-cta" class="h4-final-s"><label for="shop">${esc(k.pre)}</label> <input class="h4-final-in" id="shop" name="shop" type="text" placeholder="${esc(k.ph)}" autocomplete="organization" maxlength="60"> <span>${esc(k.post)}</span> <a class="v-btn" href="${esc(whatsappHref(t.whatsappMessage))}" rel="noopener" data-wa-go>${esc(k.btn)}</a></h2>
</form>
<p class="h4-final-after rv" style="--i:1">${esc(k.after)}</p>
</section>`;
}

/** The home page body (the shell, header and footer are added by layout.mjs). */
export function homeBody5(locale) {
  const n = N[locale];
  const t = COPY[locale];
  return `${heroSection(n, t, locale)}
${painSection(n)}
${storySection(n, t, locale)}
${featSection(n, t, locale)}
${demoSection(locale)}
${numsSection(n)}
${feedSection(n, t, locale)}
${priceSection(n, t, locale)}
${faqSection(locale)}
${ctaSection(t, locale)}`;
}
