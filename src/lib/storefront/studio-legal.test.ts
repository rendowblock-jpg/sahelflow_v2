import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { validPublicArtifact } from "../../../control-plane/storefront/shared";
import { oldDraftWithoutLegal, releaseFromDraft } from "./legal-test-fixtures";
import {
  isLegalReviewed,
  legalFieldErrors,
  legalFingerprint,
  legalPublishBlock,
  markLegalReviewed,
  publicLegalOf,
  type LegalFields,
} from "./studio-legal";
import { STOREFRONT_LEGAL_LIMITS, storefrontLegalSchema, storefrontStudioDraftSchema } from "./studio-schema";

const fields = (patch: Partial<LegalFields> = {}): LegalFields => ({
  sellerName: "Amine Boutique",
  registerNumber: "",
  returnsDays: 7,
  returnShipping: "seller",
  extraReturns: "",
  extraTerms: "",
  ...patch,
});
const reviewed = (patch: Partial<LegalFields> = {}) => markLegalReviewed(fields(patch));
const withLegal = (legal: unknown) => ({ ...oldDraftWithoutLegal(), legal });

describe("draft schema", () => {
  it("parses a draft saved before the legal pages and adds no legal key", () => {
    const parsed = storefrontStudioDraftSchema.parse(oldDraftWithoutLegal());
    expect("legal" in parsed).toBe(false);
  });
  it("accepts a legal block and keeps it", () => {
    expect(storefrontStudioDraftSchema.parse(withLegal(reviewed())).legal?.sellerName).toBe("Amine Boutique");
  });
  it.each([
    ["days below 0", { returnsDays: -1 }],
    ["days above 30", { returnsDays: 31 }],
    ["days not whole", { returnsDays: 1.5 }],
    ["empty seller name", { sellerName: "   " }],
    ["unknown shipping payer", { returnShipping: "courier" }],
    ["too long extra terms", { extraTerms: "x".repeat(STOREFRONT_LEGAL_LIMITS.extraTerms + 1) }],
  ])("rejects %s", (_name, patch) => {
    expect(storefrontLegalSchema.safeParse({ ...reviewed(), ...patch }).success).toBe(false);
  });
  it("rejects an unknown key", () => {
    expect(storefrontLegalSchema.safeParse({ ...reviewed(), tax: "x" }).success).toBe(false);
  });
  it("takes 0 and 30 days", () => {
    expect(storefrontLegalSchema.safeParse(reviewed({ returnsDays: 0 })).success).toBe(true);
    expect(storefrontLegalSchema.safeParse(reviewed({ returnsDays: 30 })).success).toBe(true);
  });
});

describe("I read this", () => {
  it("is not given by default", () => {
    expect(isLegalReviewed(undefined)).toBe(false);
    expect(isLegalReviewed({ ...fields(), reviewedFingerprint: "" })).toBe(false);
  });
  it("holds for the texts it was pressed on, trimmed spaces included", () => {
    expect(isLegalReviewed(reviewed())).toBe(true);
    expect(isLegalReviewed({ ...reviewed(), sellerName: "  Amine Boutique " })).toBe(true);
  });
  it.each([
    ["the seller name", { sellerName: "Amine Shop" }],
    ["the days", { returnsDays: 8 }],
    ["who pays", { returnShipping: "buyer" as const }],
    ["the returns text", { extraReturns: "Sealed items only" }],
    ["the terms text", { extraTerms: "No sales on Friday" }],
    ["the register number", { registerNumber: "16/00-1234567" }],
  ])("is lost when %s changes", (_name, patch) => {
    expect(isLegalReviewed({ ...reviewed(), ...patch })).toBe(false);
  });
  it("is not accepted from another version of the texts", () => {
    const other = reviewed({ returnsDays: 14 });
    expect(isLegalReviewed({ ...fields(), reviewedFingerprint: other.reviewedFingerprint })).toBe(false);
    expect(legalFingerprint(fields())).not.toBe(legalFingerprint(fields({ returnsDays: 14 })));
  });
});

describe("what the buyer's artifact carries", () => {
  it("drops the review marker and empty optional texts, and trims", () => {
    const out = publicLegalOf({ ...fields({ sellerName: " Amine ", extraTerms: "  Terms  " }) });
    expect(out).toEqual({ sellerName: "Amine", returnsDays: 7, returnShipping: "seller", extraTerms: "Terms" });
    expect(publicLegalOf(reviewed())).not.toHaveProperty("reviewedFingerprint");
  });
});

