import { describe, expect, it } from "vitest";

import { getStorefrontLegalRuntimeTranslation, storefrontLegalRuntimeEntries } from "./storefront-legal-runtime";
import { getRuntimeTranslation } from "./runtime-translations";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");

describe("legal words (ar, fr, en)", () => {
  const entries = storefrontLegalRuntimeEntries();
  it("has the pages, the footer, the notice and the panel", () => {
    expect(entries.length).toBeGreaterThanOrEqual(55);
    for (const prefix of ["storefront.legal.terms.", "storefront.legal.returns.", "storefront.legal.privacy.", "storefront.legal.link.", "storefront.public.legalNotFound", "storefront.legalPanel."]) {
      expect(entries.some((entry) => entry.key.startsWith(prefix))).toBe(true);
    }
  });
  it.each(entries.map((entry) => [entry.key, entry] as const))("%s is written in all three languages with the same placeholders", (_key, entry) => {
    for (const text of [entry.ar, entry.fr, entry.en]) expect(text.trim().length).toBeGreaterThan(2);
    expect(placeholders(entry.ar)).toBe(placeholders(entry.en));
    expect(placeholders(entry.fr)).toBe(placeholders(entry.en));
    expect(entry.ar).toMatch(/[\u0600-\u06FF]/);
    expect(entry.en).not.toMatch(/[\u0600-\u06FF]/);
  });
  it("is reachable through the app's runtime lookup", () => {
    expect(getRuntimeTranslation("fr", "storefront.legal.link.returns")).toBe("Retours");
    expect(getStorefrontLegalRuntimeTranslation("ar", "storefront.legal.nope")).toBeUndefined();
  });
});
