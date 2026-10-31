import { escapeHtml } from "./html";
import { directionOf, type PublicLocale } from "./locale";
import { productHref } from "./shop/ui";
import { createPublicTranslator } from "./translator";

export type NoticeKind = "notFound" | "productNotFound" | "legalNotFound" | "paused" | "error";

// Literal keys on purpose: scripts/storefront-public-build.ts finds the messages
// the page needs by scanning for them.
const COPY: Record<NoticeKind, { title: string; body: string; exit: string }> = {
  notFound: { title: "storefront.public.notFoundTitle", body: "storefront.public.notFoundBody", exit: "storefront.public.exitProducts" },
  productNotFound: { title: "storefront.public.productNotFoundTitle", body: "storefront.public.productNotFoundBody", exit: "storefront.public.exitProducts" },
  legalNotFound: { title: "storefront.public.legalNotFoundTitle", body: "storefront.public.legalNotFoundBody", exit: "storefront.public.exitProducts" },
  paused: { title: "storefront.public.pausedTitle", body: "storefront.public.pausedBody", exit: "storefront.public.exitRecheck" },
  error: { title: "storefront.public.errorTitle", body: "storefront.public.errorBody", exit: "storefront.public.exitReload" },
};

/**
 * The one way out of a notice, as a path on this host: a missing product and a paused store go to the shop's own home,
 * a failed page reloads itself. A store that does not exist has none: the Worker has no marketing-site address in its
 * configuration, and one is not invented here.
 */
export function noticeExit(kind: NoticeKind, slug: string | null, productId: string | null, lang: PublicLocale | null, legalKind: string | null = null): string | null {
  if (kind === "notFound" || !slug) return null;
  const query = lang ? `?lang=${lang}` : "";
  if (kind === "error" && legalKind) return `/${encodeURIComponent(slug)}/legal/${encodeURIComponent(legalKind)}${query}`;
  if (kind === "error" && productId) return `${productHref(slug, productId)}${query}`;
  return `/${encodeURIComponent(slug)}${query}`;
}

/**
 * A small page for a store that is missing, paused, or failed to render. Plain
 * HTML and no React: these pages must never fail for the same reason the store
 * page did.
 */
export function renderNoticePage(input: { locale: PublicLocale; kind: NoticeKind; cssPath: string; exitHref?: string | null }): string {
  const t = createPublicTranslator(input.locale);
  const title = t(COPY[input.kind].title);
  const body = t(COPY[input.kind].body);
  const exit = input.exitHref ? `\n<a class="sf-notice-link" href="${escapeHtml(input.exitHref)}">${escapeHtml(t(COPY[input.kind].exit))}</a>` : "";
  return `<!doctype html>
<html lang="${input.locale}" dir="${directionOf(input.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${escapeHtml(input.cssPath)}">
</head>
<body style="margin:0">
<main class="sf-notice" data-storefront-locale="${input.locale}">
<div>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>${exit}
</div>
</main>
</body>
</html>`;
}