describe("publish gate", () => {
  it("waits for a draft with no legal block, and for texts changed after reading", () => {
    expect(legalPublishBlock(undefined)?.reason).toBe("missing");
    expect(legalPublishBlock({ ...reviewed(), returnsDays: 9 })?.reason).toBe("unreviewed");
    expect(legalPublishBlock(reviewed())).toBeNull();
  });
  it("blocks the release when the publish path asks for the review", () => {
    expect(() => releaseFromDraft(oldDraftWithoutLegal(), { requireLegalReview: true })).toThrow(/legal texts/);
    expect(() => releaseFromDraft(withLegal({ ...reviewed(), returnsDays: 9 }), { requireLegalReview: true })).toThrow(/legal texts/);
    expect(() => releaseFromDraft(withLegal({ ...fields(), reviewedFingerprint: "" }), { requireLegalReview: true })).toThrow(/legal texts/);
  });
  it("lets a read draft through, and every other caller as before", () => {
    const input = releaseFromDraft(withLegal(reviewed()), { requireLegalReview: true });
    expect((input.publicArtifact as { legal?: unknown }).legal).toEqual({ sellerName: "Amine Boutique", returnsDays: 7, returnShipping: "seller" });
    expect(() => releaseFromDraft(oldDraftWithoutLegal())).not.toThrow();
  });
  it("field errors for the panel", () => {
    expect(legalFieldErrors({ sellerName: " ", returnsDays: "7" })).toEqual({ sellerName: true, returnsDays: false });
    expect(legalFieldErrors({ sellerName: "A", returnsDays: "31" }).returnsDays).toBe(true);
    expect(legalFieldErrors({ sellerName: "A", returnsDays: "-1" }).returnsDays).toBe(true);
    expect(legalFieldErrors({ sellerName: "A", returnsDays: "" }).returnsDays).toBe(true);
    expect(legalFieldErrors({ sellerName: "A", returnsDays: "0" }).returnsDays).toBe(false);
    expect(legalFieldErrors({ sellerName: "A", returnsDays: "30" }).returnsDays).toBe(false);
  });
});

describe("the cloud's check of the artifact", () => {
  const artifactWith = (legal: unknown) => {
    const input = releaseFromDraft(withLegal(reviewed()));
    return { ...(input.publicArtifact as Record<string, unknown>), legal };
  };
  it("accepts what the Studio publishes", () => {
    const input = releaseFromDraft(withLegal(reviewed({ registerNumber: "RC 1", extraReturns: "a", extraTerms: "b" })));
    expect(parseReleaseInput(input)).not.toBeNull();
  });
  it("still accepts an artifact without legal", () => {
    expect(validPublicArtifact(artifactWith(undefined))).toBe(true);
  });
  const base = { sellerName: "A", returnsDays: 7, returnShipping: "seller" };
  it.each([
    ["days 31", { ...base, returnsDays: 31 }],
    ["days -1", { ...base, returnsDays: -1 }],
    ["days 1.5", { ...base, returnsDays: 1.5 }],
    ["days as text", { ...base, returnsDays: "7" }],
    ["empty name", { ...base, sellerName: "  " }],
    ["unknown payer", { ...base, returnShipping: "x" }],
    ["unknown key", { ...base, reviewedFingerprint: "abc" }],
    ["array", []],
    ["empty optional text", { ...base, extraTerms: "" }],
    ["name 121 characters", { ...base, sellerName: "n".repeat(121) }],
    ["register 61 characters", { ...base, registerNumber: "n".repeat(61) }],
    ["returns text 601 characters", { ...base, extraReturns: "n".repeat(601) }],
    ["terms text 1501 characters", { ...base, extraTerms: "n".repeat(1501) }],
  ])("refuses %s", (_name, legal) => {
    expect(validPublicArtifact(artifactWith(legal))).toBe(false);
  });
  it("keeps the same limits as the Studio schema", () => {
    const L = STOREFRONT_LEGAL_LIMITS;
    expect(validPublicArtifact(artifactWith({ ...base, sellerName: "n".repeat(L.sellerName), registerNumber: "n".repeat(L.registerNumber), extraReturns: "n".repeat(L.extraReturns), extraTerms: "n".repeat(L.extraTerms), returnsDays: L.maxReturnDays }))).toBe(true);
  });
});
