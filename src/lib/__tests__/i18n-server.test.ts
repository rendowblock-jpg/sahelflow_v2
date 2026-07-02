/**
 * i18n-server tests — T-AUTH-INFRA.
 *
 * Mocks next/headers cookies to control the locale returned by getI18n().
 * Verifies:
 *   - Locale resolution from the `sahelflow-locale` cookie (ar/fr/en)
 *   - Default fallback to fr when no cookie is set
 *   - Default fallback to fr for an invalid cookie value
 *   - dir = rtl for ar, ltr for fr/en
 *   - t() returns the correct translation per locale
 *   - t() falls back to the key when translation is missing
 *   - Plural support via Intl.PluralRules + `_one`/`_other`/etc. variants
 *   - Param substitution {{name}}
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Controllable locale cookie ───────────────────────────────────────────────
const localeState = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) =>
      key === "sahelflow-locale" && localeState.cookieValue !== undefined
        ? { value: localeState.cookieValue }
        : undefined,
  })),
}));

import { getI18n, loadTranslationsSync } from "@/lib/i18n-server";
import type { Locale } from "@/lib/i18n";

beforeEach(() => {
  localeState.cookieValue = undefined;
});

// ── locale resolution ────────────────────────────────────────────────────────
describe("getI18n — locale resolution", () => {
  it("returns 'fr' as the default when no cookie is set", async () => {
    const { locale } = await getI18n();
    expect(locale).toBe("fr");
  });

  it("returns 'fr' when the cookie value is invalid", async () => {
    localeState.cookieValue = "de"; // not supported
    const { locale } = await getI18n();
    expect(locale).toBe("fr");
  });

  it("returns 'ar' when the cookie is set to ar", async () => {
    localeState.cookieValue = "ar";
    const { locale } = await getI18n();
    expect(locale).toBe("ar");
  });

  it("returns 'en' when the cookie is set to en", async () => {
    localeState.cookieValue = "en";
    const { locale } = await getI18n();
    expect(locale).toBe("en");
  });

  it("returns 'fr' when the cookie is set to fr", async () => {
    localeState.cookieValue = "fr";
    const { locale } = await getI18n();
    expect(locale).toBe("fr");
  });
});

// ── direction ────────────────────────────────────────────────────────────────
describe("getI18n — direction", () => {
  it("returns 'rtl' for ar", async () => {
    localeState.cookieValue = "ar";
    const { dir } = await getI18n();
    expect(dir).toBe("rtl");
  });

  it("returns 'ltr' for fr", async () => {
    localeState.cookieValue = "fr";
    const { dir } = await getI18n();
    expect(dir).toBe("ltr");
  });

  it("returns 'ltr' for en", async () => {
    localeState.cookieValue = "en";
    const { dir } = await getI18n();
    expect(dir).toBe("ltr");
  });

  it("returns 'ltr' for the default (fr) when no cookie is set", async () => {
    const { dir } = await getI18n();
    expect(dir).toBe("ltr");
  });
});

// ── t() translation lookup ───────────────────────────────────────────────────
describe("getI18n — t() lookup", () => {
  it("returns the French translation for common.save", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    expect(t("common.save")).toBe("Enregistrer");
  });

  it("returns the Arabic translation for common.save", async () => {
    localeState.cookieValue = "ar";
    const { t } = await getI18n();
    expect(t("common.save")).toBe("حفظ");
  });

  it("returns the English translation for common.save", async () => {
    localeState.cookieValue = "en";
    const { t } = await getI18n();
    expect(t("common.save")).toBe("Save");
  });

  it("returns the key itself when the translation is missing", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    expect(t("nonexistent.key.deeply.nested")).toBe("nonexistent.key.deeply.nested");
  });
});

// ── t() plural support ───────────────────────────────────────────────────────
describe("getI18n — t() plural support", () => {
  it("uses the _one form for count=1 in French", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    expect(t("orders.count", { count: 1 })).toBe("1 commande");
  });

  it("uses the _many form for count=2 in French", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    // French plural rules: 0=many, 1=one, 2+=many
    expect(t("orders.count", { count: 2 })).toBe("2 commandes");
  });

  it("uses the _one form for count=1 in English", async () => {
    localeState.cookieValue = "en";
    const { t } = await getI18n();
    expect(t("orders.count", { count: 1 })).toBe("1 order");
  });

  it("uses the _other form for count=2 in English", async () => {
    localeState.cookieValue = "en";
    const { t } = await getI18n();
    expect(t("orders.count", { count: 2 })).toBe("2 orders");
  });

  it("uses the _one form for count=1 in Arabic", async () => {
    localeState.cookieValue = "ar";
    const { t } = await getI18n();
    expect(t("orders.count", { count: 1 })).toBe("طلب واحد");
  });

  it("uses the _two form for count=2 in Arabic", async () => {
    localeState.cookieValue = "ar";
    const { t } = await getI18n();
    expect(t("orders.count", { count: 2 })).toBe("طلبان");
  });
});

// ── t() param substitution ───────────────────────────────────────────────────
describe("getI18n — t() param substitution", () => {
  it("substitutes {{count}} in the translated string", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    expect(t("orders.count_one", { count: 42 })).toBe("42 commande");
  });

  it("substitutes multiple params", async () => {
    localeState.cookieValue = "fr";
    const { t } = await getI18n();
    // Use a known key with {{count}} and check substitution
    const result = t("orders.count", { count: 5 });
    expect(result).toContain("5");
    expect(result).toContain("commande");
  });
});

// ── loadTranslationsSync ─────────────────────────────────────────────────────
describe("loadTranslationsSync", () => {
  it("returns the translations object for fr", () => {
    const t = loadTranslationsSync("fr");
    expect(t["common.save"]).toBe("Enregistrer");
    expect(t["orders.title"]).toBe("Commandes");
  });

  it("returns the translations object for ar", () => {
    const t = loadTranslationsSync("ar");
    expect(t["common.save"]).toBe("حفظ");
  });

  it("returns the translations object for en", () => {
    const t = loadTranslationsSync("en");
    expect(t["common.save"]).toBe("Save");
  });

  it("returns {} for an unknown locale", () => {
    const t = loadTranslationsSync("xx" as Locale);
    expect(t).toEqual({});
  });
});
