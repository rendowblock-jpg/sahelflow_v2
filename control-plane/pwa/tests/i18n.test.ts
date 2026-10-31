import { describe, expect, it } from "vitest";
import { catalogs, dirOf, formatDzd, formatNumber, formatTime, isLocale, LOCALES, t } from "../src/i18n";

const params = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? "").sort();

describe("catalogs", () => {
  it("have identical key sets in ar, fr and en", () => {
    const ar = Object.keys(catalogs.ar).sort();
    expect(ar.length).toBeGreaterThan(60);
    expect(Object.keys(catalogs.fr).sort()).toEqual(ar);
    expect(Object.keys(catalogs.en).sort()).toEqual(ar);
  });
  it("use the same {{param}} names in every language and never leave a value empty", () => {
    for (const key of Object.keys(catalogs.ar)) {
      const arValue = catalogs.ar[key] ?? "";
      expect(arValue.trim(), key).not.toBe("");
      for (const l of LOCALES) {
        const v = catalogs[l][key] ?? "";
        expect(v.trim(), `${l}:${key}`).not.toBe("");
        expect(params(v), `${l}:${key}`).toEqual(params(arValue));
      }
    }
  });
  it("write no Arabic-Indic digits (Western digits everywhere)", () => {
    for (const l of LOCALES) for (const v of Object.values(catalogs[l])) expect(v).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });
});

describe("t / locale helpers", () => {
  it("fills params, and returns the key when it is missing", () => {
    expect(t("en", "settings.version", { version: "1.2.3" })).toContain("1.2.3");
    expect(t("fr", "no.such.key")).toBe("no.such.key");
  });
  it("knows locales and direction", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("fr")).toBe("ltr");
  });
});

describe("number and date formatting", () => {
  const NB = "\u00A0";
  const rows: ReadonlyArray<readonly [number, "ar" | "fr" | "en", string]> = [
    [35000, "fr", `35${NB}000${NB}DZD`],
    [35000, "en", `35${NB}000${NB}DZD`],
    [35000, "ar", `35${NB}000${NB}د.ج`],
    [0, "fr", `0${NB}DZD`],
    [999, "en", `999${NB}DZD`],
    [1234567, "fr", `1${NB}234${NB}567${NB}DZD`],
    [-1500, "fr", `-1${NB}500${NB}DZD`],
    [12.5, "fr", "—"],
    [Number.NaN, "en", "—"],
    [Number.MAX_SAFE_INTEGER + 2, "en", "—"],
  ];
  it.each(rows)("formatDzd(%s, %s)", (n, l, out) => expect(formatDzd(n, l)).toBe(out));
  it("formatNumber groups with a no-break space", () => expect(formatNumber(1000)).toBe(`1${NB}000`));
  it("formatTime prints 24 h Western digits in every language", () => {
    const at = Date.UTC(2026, 9, 30, 11, 5);
    for (const l of LOCALES) expect(formatTime(at, l, "UTC")).toBe("11:05");
  });
});
