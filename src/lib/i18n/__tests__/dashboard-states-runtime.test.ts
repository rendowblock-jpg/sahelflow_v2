import { describe, expect, it } from "vitest";

import { getDashboardStatesRuntimeTranslation } from "@/lib/i18n/dashboard-states-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const LOCALES = ["ar", "fr", "en"] as const;
const KEYS = [
  "dashboard.revenueDefinition",
  "analytics.revenueDefinition",
  "accounting.netRevenueDefinition",
  "charts.showAsTable",
  "charts.showAsChart",
  "charts.tableOf",
  "charts.colDate",
  "charts.colMonth",
] as const;

describe("G4 revenue wording and chart table copy", () => {
  it("has every key in ar, fr and en with the same placeholders", () => {
    for (const key of KEYS) {
      const placeholders = LOCALES.map((l) => {
        const text = getDashboardStatesRuntimeTranslation(l, key);
        expect(text, `${l} ${key}`).toBeTruthy();
        return (text?.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
      });
      expect(new Set(placeholders).size, key).toBe(1);
    }
  });
  it("says in plain words what the dashboard number counts and what it does not", () => {
    const en = getDashboardStatesRuntimeTranslation("en", "dashboard.revenueDefinition") ?? "";
    expect(en).toMatch(/placed today/i);
    expect(en).toMatch(/cancelled/i);
    expect(en).toMatch(/not cash/i);
    expect(getDashboardStatesRuntimeTranslation("en", "accounting.netRevenueDefinition")).toMatch(/refunds/i);
  });
  it("is reachable through the shared runtime lookup", () => {
    for (const l of LOCALES) expect(getRuntimeTranslation(l, "charts.showAsTable")).toBeTruthy();
  });
});
