import wilayas from "../../../../data/wilayas.json";

import { currencySuffix, formatPrice, localeTag } from "./format";
import { renderContact, renderFaq, renderRail, renderTestimonials } from "./home";
import { esc, icon, imgAttrs, productHref, str, transitionName, whatsappDigits, type Ctx } from "./ui";
import type { ShopProduct } from "./model";

type Fees = Record<string, [number | null, number | null]>;

export const GALLERY_SIZES = "(min-width:900px) 540px, 100vw";

function feeTable(ctx: Ctx): Fees {
  const fees: Fees = {};
  for (const row of ctx.shipping) {
    const entry = fees[row.wilayaCode] ?? [null, null];
    entry[row.mode === "home" ? 0 : 1] = row.feeDzd;
    fees[row.wilayaCode] = entry;
  }
  return fees;
}

function wilayaList(ctx: Ctx, fees: Fees): Array<[string, string]> {
  const list: Array<[string, string]> = [];
  for (const wilaya of wilayas as Array<{ code: number; name: string; nameAr: string }>) {
    const code = String(wilaya.code).padStart(2, "0");
    if (!fees[code]) continue;
    list.push([code, `${code} · ${ctx.locale === "ar" ? wilaya.nameAr || wilaya.name : wilaya.name}`]);
  }
  return list;
}

function field(id: string, label: string, control: string, area = false): string {
  return `<div class="sf-field${area ? " sf-field--area" : ""}"><label for="f-${id}">${esc(label)}</label>${control}<p class="sf-err" id="e-${id}" hidden></p></div>`;
}

function gallery(ctx: Ctx, product: ShopProduct): string {
  const { t } = ctx;
  const vt = transitionName(ctx, product.id);
  const vtStyle = vt ? ` style="view-transition-name:${vt}"` : "";
  if (product.images.length === 0) {
    return `<div class="sf-gal"><div class="sf-gal-track"><div class="sf-slide sf-ph-wrap"${vtStyle} aria-hidden="true"><span class="sf-ph">${esc([...product.name.trim()][0]?.toUpperCase() ?? "")}</span></div></div></div>`;
  }
  const total = product.images.length;
  const slides = product.images
    .map((url, index) => `<div class="sf-slide" role="group" aria-label="${esc(t("storefront.shop.photo", { n: index + 1, total }))}"${index === 0 ? vtStyle : ""}><img ${imgAttrs(url, GALLERY_SIZES)} alt="${esc(index === 0 ? product.name : `${product.name} ${index + 1}`)}" width="800" height="1000" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer"></div>`)
    .join("");
  const counter = total > 1 ? `<span class="sf-count" aria-hidden="true"><b>1</b> / ${total}</span>` : "";
  const dots = total > 1 ? `<div class="sf-dots" aria-hidden="true">${product.images.map((_, index) => `<i${index === 0 ? ' aria-current="true"' : ""}></i>`).join("")}</div>` : "";
  return `<div class="sf-gal"><div class="sf-gal-track" tabindex="0">${slides}</div>${counter}${dots}</div>`;
}

function variantPicker(ctx: Ctx, product: ShopProduct, selected: string): string {
  if (product.variants.length < 2) return "";
  const pills = product.variants
    .map((variant) => {
      const out = variant.remaining <= 0;
      return `<label class="sf-pill${out ? " is-out" : ""}"><input type="radio" name="variant" value="${esc(variant.itemKey)}"${variant.itemKey === selected ? " checked" : ""}${out ? " disabled" : ""}><span>${esc(variant.label ?? ctx.t("storefront.view.landing.variantStandard"))}${out ? ` <small>· ${esc(ctx.t("storefront.view.landing.soldOut"))}</small>` : ""}</span></label>`;
    })
    .join("");
  return `<fieldset class="sf-opts"><legend>${esc(ctx.t("storefront.view.landing.variant"))}</legend><div class="sf-pills">${pills}</div></fieldset>`;
}

