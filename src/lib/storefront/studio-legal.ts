import type { StorefrontLegal } from "./studio-schema";

/**
 * Pure helpers for the hosted store's legal pages (terms, returns, privacy). The texts are TEMPLATES built from what the seller
 * writes; the seller must read them before a release can carry them. Nothing here is legal advice.
 */

/** Raise this when a template sentence changes in a way the seller must read again. */
export const LEGAL_TEMPLATE_VERSION = 1;

export const LEGAL_REVIEW_REQUIRED_MESSAGE = "Published storefront requires the legal texts to be read";

export type LegalFields = Omit<StorefrontLegal, "reviewedFingerprint">;

export type PublicLegal = Readonly<{
  sellerName: string;
  registerNumber?: string;
  returnsDays: number;
  returnShipping: "seller" | "buyer" | "none";
  extraReturns?: string;
  extraTerms?: string;
}>;

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** A short fingerprint of the texts as the buyer will read them (trimmed), so a changed text is a text the seller has not read. */
export function legalFingerprint(legal: LegalFields): string {
  return fnv1a(
    JSON.stringify([
      LEGAL_TEMPLATE_VERSION,
      legal.sellerName.trim(),
      legal.registerNumber.trim(),
      legal.returnsDays,
      legal.returnShipping,
      legal.extraReturns.trim(),
      legal.extraTerms.trim(),
    ]),
  );
}

/** "I read this" is only valid for the exact texts it was pressed on. */
export function isLegalReviewed(legal: StorefrontLegal | undefined): boolean {
  return legal !== undefined && legal.reviewedFingerprint !== "" && legal.reviewedFingerprint === legalFingerprint(legal);
}

export function markLegalReviewed(legal: LegalFields): StorefrontLegal {
  return { ...legal, reviewedFingerprint: legalFingerprint(legal) };
}

/** What the buyer's page may carry: no review marker, no empty optional text. */
export function publicLegalOf(legal: LegalFields): PublicLegal {
  const registerNumber = legal.registerNumber.trim();
  const extraReturns = legal.extraReturns.trim();
  const extraTerms = legal.extraTerms.trim();
  return {
    sellerName: legal.sellerName.trim(),
    ...(registerNumber ? { registerNumber } : {}),
    returnsDays: legal.returnsDays,
    returnShipping: legal.returnShipping,
    ...(extraReturns ? { extraReturns } : {}),
    ...(extraTerms ? { extraTerms } : {}),
  };
}

export type LegalPublishBlock = Readonly<{
  reason: "missing" | "unreviewed";
  messageKey: "storefront.legalPanel.blocked.missing" | "storefront.legalPanel.blocked.unreviewed";
  panel: "legal";
}>;

/** Why Publish must wait, or null. A draft with no legal block at all waits too: every store needs the pages before checkout goes live. */
export function legalPublishBlock(legal: StorefrontLegal | undefined): LegalPublishBlock | null {
  if (legal === undefined) return { reason: "missing", messageKey: "storefront.legalPanel.blocked.missing", panel: "legal" };
  if (!isLegalReviewed(legal)) return { reason: "unreviewed", messageKey: "storefront.legalPanel.blocked.unreviewed", panel: "legal" };
  return null;
}

/** Field errors for the panel, from what the seller has typed so far (the days arrive as text). */
export function legalFieldErrors(input: Readonly<{ sellerName: string; returnsDays: string }>): { sellerName: boolean; returnsDays: boolean } {
  const days = input.returnsDays.trim();
  return {
    sellerName: input.sellerName.trim().length < 1,
    returnsDays: !/^\d{1,2}$/.test(days) || Number(days) > 30,
  };
}
