import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getAiQuotaRuntimeTranslation } from "../ai-quota-runtime";

const KEYS = ["aiQuota.paused", "aiQuota.pausedApprox", "aiQuota.low"];
const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");

describe("ai-quota runtime catalog", () => {
  it("has every key in ar, fr and en with the same placeholders, and no provider name or status code", () => {
    for (const key of KEYS) {
      const en = getAiQuotaRuntimeTranslation("en", key);
      expect(en, key).toBeTruthy();
      for (const locale of ["ar", "fr"] as const) {
        const text = getAiQuotaRuntimeTranslation(locale, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        expect(placeholders(text ?? ""), `${locale} ${key}`).toBe(placeholders(en ?? ""));
      }
      for (const locale of ["ar", "fr", "en"] as const) {
        expect(getAiQuotaRuntimeTranslation(locale, key)).not.toMatch(/gemini|groq|429|unavailable/i);
      }
    }
  });

  it("is registered once in runtime-translations.ts (one import, one lookup)", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/i18n/runtime-translations.ts"), "utf8");
    expect(source.match(/getAiQuotaRuntimeTranslation/g)?.length).toBe(2);
  });
});
