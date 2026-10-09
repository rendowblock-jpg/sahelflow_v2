// Small rendering helpers shared by every page of sahelflow.com.
import { SITE } from "./config.mjs";
import { ICONS } from "./icons.mjs";
import { PACKAGE } from "./model.mjs";
import { COPY } from "./i18n/index.mjs";

export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Locale-aware path: href("fr") → /fr/, href("fr", "pricing") → /fr/pricing/. */
export const href = (locale, path = "") => `/${locale}/${path ? `${path.replace(/^\/|\/$/g, "")}/` : ""}`;

export const icon = (name, cls = "") => {
  const markup = ICONS[name] ?? ICONS.sparkle;
  return cls ? markup.replace("<svg ", `<svg class="${cls}" `) : markup;
};

const NBSP = " ";
export const num = (value) => new Intl.NumberFormat("fr-FR").format(value).replace(/[   ]/g, NBSP);
export const money = (amount, locale) => `${num(amount)}${NBSP}${locale === "ar" ? "دج" : "DA"}`;

/** "+213 791 99 91 57" from the configured WhatsApp number. */
export function phoneDisplay() {
  const digits = SITE.whatsapp ?? "";
  const m = digits.match(/^(213)(\d{3})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : `+${digits}`;
}

export function whatsappHref(message) {
  if (!SITE.whatsapp) return `mailto:${SITE.email}`;
  return `https://wa.me/${SITE.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Current licence price and the launch offer, straight from config. */
export function licencePricing(locale) {
  const p = COPY[locale].pricingPage.licence;
  if (!PACKAGE.priceDzd) return { price: p.ask, amount: null, ask: true, offer: null };
  if (!PACKAGE.launchOfferDzd) return { price: money(PACKAGE.priceDzd, locale), amount: PACKAGE.priceDzd, ask: false, offer: null };
  const pct = Math.round((1 - PACKAGE.launchOfferDzd / PACKAGE.priceDzd) * 100);
  return {
    price: money(PACKAGE.launchOfferDzd, locale),
    amount: PACKAGE.launchOfferDzd,
    ask: false,
    offer: {
      regular: money(PACKAGE.priceDzd, locale),
      label: p.offer(PACKAGE.launchOfferSeats),
      then: p.then(money(PACKAGE.priceDzd, locale)),
      save: p.save(pct),
    },
  };
}

export const shotUrl = (key, locale) => `/img/screens/${key}-${locale}.webp`;

/** A real screenshot of the app, framed as a desktop window. */
export function appWindow(key, locale, { eager = false, cls = "", label } = {}) {
  const t = COPY[locale];
  const alt = label ?? t.common.realScreenshot;
  return `<figure class="app-window ${cls}">
  <div class="app-window-bar" aria-hidden="true"><i></i><i></i><i></i><span>SahelFlow</span></div>
  <img src="${shotUrl(key, locale)}" width="1600" height="1000" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">
</figure>`;
}

export function sectionHead({ eyebrow, title, lead, center = false, id }) {
  return `<header class="section-head${center ? " is-center" : ""}"${id ? ` id="${id}"` : ""}>
  ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
  <h2 class="section-title">${esc(title)}</h2>
  ${lead ? `<p class="section-lead">${esc(lead)}</p>` : ""}
</header>`;
}

export const arrow = () => icon("arrow", "flip");

export function button(url, label, { kind = "primary", iconName, external = false, size = "", attrs = "" } = {}) {
  const rel = external ? ' rel="noopener"' : "";
  return `<a class="btn btn-${kind}${size ? ` btn-${size}` : ""}" href="${esc(url)}"${rel}${attrs ? ` ${attrs}` : ""}>${iconName ? icon(iconName) : ""}<span>${esc(label)}</span></a>`;
}

/** Pairs of CTA buttons used at the bottom of most pages. */
export function ctas(locale, { primary, secondary } = {}) {
  const t = COPY[locale];
  return `<div class="cta-row">
  ${button(href(locale, "download"), primary ?? t.home.hero.primary, { iconName: "download", size: "lg" })}
  ${button(whatsappHref(t.whatsappMessage), secondary ?? t.home.hero.secondary, { kind: "glass", iconName: "whatsapp", external: true, size: "lg" })}
</div>`;
}

/** FAQ list as native disclosure widgets (works without JavaScript). */
export function faqList(items, { name = "faq" } = {}) {
  return `<div class="faq">${items
    .map(
      ([q, a]) => `<details class="faq-item" name="${name}">
  <summary><span>${esc(q)}</span>${icon("plus", "faq-icon")}</summary>
  <div class="faq-answer"><p>${esc(a)}</p></div>
</details>`,
    )
    .join("")}</div>`;
}

export function faqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}
