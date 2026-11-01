// The home page, v4 "Signal": dark, luminous, in motion.
// A 3D isometric lane that carries one order (message > order > parcel > cash), a pinned story over the real screens,
// five jobs as a lit grid, a live order reader, one price, and a closing sentence with a blank in it.
// Facts come from claims.mjs / model.mjs / config.mjs and the vetted copy in home3.mjs; only the connective words are new here.
import { COPY } from "./i18n/index.mjs";
import { integrationStatus } from "./claims.mjs";
import { BRAND_NAMES, INTEGRATIONS, PACKAGE } from "./model.mjs";
import { SITE } from "./config.mjs";
import { fmtMoney, readOrder } from "./orderparse.mjs";
import { HOME3_COPY as V, homeFaq, orderCard } from "./home3.mjs";
import { ARRIVE, TAGS, heroScene } from "./scene4.mjs";
import { esc, href, icon, licencePricing, money, screenImg, statusBadge, whatsappHref } from "./ui.mjs";

const NB = "\u00a0";

const N = {
  ar: {
    hero: { l1: "من رسالة واتساب", l2: "إلى آخر دينار.", alt: "رسالة واتساب تتحول إلى طلبية ثم طرد ثم مال على مسار مضيء" },
    story: { h2: "طلبية واحدة، أربع لحظات." },
    feat: { h2: "كل ما بين الرسالة والمال، في نافذة واحدة." },
    nums: { h: "ما يشمله الترخيص", labels: ["متاجر مشمولة", "أعضاء فريق", "سنوات من التحديثات", "أيام تجربة مجانية"] },
    price: {
      h2: "ادفع مرة واحدة.", sub: "بلا اشتراك شهري. الترخيص لك.",
      incl: (P) => [`${P.shops} متاجر`, `${P.team} أعضاء فريق`, `${P.years} سنوات من التحديثات`, "كل الوحدات التسع", `تجربة مجانية ${P.trial} أيام`],
    },
  },
  fr: {
    hero: { l1: "Du message WhatsApp", l2: "au dernier dinar.", alt: "Un message WhatsApp devient commande, colis puis argent sur une voie lumineuse" },
    story: { h2: "Une commande, quatre moments." },
    feat: { h2: "Tout ce qu'il y a entre le message et l'argent, dans une seule fenêtre." },
    nums: { h: "Ce que comprend la licence", labels: ["boutiques incluses", "membres d'équipe", "ans de mises à jour", "jours d'essai gratuit"] },
    price: {
      h2: "Payez une fois.", sub: "Pas d'abonnement mensuel. La licence est à vous.",
      incl: (P) => [`${P.shops} boutiques`, `${P.team} membres d'équipe`, `${P.years} ans de mises à jour`, "Les neuf modules", `${P.trial} jours d'essai gratuit`],
    },
  },
  en: {
    hero: { l1: "From a WhatsApp message", l2: "to the last dinar.", alt: "A WhatsApp message becomes an order, a parcel and then cash along a lit lane" },
    story: { h2: "One order, four moments." },
    feat: { h2: "Everything between the message and the money, in one window." },
    nums: { h: "What the licence includes", labels: ["shops included", "team members", "years of updates", "free trial days"] },
    price: {
      h2: "Pay once.", sub: "No monthly subscription. The licence is yours.",
      incl: (P) => [`${P.shops} shops`, `${P.team} team members`, `${P.years} years of updates`, "All nine modules", `${P.trial}-day free trial`],
    },
  },
};

