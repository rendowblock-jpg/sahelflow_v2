import { escapeHtml } from "./html";
import { directionOf, type PublicLocale } from "./locale";
import { createPublicTranslator } from "./translator";

export type NoticeKind = "notFound" | "paused" | "error";

// Literal keys on purpose: scripts/storefront-public-build.ts finds the messages
// the page needs by scanning for them.
const COPY: Record<NoticeKind, { title: string; body: string }> = {
  notFound: { title: "storefront.public.notFoundTitle", body: "storefront.public.notFoundBody" },
  paused: { title: "storefront.public.pausedTitle", body: "storefront.public.pausedBody" },
  error: { title: "storefront.public.errorTitle", body: "storefront.public.errorBody" },
};

/**
 * A small page for a store that is missing, paused, or failed to render. Plain
 * HTML and no React: these pages must never fail for the same reason the store
 * page did.
 */
export function renderNoticePage(input: { locale: PublicLocale; kind: NoticeKind; cssPath: string }): string {
  const t = createPublicTranslator(input.locale);
  const title = t(COPY[input.kind].title);
  const body = t(COPY[input.kind].body);
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
<p>${escapeHtml(body)}</p>
</div>
</main>
</body>
</html>`;
}