/** The seller's promises as a swipeable row of chips under the price. Only what the seller switched on. */
function trustChips(ctx: Ctx): string {
  const { t, theme } = ctx;
  const items = [
    theme.trust.showCodBadge && ["check", t("storefront.studio.cashOnDelivery")],
    theme.trust.showPhoneConfirmationBadge && ["phone", t("storefront.studio.phoneConfirmation")],
    theme.trust.showDeliveryBadge && ["truck", t("storefront.studio.homeDeskDelivery")],
    theme.trust.showSupportBadge && ["headset", t("storefront.studio.sellerSupport")],
  ].filter(Boolean) as Array<["check" | "phone" | "truck" | "headset", string]>;
  if (items.length === 0) return "";
  return `<div class="sf-chips">${items.map(([i, label]) => `<span>${icon(i)}${esc(label)}</span>`).join("")}</div>`;
}

/**
 * A short line for under the name, taken from the seller's own description (nothing is invented).
 * A short description is shown whole; a long one is shown in full under "Details" and its first line leads.
 */
function splitDescription(raw: string): { lead: string; full: string } {
  const text = raw.trim();
  if (!text) return { lead: "", full: "" };
  if (text.length <= 150 && !text.includes("\n")) return { lead: text, full: "" };
  const first = (text.split(/\n+/)[0] ?? "").trim();
  const lead = first.length <= 160 ? first : `${first.slice(0, 160).replace(/\s+\S*$/, "")}…`;
  return { lead, full: text };
}

export type ProductPage = {
  main: string;
  bar: string;
  jsonLd: unknown;
  preload: string | null;
  image: string | null;
};

