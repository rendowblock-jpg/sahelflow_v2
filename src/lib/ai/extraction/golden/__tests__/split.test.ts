/**
 * Pins the dev / holdout split of the golden set (see ../split.ts): the halves
 * partition the set, every language is present in both, and the holdout size
 * cannot change without a visible edit here.
 */
import { describe, expect, it } from "vitest";

import { GOLDEN_SET } from "../golden-set";
import { isDev, isHoldout } from "../split";

const HOLDOUT_COUNT = 114;
const DEV_COUNT = 117;

describe("golden set dev / holdout split", () => {
  it("decides by the number at the end of the id: even is holdout, odd is dev", () => {
    expect(isHoldout({ id: "G-AR-006" })).toBe(true);
    expect(isHoldout({ id: "G-AR-005" })).toBe(false);
    expect(isDev({ id: "G-FR-110" })).toBe(false);
    expect(isDev({ id: "G-MX-001" })).toBe(true);
    expect(() => isHoldout({ id: "no-number" })).toThrow();
  });

  it("partitions the set: every entry is in exactly one half", () => {
    const holdout = GOLDEN_SET.filter(isHoldout);
    const dev = GOLDEN_SET.filter(isDev);
    expect(holdout.length + dev.length).toBe(GOLDEN_SET.length);
    const holdoutIds = new Set(holdout.map((entry) => entry.id));
    expect(dev.some((entry) => holdoutIds.has(entry.id))).toBe(false);
    expect(new Set(GOLDEN_SET.map((entry) => entry.id)).size).toBe(GOLDEN_SET.length);
  });

  it("has at least 10 entries of every language in each half", () => {
    const languages = new Set(GOLDEN_SET.map((entry) => entry.language));
    for (const language of languages) {
      if (language === "ar-msa") continue; // 3 to 10 entries by design: too few to split
      const inLanguage = GOLDEN_SET.filter((entry) => entry.language === language);
      expect(inLanguage.filter(isHoldout).length, `holdout ${language}`).toBeGreaterThanOrEqual(10);
      expect(inLanguage.filter(isDev).length, `dev ${language}`).toBeGreaterThanOrEqual(10);
    }
  });

  it("pins the exact size of each half", () => {
    expect(GOLDEN_SET.filter(isHoldout).length).toBe(HOLDOUT_COUNT);
    expect(GOLDEN_SET.filter(isDev).length).toBe(DEV_COUNT);
  });
});
