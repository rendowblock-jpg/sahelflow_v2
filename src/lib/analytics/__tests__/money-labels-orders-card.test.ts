/**
 * The Orders page card and the daily report used the bare word "revenue" for a
 * delivered-revenue figure. They now carry the same name as the accounting
 * view, in ar, fr and en, and the number behind them is unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NUMBERS_LABELS_RUNTIME } from "@/lib/i18n/numbers-labels-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const ROOT = resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");
type Lang = "ar" | "fr" | "en";

describe("Orders page card label", () => {
  it("says what the card counts in each language", () => {
    expect(getRuntimeTranslation("en", "money.revenueDeliveredToday")).toBe("Revenue delivered today");
    expect(getRuntimeTranslation("fr", "money.revenueDeliveredToday")).toBe("Revenu livré aujourd'hui");
    expect(getRuntimeTranslation("ar", "money.revenueDeliveredToday")).toBe("الإيراد المسلَّم اليوم");
  });

  it("has the same keys in ar, fr and en", () => {
    const keys = (locale: Lang) => Object.keys(NUMBERS_LABELS_RUNTIME[locale]).sort();
    expect(keys("fr")).toEqual(keys("en"));
    expect(keys("ar")).toEqual(keys("en"));
  });

  it("uses the new key on the card and no longer the bare-word key", () => {
    const page = read("src/app/(dashboard)/orders/page.tsx");
    expect(page).toContain('label={t("money.revenueDeliveredToday")}');
    expect(page).not.toContain("orders.todayRevenue");
  });

  it("still adds up the same orders: delivered today, by total price", () => {
    const page = read("src/app/(dashboard)/orders/page.tsx");
    expect(page).toMatch(/status: "delivered" as const,\s+deliveredAt: \{ gte: start, lt: end \}/);
    expect(page).toMatch(/where: deliveredWhere,\s+_sum: \{ totalPrice: true \}/);
  });
});

describe("daily report revenue label", () => {
  it("is built from the revenue-delivered money name, not dailyReport.revenue", () => {
    const source = read("src/lib/reports/daily-report.ts");
    expect(source).toContain('t(moneyNameKey("revenueDelivered"))');
    expect(source).not.toContain("dailyReport.revenue");
    expect(source).toContain("profitability.grossRevenue");
  });
});
