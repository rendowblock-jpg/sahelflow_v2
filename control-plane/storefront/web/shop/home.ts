import { formatPrice } from "./format";
import { esc, httpsUrl, icon, imgAttrs, productHref, str, transitionName, whatsappDigits, type Ctx } from "./ui";
import type { ShopProduct, ShopSection } from "./model";

const RATIO_SIZE = { portrait: [800, 1000], square: [800, 800], landscape: [800, 600] } as const;

const CARD_SIZES = "(min-width:1040px) 25vw, (min-width:720px) 33vw, 50vw";
const HERO_SIZES = "(min-width:900px) 45vw, 92vw";

function image(ctx: Ctx, url: string, alt: string, eager: boolean, sizes: string = CARD_SIZES): string {
  const [w, h] = RATIO_SIZE[ctx.theme.catalog.imageRatio];
  return `<img ${imgAttrs(url, sizes)} alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer">`;
}

/** One product card. In a grid it fades in as it scrolls into view; in a rail (a horizontal scroller) it does not. */
export function renderCard(ctx: Ctx, product: ShopProduct, index: number, mode: "grid" | "rail" = "grid"): string {
  const { t, theme, locale } = ctx;
  const url = product.images[0];
  const low = !product.soldOut && product.remaining <= 5 && theme.showStock;
  const badge = product.soldOut
    ? `<span class="sf-badge sf-badge--dark">${esc(t("storefront.view.outOfStock"))}</span>`
    : low
      ? `<span class="sf-badge">${esc(t("storefront.view.lowStock", { count: product.remaining }))}</span>`
      : "";
  const price = theme.showPrices
    ? `<p class="sf-price">${product.variants.length > 1 ? esc(t("storefront.shop.from", { price: formatPrice(product.from, locale) })) : esc(formatPrice(product.from, locale))}</p>`
    : "";
  const sku = theme.catalog.showSku && product.sku ? `<p class="sf-sku" dir="ltr">${esc(product.sku)}</p>` : "";
  const vt = transitionName(ctx, product.id);
  const picture = url
    ? image(ctx, url, product.name, false).replace('loading="lazy"', index < 2 ? 'loading="eager"' : 'loading="lazy"')
    : `<span class="sf-ph" aria-hidden="true">${esc([...product.name.trim()][0]?.toUpperCase() ?? "")}</span>`;
  return `<li${mode === "grid" ? ' class="sf-rv"' : ""}><a class="sf-card" href="${esc(productHref(ctx.slug, product.id))}"><div class="sf-media"${vt ? ` style="view-transition-name:${vt}"` : ""}>${picture}${badge}</div><div class="sf-card-body"><h3 dir="auto">${esc(product.name)}</h3>${sku}${price}<span class="sf-card-cta">${esc(t("storefront.studio.orderNow"))}${icon("arrow", "sf-flip")}</span></div></a></li>`;
}

export function renderGrid(ctx: Ctx, products: readonly ShopProduct[], title: string, id?: string): string {
  const { t } = ctx;
  if (products.length === 0) {
    return `<section class="sf-sec"${id ? ` id="${id}"` : ""}><div class="sf-wrap"><h2 class="sf-h2">${esc(title)}</h2><p class="sf-muted">${esc(t("storefront.view.noProducts"))}</p></div></section>`;
  }
  return `<section class="sf-sec"${id ? ` id="${id}"` : ""}><div class="sf-wrap"><div class="sf-sec-head sf-rv"><h2 class="sf-h2" dir="auto">${esc(title)}</h2><span class="sf-muted">${esc(t("storefront.view.productsCount", { count: products.length }))}</span></div><ul class="sf-grid">${products.map((product, index) => renderCard(ctx, product, index)).join("")}</ul></div></section>`;
}

/** A swipeable row of products with the next card peeking in. */
export function renderRail(ctx: Ctx, products: readonly ShopProduct[], title: string): string {
  if (products.length === 0) return "";
  return `<section class="sf-sec"><div class="sf-wrap"><div class="sf-sec-head sf-rv"><h2 class="sf-h2" dir="auto">${esc(title)}</h2></div><ul class="sf-rail">${products.map((product, index) => renderCard(ctx, product, index, "rail")).join("")}</ul></div></section>`;
}