const words = (text, start = 0) =>
  text.split(" ").map((w, k) => `<span class="w"><span style="--i:${start + k}">${esc(w)}</span></span>`).join(" ");

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
<p class="h4-lead rv" style="--i:3">${esc(v.hero.lead)}</p>
<div class="h4-cta rv" style="--i:4">
<a class="v-btn" href="${href(locale, "download")}">${icon("download")}<span>${esc(t.home.hero.primary)}</span></a>
<a class="v-text" href="${esc(whatsappHref(t.whatsappMessage))}" rel="noopener">${esc(t.home.hero.secondary)}</a>
</div>
<ul class="h4-chips rv" style="--i:5">${v.hero.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
</div>
<div class="h4-stage" data-stage>
${heroScene({ label: esc(n.hero.alt) })}
${tags}
<span class="h4-money" style="--l:${TAGS[3].left}%;--t:${TAGS[3].top - 9}%;--at:${ARRIVE[3]}s" aria-hidden="true">+${esc(fmtMoney(first.total, locale))}</span>
</div>
</div>
</section>`;
}

function storySection(n, t, locale) {
  const v = V[locale];
  const shots = ["inbox", "queue", "delivery", "analytics"];
  const on = (i) => (i === 0 ? ' data-on=""' : "");
  return `<section class="h4-story" id="story" aria-labelledby="h-story" data-story style="--n:4">
<div class="h4-story-pin">
<div class="h4-story-in">
<div class="h4-story-l">
<h2 id="h-story" class="h4-h2 rv">${esc(n.story.h2)}</h2>
<ol class="h4-steps" data-steps>
${v.how.steps.map(([title, text], i) => `<li${on(i)}><span class="h4-step-name">${esc(v.how.names[i])}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("\n")}
</ol>
<div class="h4-rail" role="group" aria-label="${esc(v.how.slider)}">
<i class="h4-rail-fill" aria-hidden="true"></i>
${v.how.names.map((name, i) => `<button type="button" data-go="${i}"${i === 0 ? ' aria-current="step"' : ""}>${esc(name)}</button>`).join("")}
</div>
</div>
<div class="h4-story-r">
<div class="h4-device" data-device>
<div class="h4-dev-bar" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="h4-shots">
${shots.map((s, i) => `<figure class="h4-shot"${on(i)}>${screenImg(s, locale, { alt: t.common.realScreenshot, sizes: "(min-width: 900px) 52vw, 92vw", lazy: i > 0 })}</figure>`).join("\n")}
</div>
</div>
<p class="h4-sample">${esc(v.how.sample)}</p>
</div>
</div>
</div>
</section>`;
}

const FEATS = [
  ["inbox", "inbox", "a"],
  ["orders", "queue", "b"],
  ["risk", "risk", "c"],
  ["delivery", "delivery", "d"],
  ["accounting", "analytics", "e"],
];

function featSection(n, t, locale) {
  const v = V[locale];
  const cards = FEATS.map(([key, shot, slot]) => {
    const mod = t.modules[key];
    return `<article class="h4-card h4-c-${slot} rv" data-tilt>
<div class="h4-card-t">
<h3>${esc(v.feat.rows[key])}</h3>
<p>${esc(mod.lead)}</p>
${key === "delivery" ? `<p class="h4-badge">${statusBadge("testing", locale)}</p>` : ""}
<a class="v-text" href="${href(locale, `product/${key}`)}">${esc(t.common.seeModule)}${icon("arrow", "flip")}</a>
</div>
<div class="h4-card-s"><span class="h4-shotframe">${screenImg(shot, locale, { alt: t.common.realScreenshot, sizes: "(min-width: 900px) 40vw, 92vw" })}</span></div>
</article>`;
  }).join("\n");
  return `<section class="h4-feat" aria-labelledby="h-feat">
<h2 id="h-feat" class="h4-h2 rv">${esc(n.feat.h2)}</h2>
<div class="h4-bento">
${cards}
</div>
</section>`;
}

function demoSection(locale) {
  const v = V[locale];
  const T = v.type;
  const first = readOrder(v.hero.chat.text, locale);
  return `<section class="h4-demo" aria-labelledby="h-demo" data-type data-locale="${locale}">
<div class="h4-demo-in">
<div class="h4-demo-l">
<h2 id="h-demo" class="h4-h2 rv">${esc(T.h2)}</h2>
<label class="h4-compose rv" for="msg"><span class="sr-only">${esc(T.label)}</span><input id="msg" type="text" value="${esc(v.hero.chat.text)}" autocomplete="off" spellcheck="false" data-msg></label>
<p class="h4-try rv">${esc(T.try)}</p>
<ul class="h4-ex rv">${T.examples.map((e) => `<li><button type="button" data-ex="${esc(e)}">${esc(e)}</button></li>`).join("")}</ul>
<p class="h4-note rv">${esc(T.note)}</p>
</div>
<div class="h4-demo-r rv">${orderCard({ ...v, lang: locale }, first, { state: "call", live: true })}</div>
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

function intSection(t, locale) {
  const v = V[locale];
  const names = INTEGRATIONS.flatMap((g) => g.items).filter((k) => k !== "storefront");
  const allTesting = names.every((k) => integrationStatus(k) === "testing");
  const list = names.map((k) => `<span class="h4-n" dir="ltr">${esc(BRAND_NAMES[k])}</span>`).join("");
  return `<section class="h4-int" aria-labelledby="h-int">
<h2 id="h-int" class="h4-h3 rv">${esc(allTesting ? v.proof.all : v.proof.some)}</h2>
<ul class="sr-only">${names.map((k) => `<li>${esc(BRAND_NAMES[k])}</li>`).join("")}</ul>
<div class="h4-marq" aria-hidden="true"><div class="h4-marq-track">${list}${list}</div></div>
<p class="h4-int-note rv">${esc(v.proof.note)} <a class="v-text" href="${href(locale, "integrations")}">${esc(v.proof.link)}${icon("arrow", "flip")}</a></p>
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

function faqSection(locale) {
  const v = V[locale];
  const items = homeFaq(locale);
  return `<section class="h4-faq" aria-labelledby="h-faq">
<div class="h4-faq-in">
<h2 id="h-faq" class="h4-h2 rv">${esc(v.faq.h2)}</h2>
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
export function homeBody4(locale) {
  const n = N[locale];
  const t = COPY[locale];
  return `${heroSection(n, t, locale)}
${storySection(n, t, locale)}
${featSection(n, t, locale)}
${demoSection(locale)}
${numsSection(n)}
${intSection(t, locale)}
${priceSection(n, t, locale)}
${faqSection(locale)}
${ctaSection(t, locale)}`;
}
