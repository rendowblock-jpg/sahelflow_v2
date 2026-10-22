import { formatPrice } from "./format";
import type { ShopProduct, ShopTheme } from "./model";
import { autoDir, esc, icon, imgAttrs, productHref, type Ctx } from "./ui";

/**
 * The five styles (noir, lumen, atelier, pulse, bloom). Each one is a landing page (one scrollable page that sells one
 * product) or a store (home, catalogue, product pages), chosen by theme.mode. A style differs from the older templates in
 * STRUCTURE, not only in colour: the same facts (photo, name, price, options, delivery, order form) are arranged in five
 * different ways here, and the stylesheet of each style (styles/<id>.css) draws them.
 *
 * Nothing on these pages is invented. Every sentence comes from the seller's product or from the words the Studio already
 * has; every number comes from the release (price, delivery fees, options).
 */
export const STYLE_IDS = ["noir", "lumen", "atelier", "pulse", "bloom"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export function styleOf(theme: ShopTheme): StyleId | null {
  return (STYLE_IDS as readonly string[]).includes(theme.template) ? (theme.template as StyleId) : null;
}

/** True when the seller chose a store with several pages. A style with no mode saved is a landing page. */
export function isStoreMode(theme: ShopTheme): boolean {
  return styleOf(theme) !== null && theme.mode === "store";
}

/** The pieces of a product page, already escaped. The order form and gallery are the same markup in every style (the order script reads them). */
export type ProductParts = {
  product: ShopProduct;
  sold: boolean;
  kicker: string;
  gallery: string;
  name: string;
  sub: string;
  priceEl: string;
  stock: string;
  chips: string;
  variants: string;
  form: string;
  details: string;
  extras: string;
  more: string;
  contact: string;
  data: string;
  sku: string | null;
  feeMin: number | null;
  feeMax: number | null;
};

type Promised = { i: "check" | "phone" | "truck" | "headset"; l: string };

/** What the seller promises, only the badges switched on. */
function promises(ctx: Ctx): Promised[] {
  const { t, theme } = ctx;
  return [
    theme.trust.showPhoneConfirmationBadge && { i: "phone" as const, l: t("storefront.studio.phoneConfirmation") },
    theme.trust.showDeliveryBadge && { i: "truck" as const, l: t("storefront.studio.homeDeskDelivery") },
    theme.trust.showCodBadge && { i: "check" as const, l: t("storefront.studio.cashOnDelivery") },
    theme.trust.showSupportBadge && { i: "headset" as const, l: t("storefront.studio.sellerSupport") },
  ].filter(Boolean) as Promised[];
}

/** The long description is open by default on the pages that tell a story. */
const openDetails = (html: string): string => html.replace('<details class="sf-more">', '<details class="sf-more" open>');

/** The seller's own tagline (the Studio's "eyebrow" field), shown under the name and only when they wrote one. */
const tag = (ctx: Ctx, p: ProductParts): string => (p.kicker ? `<p class="sf-tag"${autoDir(ctx, ctx.theme.hero.eyebrow.trim())}>${p.kicker}</p>` : "");

const cta = (ctx: Ctx, p: ProductParts, cls: string): string =>
  p.sold ? "" : `<a class="${cls}" href="#order"><span>${esc(ctx.t("storefront.studio.orderNow"))}</span>${icon("arrow", "sf-flip")}</a>`;

/* ------------------------------------------------------------------ NOIR: a jeweller's window at night ---- */
function noirProduct(ctx: Ctx, p: ProductParts): string {
  return `<article class="nx" data-sold="${p.sold ? "1" : "0"}">
<section class="nx-stage"><div class="sf-wrap nx-in">
<div class="nx-photo">${p.gallery}</div>
<div class="nx-title"><h1 class="sf-h1 sf-pname"${autoDir(ctx, p.product.name)}>${p.name}</h1>${tag(ctx, p)}${p.sub}</div>
<div class="nx-price">${p.priceEl}${p.stock}</div>
${cta(ctx, p, "nx-cta")}
</div></section>
<section class="nx-ledger"><div class="sf-wrap sf-wrap--narrow sf-rv">${p.chips}${p.variants}${p.details}</div></section>
<section class="nx-order"><div class="sf-wrap sf-wrap--narrow">${p.form}</div></section>
${p.extras}${p.more}${p.contact}
${p.data}</article>`;
}

/* ------------------------------------------------------------------ LUMEN: a lit spec sheet ---- */
function lumenProduct(ctx: Ctx, p: ProductParts): string {
  const { t, locale } = ctx;
  const rows: Array<[string, string]> = [];
  if (p.sku) rows.push(["SKU", `<bdi dir="ltr">${esc(p.sku)}</bdi>`]);
  if (p.feeMin !== null && p.feeMax !== null) {
    const fee = p.feeMin === p.feeMax ? formatPrice(p.feeMin, locale) : `${formatPrice(p.feeMin, locale)} – ${formatPrice(p.feeMax, locale)}`;
    rows.push([t("storefront.view.shipping"), `<bdi>${esc(fee)}</bdi>`]);
  }
  if (p.product.variants.length > 1) rows.push([t("storefront.view.landing.variant"), `<bdi>${p.product.variants.length}</bdi>`]);
  if (ctx.theme.trust.showCodBadge) rows.push([t("storefront.studio.cashOnDelivery"), icon("check")]);
  const spec = rows.length ? `<dl class="lx-spec">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>` : "";
  return `<article class="lx" data-sold="${p.sold ? "1" : "0"}">
<header class="lx-top"><div class="sf-wrap"><h1 class="sf-h1 sf-pname"${autoDir(ctx, p.product.name)}>${p.name}</h1>${tag(ctx, p)}${p.sub}</div></header>
<div class="sf-wrap lx-grid">
<div class="lx-media"><i class="lx-mark" aria-hidden="true"></i>${p.gallery}</div>
<div class="lx-sheet"><div class="lx-price">${p.priceEl}${p.stock}</div>${cta(ctx, p, "lx-cta lx-cta--sheet")}${spec}${p.chips}${p.variants}${p.form}</div>
<div class="lx-notes">${p.details}</div>
</div>
${p.extras}${p.more}${p.contact}
${p.data}</article>`;
}

/* ------------------------------------------------------------------ ATELIER: paper from a workshop ---- */
function atelierProduct(ctx: Ctx, p: ProductParts): string {
  const all = promises(ctx);
  // The three promises that happen in this order (a call to confirm, the delivery, the cash) are numbered; support is not a step.
  const sequence = all.filter((s) => s.i !== "headset");
  const aside = all.filter((s) => s.i === "headset");
  const numbered = sequence.length >= 2;
  const row = (s: Promised, n: number | null) =>
    `<li class="sf-rv">${n === null ? "" : `<b class="ax-n" aria-hidden="true">${n}</b>`}<span class="ax-t">${icon(s.i)}<span${autoDir(ctx, s.l)}>${esc(s.l)}</span></span></li>`;
  const items = [...sequence.map((s, n) => row(s, numbered ? n + 1 : null)), ...aside.map((s) => row(s, null))];
  const list = items.length ? `<section class="ax-steps"><div class="sf-wrap"><ol>${items.join("")}</ol></div></section>` : "";
  return `<article class="ax" data-sold="${p.sold ? "1" : "0"}">
<div class="sf-wrap ax-top"><h1 class="sf-h1 sf-pname ax-name"${autoDir(ctx, p.product.name)}>${p.name}</h1>${tag(ctx, p)}</div>
<div class="sf-wrap ax-collage"><figure class="ax-photo">${p.gallery}<i class="ax-tape" aria-hidden="true"></i></figure><div class="ax-stamp">${p.priceEl}</div>${p.sub ? `<div class="ax-quote">${p.sub}</div>` : ""}<div class="ax-stock">${p.stock}</div>${cta(ctx, p, "ax-cta")}</div>
${p.details ? `<section class="ax-story"><div class="sf-wrap sf-rv">${openDetails(p.details)}</div></section>` : ""}
${list}
<section class="ax-order"><div class="sf-wrap sf-wrap--narrow">${p.variants}${p.form}</div></section>
${p.extras}${p.more}${p.contact}
${p.data}</article>`;
}

/* ------------------------------------------------------------------ PULSE: a drop ---- */
function pulseProduct(ctx: Ctx, p: ProductParts): string {
  const words = promises(ctx).map((s) => s.l);
  if (words.length === 0) words.push(ctx.t("storefront.studio.cashOnDelivery"));
  const set = `<span class="px-set">${words.map((w) => `<span${autoDir(ctx, w)}>${esc(w)}</span>`).join("")}</span>`;
  return `<article class="px" data-sold="${p.sold ? "1" : "0"}">
<div class="px-marquee" aria-hidden="true"><div class="px-track">${set}${set}${set}${set}</div></div>
<section class="sf-wrap px-hero"><h1 class="sf-h1 sf-pname px-giant"${autoDir(ctx, p.product.name)}>${p.name}</h1>${tag(ctx, p)}
<div class="px-row"><div class="px-photo">${p.gallery}</div><div class="px-sticker">${p.priceEl}</div></div>
${p.sub}${p.stock}${cta(ctx, p, "px-cta")}</section>
<section class="sf-wrap sf-wrap--narrow px-order">${p.chips}${p.variants}${p.form}${p.details}</section>
${p.extras}${p.more}${p.contact}
${p.data}</article>`;
}

/* ------------------------------------------------------------------ BLOOM: a ritual ---- */
function bloomProduct(ctx: Ctx, p: ProductParts): string {
  const steps = promises(ctx);
  const ritual = steps.length
    ? `<section class="sf-wrap sf-wrap--narrow bx-ritual"><ol>${steps.map((s) => `<li class="sf-rv"><span class="bx-node">${icon(s.i)}</span><span class="bx-step"${autoDir(ctx, s.l)}>${esc(s.l)}</span></li>`).join("")}</ol></section>`
    : "";
  return `<article class="bx" data-sold="${p.sold ? "1" : "0"}">
<section class="sf-wrap bx-hero"><div class="bx-arch"><i class="bx-halo" aria-hidden="true"></i>${p.gallery}</div>
<div class="bx-intro"><h1 class="sf-h1 sf-pname"${autoDir(ctx, p.product.name)}>${p.name}</h1>${tag(ctx, p)}${p.sub}<div class="bx-price">${p.priceEl}${p.stock}</div>${cta(ctx, p, "bx-cta")}</div></section>
${ritual}
${p.details ? `<section class="sf-wrap sf-wrap--narrow bx-detail sf-rv">${openDetails(p.details)}</section>` : ""}
<section class="sf-wrap sf-wrap--narrow bx-order">${p.variants}${p.form}</section>
${p.extras}${p.more}${p.contact}
${p.data}</article>`;
}

const PRODUCT_FRAMES: Record<StyleId, (ctx: Ctx, p: ProductParts) => string> = {
  noir: noirProduct,
  lumen: lumenProduct,
  atelier: atelierProduct,
  pulse: pulseProduct,
  bloom: bloomProduct,
};

export function frameProduct(style: StyleId, ctx: Ctx, parts: ProductParts): string {
  return PRODUCT_FRAMES[style](ctx, parts);
}

/* ------------------------------------------------------------------ store mode: the home page ---- */
const COVER_SIZES = "(min-width:900px) 40vw, 80vw";

function pic(product: ShopProduct, eager: boolean, cls = ""): string {
  const url = product.images[0];
  if (!url) return `<span class="sf-ph${cls ? ` ${cls}` : ""}" aria-hidden="true">${esc([...product.name.trim()][0]?.toUpperCase() ?? "")}</span>`;
  return `<img${cls ? ` class="${cls}"` : ""} ${imgAttrs(url, COVER_SIZES)} alt="${esc(product.name)}" width="800" height="1000" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`;
}

/** The store's opening section. The seller's words (eyebrow, headline, body, button) when written, the store's name otherwise. */
export function styleHero(style: StyleId, ctx: Ctx, target: string): string {
  const { t, theme, model } = ctx;
  const eyebrow = esc(theme.hero.eyebrow.trim());
  const tagLine = eyebrow ? `<p class="sf-tag"${autoDir(ctx, theme.hero.eyebrow.trim())}>${eyebrow}</p>` : "";
  const headlineText = theme.hero.headline.trim() || model.name;
  const headline = esc(headlineText);
  const bodyText = theme.hero.body.trim() || model.description.trim();
  const body = bodyText ? `<p class="sf-lead"${autoDir(ctx, bodyText)}>${esc(bodyText)}</p>` : "";
  const label = esc(theme.hero.ctaLabel.trim() || t("storefront.view.navProducts"));
  const withPic = model.products.filter((product) => product.images[0]);
  const count = esc(t("storefront.view.productsCount", { count: model.products.length }));
  const go = (cls: string) => `<a class="${cls}" href="${target}"><span>${label}</span>${icon("arrow", "sf-flip")}</a>`;
  const first = withPic[0];

  switch (style) {
    case "noir":
      return `<section class="nx-cover"><div class="sf-wrap nx-in">${first ? `<div class="nx-orb">${pic(first, true)}</div>` : ""}<h1 class="sf-h1 nx-brand"${autoDir(ctx, headlineText)}>${headline}</h1>${tagLine}${body}${go("nx-cta")}</div></section>`;
    case "lumen":
      return `<section class="lx-cover"><div class="sf-wrap"><h1 class="sf-h1 lx-brand"${autoDir(ctx, headlineText)}>${headline}</h1>${tagLine}<div class="lx-meta">${body}<span class="lx-count">${count}</span></div>${go("lx-cta")}</div></section>`;
    case "atelier":
      return `<section class="ax-cover"><div class="sf-wrap ax-cover-in"><div class="ax-cover-text"><h1 class="sf-h1 ax-brand"${autoDir(ctx, headlineText)}>${headline}</h1>${tagLine}${body}${go("ax-cta")}</div><div class="ax-cover-pics">${withPic.slice(0, 2).map((product, index) => `<figure class="ax-piece ax-piece--${index + 1}">${pic(product, index === 0)}</figure>`).join("")}</div></div></section>`;
    case "pulse": {
      const words = promises(ctx).map((s) => s.l);
      if (words.length === 0) words.push(t("storefront.studio.cashOnDelivery"));
      const set = `<span class="px-set">${words.map((w) => `<span${autoDir(ctx, w)}>${esc(w)}</span>`).join("")}</span>`;
      return `<section class="px-cover"><div class="px-marquee" aria-hidden="true"><div class="px-track">${set}${set}${set}${set}</div></div><div class="sf-wrap px-cover-in"><h1 class="sf-h1 px-giant"${autoDir(ctx, headlineText)}>${headline}</h1>${tagLine}<span class="px-sticker px-sticker--count">${count}</span>${body}${go("px-cta")}</div></section>`;
    }
    case "bloom":
      return `<section class="bx-cover"><div class="sf-wrap bx-cover-in"><h1 class="sf-h1 bx-brand"${autoDir(ctx, headlineText)}>${headline}</h1>${tagLine}${body}<div class="bx-bouquet" aria-hidden="${withPic.length ? "false" : "true"}">${withPic.slice(0, 3).map((product, index) => `<figure class="bx-bloom bx-bloom--${index + 1}">${pic(product, index === 0)}</figure>`).join("")}</div>${go("bx-cta")}</div></section>`;
  }
}

/** Lumen lists its catalogue as an index (number, thumbnail, name, price, arrow) instead of cards. */
export function lumenIndex(ctx: Ctx, products: readonly ShopProduct[], title: string, id: string): string {
  const { t, theme, locale } = ctx;
  if (products.length === 0) {
    return `<section class="sf-sec" id="${id}"><div class="sf-wrap"><h2 class="sf-h2">${esc(title)}</h2><p class="sf-muted">${esc(t("storefront.view.noProducts"))}</p></div></section>`;
  }
  const rows = products.map((product, index) => {
    const url = product.images[0];
    const thumb = url
      ? `<img ${imgAttrs(url, "72px", 640)} alt="" width="72" height="72" ${index < 4 ? 'loading="eager"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`
      : `<span class="sf-ph" aria-hidden="true">${esc([...product.name.trim()][0]?.toUpperCase() ?? "")}</span>`;
    const price = theme.showPrices
      ? `<span class="lx-row-price">${esc(product.variants.length > 1 ? t("storefront.shop.from", { price: formatPrice(product.from, locale) }) : formatPrice(product.from, locale))}</span>`
      : "";
    const out = product.soldOut ? `<small class="lx-row-out">${esc(t("storefront.view.outOfStock"))}</small>` : "";
    const sku = theme.catalog.showSku && product.sku ? `<small dir="ltr">${esc(product.sku)}</small>` : "";
    return `<li class="sf-rv"><a class="lx-row" href="${esc(productHref(ctx.slug, product.id))}"><span class="lx-row-n" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span class="lx-row-pic">${thumb}</span><span class="lx-row-name"><b${autoDir(ctx, product.name)}>${esc(product.name)}</b>${sku}${out}</span>${price}${icon("arrow", "sf-flip lx-row-go")}</a></li>`;
  });
  return `<section class="sf-sec" id="${id}"><div class="sf-wrap"><div class="sf-sec-head sf-rv"><h2 class="sf-h2"${autoDir(ctx, title)}>${esc(title)}</h2><span class="sf-muted">${esc(t("storefront.view.productsCount", { count: products.length }))}</span></div><ol class="lx-index">${rows.join("")}</ol></div></section>`;
}

/**
 * What the header adds for a style. A store gets two links (catalogue, contact); a landing page gets one button that
 * jumps to the order form. Older templates get nothing here, so their pages stay byte for byte what they were.
 */
export function headExtra(ctx: Ctx, product: ShopProduct | undefined): string {
  const { t, theme, slug } = ctx;
  if (styleOf(theme) === null) return "";
  if (isStoreMode(theme)) {
    const contact = theme.builder.contact;
    const hasContact = Boolean(contact.phone || contact.whatsapp || contact.email || contact.address);
    const link = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;
    return `<nav class="sf-nav" aria-label="${esc(t("storefront.view.navProducts"))}">${link(`/${slug}#catalog`, t("storefront.view.navProducts"))}${hasContact ? link(`/${slug}#contact`, t("storefront.view.navContact")) : ""}</nav>`;
  }
  if (!product || product.soldOut) return "";
  return `<a class="sf-hcta" href="#order">${esc(t("storefront.studio.orderNow"))}</a>`;
}