function renderHero(ctx: Ctx, target: string): string {
  const { t, theme, model, locale } = ctx;
  const style = theme.hero.style;
  const eyebrow = theme.hero.eyebrow.trim() || (style === "centered" ? t("storefront.studio.payOnDelivery") : t("storefront.studio.algeriaCod"));
  const headline = theme.hero.headline.trim() || model.name;
  const body = theme.hero.body.trim() || model.description;
  const cta = theme.hero.ctaLabel.trim() || (style === "centered" ? t("storefront.studio.orderNow") : t("storefront.studio.shopNow"));
  const text = `<div class="sf-hero-text"><p class="sf-eyebrow" dir="auto">${esc(eyebrow)}</p><h1 class="sf-h1" dir="auto">${esc(headline)}</h1>${body ? `<p class="sf-lead" dir="auto">${esc(body)}</p>` : ""}<a class="sf-btn" href="${target}">${esc(cta)}${icon("arrow", "sf-flip")}</a></div>`;
  const withPicture = model.products.filter((product) => product.images[0]);
  const pics = withPicture.slice(0, style === "editorial" ? 3 : 1);
  const first = withPicture[0];
  const chip = style === "split" && theme.showPrices && first
    ? `<span class="sf-chip-price">${esc(t("storefront.shop.from", { price: formatPrice(first.from, locale) }))}</span>`
    : "";
  const media = pics.length === 0
    ? `<div class="sf-hero-media sf-hero-ph" aria-hidden="true"></div>`
    : `<div class="sf-hero-media" data-count="${pics.length}">${pics.map((product, index) => `<div class="sf-hero-pic">${image(ctx, product.images[0] as string, product.name, index === 0, HERO_SIZES)}</div>`).join("")}${chip}</div>`;
  const blobs = style === "centered" ? '<span class="sf-blob sf-blob--a" aria-hidden="true"></span><span class="sf-blob sf-blob--b" aria-hidden="true"></span>' : "";
  return `<section class="sf-hero" data-style="${style}">${blobs}<div class="sf-wrap sf-hero-in">${text}${media}</div></section>`;
}

function renderTrust(ctx: Ctx): string {
  const { t, theme } = ctx;
  const badges = [
    theme.trust.showCodBadge && { i: "check" as const, l: t("storefront.studio.cashOnDelivery") },
    theme.trust.showPhoneConfirmationBadge && { i: "phone" as const, l: t("storefront.studio.phoneConfirmation") },
    theme.trust.showDeliveryBadge && { i: "truck" as const, l: t("storefront.studio.homeDeskDelivery") },
    theme.trust.showSupportBadge && { i: "headset" as const, l: t("storefront.studio.sellerSupport") },
  ].filter(Boolean) as Array<{ i: "check" | "phone" | "truck" | "headset"; l: string }>;
  if (badges.length === 0) return "";
  return `<section class="sf-sec sf-sec--tight"><div class="sf-wrap sf-rv"><ul class="sf-trust">${badges.map((b) => `<li><span class="sf-chip">${icon(b.i)}</span><span>${esc(b.l)}</span></li>`).join("")}</ul></div></section>`;
}

function renderMedia(ctx: Ctx, section: ShopSection): string {
  const eyebrow = str(section.settings.eyebrow);
  const title = str(section.settings.title);
  const body = str(section.settings.body);
  const url = httpsUrl(section.settings.imageUrl);
  if (!(eyebrow || title || body || url)) return "";
  const alt = str(section.settings.imageAlt) || title || ctx.model.name;
  const end = str(section.settings.align) === "media-end";
  return `<section class="sf-sec"><div class="sf-wrap sf-rv"><div class="sf-panel${url ? " sf-panel--media" : ""}${end ? " sf-panel--end" : ""}">${url ? `<div class="sf-panel-pic"><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></div>` : ""}<div class="sf-panel-text">${eyebrow ? `<p class="sf-eyebrow" dir="auto">${esc(eyebrow)}</p>` : ""}${title ? `<h2 class="sf-h2" dir="auto">${esc(title)}</h2>` : ""}${body ? `<p class="sf-body" dir="auto">${esc(body)}</p>` : ""}</div></div></div></section>`;
}

