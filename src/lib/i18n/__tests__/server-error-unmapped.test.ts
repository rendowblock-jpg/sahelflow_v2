import { describe, expect, it } from "vitest";

import ar from "../locales/ar.json";
import en from "../locales/en.json";
import fr from "../locales/fr.json";
import { getRuntimeTranslation } from "../runtime-translations";
import { translateServerError } from "../translate-server-error";

// translateServerError used to hand an UNMAPPED server message to the screen as it came (English developer text for an ar/fr
// seller). Now an unmapped message is replaced by one calm generic sentence in the seller's language. Mapped messages and the
// "Request failed (NNN)" shape keep their existing translations.
type L = "ar" | "fr" | "en";
const TABLES: Record<L, Record<string, string>> = { ar, fr, en };
const tFor = (locale: L) => (key: string) => TABLES[locale][key] ?? getRuntimeTranslation(locale, key) ?? key;

const UNMAPPED: unknown[] = [
  "Cannot read properties of undefined (reading 'id')",
  "Database is locked",
  "Quota exceeded for tenant 7",
  new Error("Prisma exploded: P2002 unique constraint failed on the fields: (`phone`)"),
  { message: "Upstream timeout after 30000 ms" },
  "SQLITE_BUSY: database is locked",
];

describe("translateServerError for a message nobody mapped", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    const t = tFor(locale);
    const generic = getRuntimeTranslation(locale, "firstRun.error.unmapped");

    it(`${locale}: the generic sentence exists and is in the seller's language`, () => {
      expect(generic).toBeTruthy();
      if (locale === "ar") expect(generic).toMatch(/[\u0600-\u06FF]/);
    });

    it(`${locale}: an unmapped message never reaches the screen verbatim`, () => {
      for (const raw of UNMAPPED) {
        const shown = translateServerError(raw, t, "FALLBACK");
        const text = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : (raw as { message: string }).message;
        expect(shown).toBe(generic);
        expect(shown).not.toContain(text);
        expect(shown).not.toBe("FALLBACK");
      }
    });

    it(`${locale}: empty input still uses the caller's fallback, the request-failed shape keeps its mapped sentence`, () => {
      expect(translateServerError(undefined, t, "FALLBACK")).toBe("FALLBACK");
      expect(translateServerError("", t, "FALLBACK")).toBe("FALLBACK");
      // An existing rule already maps this shape to the shared "something went wrong" sentence: unchanged by this slice.
      expect(translateServerError("Request failed (502)", t, "FALLBACK")).toBe(TABLES[locale]["common.error"]);
    });
  }
});