export function renderProduct(ctx: Ctx, product: ShopProduct): ProductPage {
  const { t, theme, locale, model, slug } = ctx;
  const fees = feeTable(ctx);
  const list = wilayaList(ctx, fees);
  const firstBuyable = product.variants.find((variant) => variant.remaining > 0);
  const current = firstBuyable ?? product.variants[0];
  if (!current) throw new Error("product without variants");
  const sold = product.soldOut;
  const contact = theme.builder.contact;
  const wa = contact.whatsapp ? whatsappDigits(contact.whatsapp) : "";
  const showBar = !sold && theme.checkout.layout !== "inline";

  const i = {
    fix: t("storefront.shop.fixFields"),
    name: t("storefront.view.error.nameRequired"),
    phone: t("storefront.view.error.phoneInvalid"),
    wilaya: t("storefront.shop.chooseWilaya"),
    commune: t("storefront.shop.chooseCommune"),
    address: t("storefront.shop.addressShort"),
    noDelivery: t("storefront.view.error.deliveryUnavailable"),
    sending: t("storefront.view.sending"),
    order: t("storefront.studio.orderNow"),
    many: t("storefront.shop.tooMany"),
    paused: t("storefront.shop.paused"),
    retry: t("storefront.shop.retry"),
    soldNow: t("storefront.shop.soldOutNow"),
    free: t("storefront.view.tier.free"),
    pick: t("storefront.shop.pickFirst"),
    choose: t("storefront.shop.choose"),
    wa: t("storefront.shop.whatsappMessage", { product: "{{product}}", count: "{{count}}", ref: "{{ref}}" }),
    loading: t("storefront.shop.loading"),
  };
  const data = {
    v: 1,
    slug,
    storefrontId: ctx.storefrontId,
    releaseId: ctx.releaseId,
    key: ctx.receiptKey,
    locale,
    tag: localeTag(locale),
    suffix: currencySuffix(locale),
    name: product.name,
    items: product.variants.map((variant) => ({ k: variant.itemKey, l: variant.label, p: variant.price, r: variant.remaining, s: theme.showStock && variant.remaining > 0 && variant.remaining <= 5 ? t("storefront.view.lowStock", { count: variant.remaining }) : "" })),
    fees,
    cdir: ctx.assets.communes,
    wa,
    i,
  };

  const stockNote = sold
    ? `<p class="sf-note sf-note--out" data-sf="stock">${esc(t("storefront.view.landing.soldOut"))}</p>`
    : current.remaining <= 5 && theme.showStock
      ? `<p class="sf-note" data-sf="stock">${esc(t("storefront.view.lowStock", { count: current.remaining }))}</p>`
      : `<p class="sf-note" data-sf="stock" hidden></p>`;

  const price = formatPrice(current.price, locale);
  const modeCard = (mode: "home" | "desk", label: string) =>
    `<label class="sf-mode"><input type="radio" name="mode" value="${mode}"><span class="sf-mode-in"><b>${esc(label)}</b><small data-sf="fee-${mode}">—</small></span></label>`;

  const form = sold
    ? `<div class="sf-form sf-form--out"><p>${esc(t("storefront.view.landing.soldOut"))}</p></div>`
    : `<form id="order" class="sf-form" novalidate autocomplete="on" aria-labelledby="order-title">
<h2 id="order-title" class="sf-h3">${esc(t("storefront.view.completeOrder"))}</h2>
<p class="sf-cod">${icon("check")}<span>${esc(theme.checkout.showCodPromise && theme.checkout.codPromiseText.trim() ? theme.checkout.codPromiseText.trim() : t("storefront.view.landing.codBadge"))}</span></p>
<div class="sf-qty"><span id="qty-label">${esc(t("storefront.view.landing.quantity"))}</span><div class="sf-stepper" role="group" aria-labelledby="qty-label"><button type="button" data-sf="qty-minus" aria-label="${esc(t("storefront.view.decreaseQty"))}">${icon("minus")}</button><output data-sf="qty" aria-live="polite">1</output><button type="button" data-sf="qty-plus" aria-label="${esc(t("storefront.view.increaseQty"))}">${icon("plus")}</button></div></div>
<fieldset class="sf-grp"><legend>${esc(t("storefront.shop.stepContact"))}</legend>
${field("name", t("storefront.view.fullName"), '<input id="f-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="e-name">')}
${field("phone", t("storefront.view.phone"), '<input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" dir="ltr" maxlength="20" placeholder="05 55 12 34 56" required aria-describedby="e-phone">')}
</fieldset>
<fieldset class="sf-grp"><legend>${esc(t("storefront.shop.stepDelivery"))}</legend>
${field("wilaya", t("storefront.view.wilaya"), `<select id="f-wilaya" name="wilaya" autocomplete="address-level1" required aria-describedby="e-wilaya"><option value="">${esc(t("storefront.shop.choose"))}</option>${list.map(([code, label]) => `<option value="${code}">${esc(label)}</option>`).join("")}</select>`)}
${field("commune", t("storefront.view.commune"), `<select id="f-commune" name="commune" autocomplete="address-level2" required disabled aria-describedby="e-commune"><option value="">${esc(t("storefront.shop.choose"))}</option></select>`)}
${field("address", t("storefront.view.address"), '<textarea id="f-address" name="address" rows="2" autocomplete="street-address" maxlength="300" required aria-describedby="e-address"></textarea>', true)}
<fieldset class="sf-modes"><legend>${esc(t("storefront.view.deliveryMode"))}</legend><div class="sf-modes-grid">${modeCard("home", t("storefront.view.deliveryHome"))}${modeCard("desk", t("storefront.view.deliveryDesk"))}</div><p class="sf-err" id="e-mode" hidden></p></fieldset>
${theme.checkout.showOrderNotes ? field("notes", t("storefront.view.notes"), '<textarea id="f-notes" name="notes" rows="2" maxlength="400" aria-describedby="e-notes"></textarea>', true) : ""}
</fieldset>
<dl class="sf-sum" aria-label="${esc(t("storefront.shop.summary"))}"><div><dt>${esc(t("storefront.shop.subtotal"))}</dt><dd data-sf="subtotal">${esc(price)}</dd></div><div><dt>${esc(t("storefront.view.shipping"))}</dt><dd data-sf="shipping">${esc(t("storefront.shop.pickFirst"))}</dd></div><div class="sf-sum-total"><dt>${esc(t("storefront.view.total"))}</dt><dd data-sf="total">${esc(price)}</dd></div></dl>
<div id="sf-status" class="sf-status" role="status" aria-live="polite" hidden></div>
<button id="sf-submit" class="sf-cta" type="submit">${esc(t("storefront.studio.orderNow"))}</button>
<noscript><p class="sf-err">${esc(t("storefront.shop.needJs"))}</p></noscript>
</form>
<section id="sf-thanks" class="sf-thanks" tabindex="-1" hidden aria-labelledby="thanks-title"><div class="sf-thanks-icon">${icon("check")}</div><h2 id="thanks-title" class="sf-h3">${esc(t("storefront.view.orderConfirmed"))}</h2><p>${esc(t("storefront.shop.thanksNext"))}</p><dl class="sf-sum"><div><dt>${esc(t("storefront.view.orderNumber"))}</dt><dd data-sf="ref" dir="ltr"></dd></div><div class="sf-sum-total"><dt>${esc(t("storefront.view.total"))}</dt><dd data-sf="thanks-total"></dd></div></dl>${wa ? `<a id="sf-wa" class="sf-btn sf-btn--wa" href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer">${icon("chat")}${esc(t("storefront.shop.confirmWhatsapp"))}</a>` : ""}<button type="button" class="sf-link" data-sf="again">${esc(t("storefront.view.anotherOrder"))}</button></section>`;

  const others = model.products.filter((other) => other.id !== product.id).slice(0, 4);
  const more = renderRail(ctx, others, t("storefront.view.ourProducts"));
  const extras = theme.builder.composition.sections
    .filter((section) => section.enabled && (section.type === "faq" || section.type === "testimonials"))
    .map((section) => (section.type === "faq" ? renderFaq(ctx, section) : renderTestimonials(ctx, section)))
    .join("");

  const { lead, full } = splitDescription(product.description);
  const sub = lead ? `<p class="sf-sub" dir="auto">${esc(lead)}</p>` : "";
  const details = full
    ? `<details class="sf-more"><summary><span>${esc(t("storefront.shop.details"))}</span>${icon("chevron", "sf-faq-i")}</summary><div class="sf-desc" dir="auto">${esc(full)}</div></details>`
    : "";

  const main = `<article class="sf-pdp" data-sold="${sold ? "1" : "0"}"><div class="sf-wrap sf-pdp-in">
<div class="sf-pdp-media">${gallery(ctx, product)}</div>
<div class="sf-buy"><h1 class="sf-h1 sf-pname" dir="auto">${esc(product.name)}</h1>${sub}${theme.showPrices ? `<p class="sf-price sf-price--lg" data-sf="price">${esc(price)}</p>` : ""}${stockNote}${product.sku && theme.catalog.showSku ? `<p class="sf-sku" dir="ltr">${esc(product.sku)}</p>` : ""}${trustChips(ctx)}${variantPicker(ctx, product, current.itemKey)}${form}
${details}</div>
</div></article>
${extras}${more}${renderContact(ctx, true)}
<script type="application/json" id="sf-data">${JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")}</script>`;

  const thumb = product.images[0]
    ? `<img class="sf-sticky-thumb" ${imgAttrs(product.images[0], "48px", 640)} alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : "";
  const bar = showBar
    ? `<div id="sf-sticky" class="sf-sticky">${thumb}<div class="sf-sticky-price"><small dir="auto">${esc(product.name)}</small><strong data-sf="bar-total">${esc(price)}</strong></div><a id="sf-bar-cta" class="sf-cta sf-cta--bar" href="#order">${esc(t("storefront.studio.orderNow"))}</a></div>`
    : "";

  const base = `${ctx.origin}${productHref(slug, product.id)}`;
  const offer = product.variants.length > 1
    ? { "@type": "AggregateOffer", lowPrice: Math.min(...product.variants.map((v) => v.price)), highPrice: Math.max(...product.variants.map((v) => v.price)), offerCount: product.variants.length, priceCurrency: "DZD" }
    : { "@type": "Offer", price: current.price, priceCurrency: "DZD" };
  const jsonLd = {
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        ...(product.description ? { description: product.description.slice(0, 500) } : {}),
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.images.length > 0 ? { image: product.images } : {}),
        url: base,
        offers: { ...offer, availability: sold ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", url: base, seller: { "@type": "Organization", name: model.name } },
      },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: model.name, item: `${ctx.origin}/${slug}` }, { "@type": "ListItem", position: 2, name: product.name, item: base }] },
    ],
  };

  return { main, bar, jsonLd, preload: product.images[0] ?? null, image: product.images[0] ?? null };
}

export { str };