function renderTestimonials(ctx: Ctx, section: ShopSection): string {
  const entries = section.blocks.filter((block) => str(block.settings.quote));
  if (entries.length === 0) return "";
  const title = str(section.settings.title) || ctx.t("storefront.view.reviewsTitle");
  return `<section class="sf-sec"><div class="sf-wrap"><h2 class="sf-h2 sf-rv" dir="auto">${esc(title)}</h2><div class="sf-quotes">${entries.map((entry) => {
    const name = str(entry.settings.name);
    const role = str(entry.settings.role);
    return `<figure class="sf-quote"><blockquote dir="auto">${esc(str(entry.settings.quote))}</blockquote>${name ? `<figcaption><b dir="auto">${esc(name)}</b>${role ? ` <span class="sf-muted" dir="auto">${esc(role)}</span>` : ""}</figcaption>` : ""}</figure>`;
  }).join("")}</div></div></section>`;
}

function renderFaq(ctx: Ctx, section: ShopSection): string {
  const entries = section.blocks.filter((block) => str(block.settings.question) && str(block.settings.answer));
  if (entries.length === 0) return "";
  const title = str(section.settings.title) || ctx.t("storefront.view.faqTitle");
  return `<section class="sf-sec"><div class="sf-wrap sf-wrap--narrow sf-rv"><h2 class="sf-h2" dir="auto">${esc(title)}</h2><div class="sf-faq">${entries.map((entry) => `<details><summary dir="auto"><span>${esc(str(entry.settings.question))}</span>${icon("chevron", "sf-faq-i")}</summary><p dir="auto">${esc(str(entry.settings.answer))}</p></details>`).join("")}</div></div></section>`;
}

export function renderContact(ctx: Ctx, heading: boolean): string {
  const { t, theme } = ctx;
  const c = theme.builder.contact;
  const tiles: string[] = [];
  const tile = (i: "phone" | "chat" | "mail" | "pin", label: string, value: string, href?: string, ltr = true, ext = false) => {
    const inner = `<span class="sf-chip">${icon(i)}</span><span class="sf-tile-text"><small>${esc(label)}</small><b${ltr ? ' dir="ltr"' : ' dir="auto"'}>${esc(value)}</b></span>`;
    tiles.push(href ? `<a class="sf-tile" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}</a>` : `<div class="sf-tile">${inner}</div>`);
  };
  if (c.phone) tile("phone", t("storefront.view.callUs"), c.phone, `tel:${c.phone.replace(/\s/g, "")}`);
  if (c.whatsapp) tile("chat", t("storefront.view.whatsappUs"), c.whatsapp, `https://wa.me/${whatsappDigits(c.whatsapp)}`, true, true);
  if (c.email) tile("mail", t("storefront.view.emailUs"), c.email, `mailto:${c.email}`);
  if (c.address) tile("pin", t("storefront.view.visitUs"), c.address, undefined, false);
  if (tiles.length === 0) return "";
  return `<section class="sf-sec" id="contact"><div class="sf-wrap sf-rv">${heading ? `<h2 class="sf-h2">${esc(t("storefront.view.contactTitle"))}</h2>` : ""}<div class="sf-tiles">${tiles.join("")}</div></div></section>`;
}

/** The store's home: the seller's sections in the seller's order. */
export function renderHome(ctx: Ctx): { main: string; tagline: string } {
  const { theme, model, t } = ctx;
  const sections = theme.builder.composition.sections.filter((section) => section.enabled);
  const parts: string[] = [];
  let tagline = "";
  for (const section of sections) {
    switch (section.type) {
      case "hero":
        if (theme.hero.enabled) parts.push(renderHero(ctx, "#catalog"));
        break;
      case "trust":
        parts.push(renderTrust(ctx));
        break;
      case "featured-products":
        parts.push(renderRail(ctx, model.products.slice(0, 4), str(section.settings.title) || t("storefront.view.navProducts")));
        break;
      case "product-grid":
        parts.push(renderGrid(ctx, model.products, str(section.settings.title) || t("storefront.view.navProducts"), "catalog"));
        break;
      case "media":
        parts.push(renderMedia(ctx, section));
        break;
      case "testimonials":
        parts.push(renderTestimonials(ctx, section));
        break;
      case "faq":
        parts.push(renderFaq(ctx, section));
        break;
      case "support":
        parts.push(renderContact(ctx, true));
        break;
      case "footer":
        tagline = str(section.settings.tagline);
        break;
      default:
        break; // announcement and navbar are page chrome; categories and cod-checkout have no public home
    }
  }
  return { main: parts.join("\n"), tagline };
}

export { renderFaq, renderTestimonials, renderMedia, renderTrust };
