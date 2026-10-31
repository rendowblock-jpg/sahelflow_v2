import type { PublicLegal } from "../../shared";
import { LEGAL_KINDS, LEGAL_TITLE_KEY, isLegalKind, legalHref, legalSections, type LegalKind } from "./legal-text";
import { autoDir, esc, str, type Ctx } from "./ui";

export { LEGAL_KINDS, isLegalKind, legalHref, legalSections, type LegalKind };

/** The footer and order-line links; the words of the pages themselves are in legal-text.ts (the Studio shows the same sentences). */
const LINK_KEY: Record<LegalKind, string> = {
  terms: "storefront.legal.link.terms",
  returns: "storefront.legal.link.returns",
  privacy: "storefront.legal.link.privacy",
};

export function renderLegalPage(ctx: Ctx, kind: LegalKind, legal: PublicLegal): { title: string; main: string } {
  const title = ctx.t(LEGAL_TITLE_KEY[kind]);
  const contact = { phone: str(ctx.model.theme.builder.contact.phone).trim(), whatsapp: str(ctx.model.theme.builder.contact.whatsapp).trim() };
  const body = legalSections(kind, legal, contact, ctx.t)
    .map((section) => {
      const heading = section.heading ? `<h2>${esc(section.heading)}</h2>` : "";
      const lines = section.lines.map((entry) => `<p${entry.own ? autoDir(ctx, entry.text) : ""}>${esc(entry.text)}</p>`).join("");
      return `<section>${heading}${lines}</section>`;
    })
    .join("\n");
  const main = `<article class="sf-wrap" data-legal-page="${kind}" aria-labelledby="legal-title" style="padding-block:32px 8px"><h1 id="legal-title">${esc(title)}</h1>\n${body}\n</article>`;
  return { title, main };
}

// A link must be a 44 px target: the stylesheet's .sf-link gives the height, the inline style makes an <a> honour it (shop.css is not touched by this track).
const LINK_STYLE = "display:inline-flex;align-items:center";

function linkTo(ctx: Ctx, kind: LegalKind, query: string): string {
  return `<a class="sf-link" style="${LINK_STYLE}" href="${esc(legalHref(ctx.slug, kind, query))}">${esc(ctx.t(LINK_KEY[kind]))}</a>`;
}

/** The footer's three links. `query` is "" or "?lang=xx", as for the other links of the page. */
export function legalNav(ctx: Ctx, query: string): string {
  const links = LEGAL_KINDS.map((kind) => linkTo(ctx, kind, query)).join("");
  return `<nav class="sf-legal-nav" aria-label="${esc(ctx.t("storefront.legal.nav.label"))}" style="display:flex;flex-wrap:wrap;justify-content:center;gap:0 4px">${links}</nav>`;
}

/** The line under the order button: no checkbox, only the two links the buyer accepts by ordering. */
export function legalOrderLine(ctx: Ctx, query: string): string {
  return `<p class="sf-legal-line" style="margin:8px 0 0;font-size:13px;text-align:center">${esc(ctx.t("storefront.legal.orderLine"))} ${linkTo(ctx, "terms", query)} ${linkTo(ctx, "returns", query)}</p>`;
}
