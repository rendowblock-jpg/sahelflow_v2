import { describe, expect, it } from "vitest";

import { getDirection } from "../../../src/lib/i18n";
import {
  parseAcceptLanguageLocale,
  parseStorefrontLocale,
} from "../../../src/lib/i18n/storefront-locale";
import { directionOf, parseAcceptLanguage, parsePublicLocale, PUBLIC_LOCALES } from "./locale";

const HEADERS = [
  null,
  undefined,
  "",
  "ar",
  "ar-DZ",
  "fr-DZ,fr;q=0.9,en;q=0.8",
  "en-US,en;q=0.9",
  "en;q=0.5,fr;q=0.5",
  "fr;q=0.5,ar;q=0.5,en;q=0.5",
  "ar,fr",
  "fr,ar",
  "es-ES,it;q=0.9",
  "de",
  "AR-dz;q=0.2, FR;q=0.9",
  "fr;q=abc, ar",
  "*",
  "ar;q=0",
  "en-GB, fr;q=0.8, ar;q=0.8",
  "x".repeat(300),
  ",,,;;;",
];

const VALUES = [null, undefined, "", "ar", "AR", " fr ", "en", "es", "ar-DZ", "arabic"];

describe("hosted page locale rules match the app's buyer-locale authority", () => {
  it.each(HEADERS)("Accept-Language %j", (header) => {
    expect(parseAcceptLanguage(header)).toBe(parseAcceptLanguageLocale(header));
  });

  it.each(VALUES)("explicit value %j", (value) => {
    expect(parsePublicLocale(value)).toBe(parseStorefrontLocale(value));
  });

  it("lists the same three languages and the same direction for each", () => {
    expect([...PUBLIC_LOCALES]).toEqual(["ar", "fr", "en"]);
    for (const locale of PUBLIC_LOCALES) expect(directionOf(locale)).toBe(getDirection(locale));
    expect(directionOf("ar")).toBe("rtl");
  });
});
