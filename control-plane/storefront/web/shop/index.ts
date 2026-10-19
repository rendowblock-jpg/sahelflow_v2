import { directionOf } from "../locale";
import { createPublicTranslator } from "../translator";
import type { RenderStorePage } from "../types";
import { documentShell } from "./layout";
import { buildShopModel } from "./model";
import { renderHome } from "./home";
import { renderProduct } from "./product";
import { productHref, type Ctx } from "./ui";

/**
 * The full HTML document of a published store page, as a string. No framework runs
 * here: the page is plain string assembly, so a render costs well under a millisecond
 * of Worker CPU and the browser receives only the markup, one stylesheet and (on a
 * product page) one small script.
 *
 * Returns null when the page asks for a product the release does not contain.
 */
export const renderStorePage: RenderStorePage = (input) => {
  const model = buildShopModel(input.artifact, input.stock);
  const t = createPublicTranslator(input.locale);
  // A store with exactly one product is an ad landing page: its home IS the product page.
  const single = model.products.length === 1 ? model.products[0] : undefined;
  const product = input.productId
    ? model.products.find((candidate) => candidate.id === input.productId)
    : single;
  if (input.productId && !product) return null;

  const path = input.productId && product ? productHref(input.slug, product.id) : `/${input.slug}`;
  // A one-product store has one address for that page: its home.
  const canonicalPath = single && product ? `/${input.slug}` : path;
  const ctx: Ctx = {
    t,
    locale: input.locale,
    dir: directionOf(input.locale),
    origin: input.origin,
    slug: input.slug,
    path,
    model,
    theme: model.theme,
    assets: input.assets,
    storefrontId: input.storefrontId,
    releaseId: input.releaseId,
    receiptKey: input.receiptKey,
    shipping: input.shipping,
  };

  const seo = model.theme.builder.seo;
  const robots = seo.noIndex ? "noindex, nofollow" : "index, follow";
  const query = input.locale === input.defaultLocale ? "" : `?lang=${input.locale}`;
  const strip = (value: string) => value.replace(/[\u2066-\u2069]/g, "");

  if (product) {
    const page = renderProduct(ctx, product);
    const title = single && !input.productId
      ? seo.title.trim() || `${product.name} — ${model.name}`
      : `${product.name} — ${model.name}`;
    const description = product.description
      ? product.description.replace(/\s+/g, " ").slice(0, 160)
      : seo.description.trim() || model.description.trim() || strip(t("storefront.public.metaFallback", { name: model.name }));
    return documentShell(ctx, {
      title,
      description,
      canonical: `${canonicalPath}${query}`,
      robots,
      image: page.image,
      preload: page.preload,
      jsonLd: page.jsonLd,
      script: true,
      bodyAttrs: `data-page="product"${page.bar ? " data-sticky" : ""}`,
      main: page.main,
      bar: page.bar,
      tagline: "",
    });
  }

  const home = renderHome(ctx);
  const firstImage = model.products.find((candidate) => candidate.images[0])?.images[0] ?? null;
  const base = `${input.origin}/${input.slug}`;
  return documentShell(ctx, {
    title: seo.title.trim() || model.name,
    description: seo.description.trim() || model.description.trim() || strip(t("storefront.public.metaFallback", { name: model.name })),
    canonical: `${path}${query}`,
    robots,
    image: seo.socialImageUrl ?? firstImage,
    preload: null,
    jsonLd: {
      "@graph": [
        {
          "@type": "Store",
          "@id": `${base}#store`,
          name: model.name,
          url: base,
          ...(model.theme.builder.contact.phone ? { telephone: model.theme.builder.contact.phone } : {}),
          ...(model.theme.builder.contact.address ? { address: model.theme.builder.contact.address } : {}),
        },
      ],
    },
    script: false,
    bodyAttrs: 'data-page="home"',
    main: home.main,
    tagline: home.tagline,
  });
};
