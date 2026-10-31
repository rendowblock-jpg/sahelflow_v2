import type { PublicLegal } from "../../shared";
import type { PublicTranslator } from "../translator";

/**
 * The three legal pages of a hosted store (terms, returns, privacy) and the links to them. The words are TEMPLATES built from what
 * the seller wrote in the Studio's Legal panel; nothing here claims legal validity. Seller text is always escaped. Keys are literal on
 * purpose: scripts/storefront-public-build.ts finds the messages the page needs by scanning for them.
 */
export const LEGAL_KINDS = ["terms", "returns", "privacy"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];

export function isLegalKind(value: string): value is LegalKind {
  return (LEGAL_KINDS as readonly string[]).includes(value);
}

export function legalHref(slug: string, kind: LegalKind, query = ""): string {
  return `/${encodeURIComponent(slug)}/legal/${kind}${query}`;
}

export const LEGAL_TITLE_KEY: Record<LegalKind, string> = {
  terms: "storefront.legal.terms.title",
  returns: "storefront.legal.returns.title",
  privacy: "storefront.legal.privacy.title",
};
const SHIPPING_KEY: Record<PublicLegal["returnShipping"], string> = {
  seller: "storefront.legal.returns.shipping.seller",
  buyer: "storefront.legal.returns.shipping.buyer",
  none: "storefront.legal.returns.shipping.none",
};

export type LegalLine = Readonly<{ text: string; own: boolean }>;
export type LegalSection = Readonly<{ heading: string | null; lines: readonly LegalLine[] }>;

const line = (text: string): LegalLine => ({ text, own: false });
function ownLines(text: string | undefined): LegalLine[] {
  return (text ?? "").split(/\r?\n/).map((part) => part.trim()).filter(Boolean).map((part) => ({ text: part, own: true }));
}

function contactSection(contact: Readonly<{ phone: string; whatsapp: string }>, t: PublicTranslator): LegalSection {
  const lines: LegalLine[] = [];
  if (contact.phone) lines.push(line(t("storefront.legal.contact.phone", { value: contact.phone })));
  if (contact.whatsapp) lines.push(line(t("storefront.legal.contact.whatsapp", { value: contact.whatsapp })));
  if (lines.length === 0) lines.push(line(t("storefront.legal.contact.none")));
  return { heading: t("storefront.legal.contact.heading"), lines };
}

/** The sentences of one page, in order. 0 days means the store takes no returns. */
export function legalSections(
  kind: LegalKind,
  legal: PublicLegal,
  contact: Readonly<{ phone: string; whatsapp: string }>,
  t: PublicTranslator,
): LegalSection[] {
  const sections: LegalSection[] = [];
  if (kind === "terms") {
    const lines = [line(t("storefront.legal.terms.seller", { name: legal.sellerName }))];
    if (legal.registerNumber) lines.push(line(t("storefront.legal.terms.register", { number: legal.registerNumber })));
    lines.push(
      line(t("storefront.legal.terms.platform")),
      line(t("storefront.legal.terms.cod")),
      line(t("storefront.legal.terms.delivery")),
      line(t("storefront.legal.terms.confirm")),
    );
    sections.push({ heading: null, lines });
    if (legal.extraTerms) sections.push({ heading: t("storefront.legal.terms.extraHeading"), lines: ownLines(legal.extraTerms) });
  } else if (kind === "returns") {
    sections.push({
      heading: null,
      lines: legal.returnsDays === 0
        ? [line(t("storefront.legal.returns.none"))]
        : [
            line(t("storefront.legal.returns.period", { days: legal.returnsDays })),
            line(t(SHIPPING_KEY[legal.returnShipping])),
            line(t("storefront.legal.returns.how")),
          ],
    });
    if (legal.extraReturns) sections.push({ heading: t("storefront.legal.returns.extraHeading"), lines: ownLines(legal.extraReturns) });
  } else {
    sections.push({
      heading: null,
      lines: [
        line(t("storefront.legal.privacy.collects")),
        line(t("storefront.legal.privacy.seller", { name: legal.sellerName })),
        line(t("storefront.legal.privacy.courier")),
        line(t("storefront.legal.privacy.platform")),
        line(t("storefront.legal.privacy.delete")),
      ],
    });
  }
  sections.push(contactSection(contact, t));
  return sections;
}
