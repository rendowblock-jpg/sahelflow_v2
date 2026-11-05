import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { trackingFieldError } from "@/lib/storefront/studio-tracking";
import { getRuntimeTranslation } from "./runtime-translations";
import { getStorefrontTrackingRuntimeTranslation, storefrontTrackingRuntimeEntries } from "./storefront-tracking-runtime";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
const locales = ["en", "fr", "ar"] as const;
const json = (locale: (typeof locales)[number]) =>
  JSON.parse(readFileSync(resolve(process.cwd(), `src/lib/i18n/locales/${locale}.json`), "utf8")) as Record<string, string>;

describe("ad tracking words (ar, fr, en)", () => {
  const entries = storefrontTrackingRuntimeEntries();
  it("has the title, both fields with their helper text, and both errors", () => {
    const keys = entries.map((entry) => entry.key);
    for (const key of [
      "storefront.tracking.title", "storefront.tracking.description",
      "storefront.tracking.meta.label", "storefront.tracking.meta.hint", "storefront.tracking.error.meta",
      "storefront.tracking.tiktok.label", "storefront.tracking.tiktok.hint", "storefront.tracking.error.tiktok",
    ]) expect(keys).toContain(key);
  });
  it.each(entries.map((entry) => [entry.key, entry] as const))("%s is written in all three languages with the same placeholders", (_key, entry) => {
    for (const text of [entry.ar, entry.fr, entry.en]) expect(text.trim().length).toBeGreaterThan(2);
    expect(placeholders(entry.ar)).toBe(placeholders(entry.en));
    expect(placeholders(entry.fr)).toBe(placeholders(entry.en));
    expect(entry.ar).toMatch(/[\u0600-\u06FF]/);
    expect(entry.en).not.toMatch(/[\u0600-\u06FF]/);
  });
  it("is reachable through the app's runtime lookup, and the validator's error keys exist", () => {
    expect(getRuntimeTranslation("fr", "storefront.tracking.title")).toBe("Suivi publicitaire");
    expect(getRuntimeTranslation("en", "storefront.tracking.title")).toBe("Ad tracking");
    expect(getStorefrontTrackingRuntimeTranslation("ar", "storefront.tracking.nope")).toBeUndefined();
    for (const field of ["meta", "tiktok"] as const) {
      const key = trackingFieldError(field, "bad id");
      expect(key).not.toBeNull();
      for (const locale of locales) expect(getRuntimeTranslation(locale, key as string)).toBeTruthy();
    }
  });
  it("has the rail words in the three locale files", () => {
    for (const locale of locales) {
      const words = json(locale);
      for (const key of ["storefront.studio.panels.tracking", "storefront.studio.rail.tracking"]) {
        expect([locale, key, typeof words[key] === "string" && words[key].trim() !== "" && words[key] !== key]).toEqual([locale, key, true]);
      }
    }
  });
});
