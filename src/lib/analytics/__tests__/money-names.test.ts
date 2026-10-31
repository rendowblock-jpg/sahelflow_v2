/**
 * One honest name per money number. Three bases, three names, in en/fr/ar:
 * orders value (booked, created in the period), revenue delivered (recognised
 * at delivery, gross) and net revenue (after refunds). No label for an
 * orders-value number may be the bare word "Revenue".
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MONEY_BASES, moneyNameKey } from "@/lib/analytics/money-names";
import { MONEY_NAMES_RUNTIME } from "@/lib/i18n/money-names-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { analyticsService, revenueOrderStats } from "@/lib/data/analytics";

const LOCALES = ["en", "fr", "ar"] as const;
const BARE_WORDS = ["Revenue", "Revenu", "Chiffre d'affaires", "الإيراد", "الإيرادات"];
const ROOT = resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

describe("money names catalog", () => {
  it("has the three bases", () => {
    expect([...MONEY_BASES]).toEqual(["ordersValue", "revenueDelivered", "netRevenue"]);
  });

  it("every basis key resolves in en, fr and ar through the runtime lookup", () => {
    for (const locale of LOCALES) {
      for (const basis of MONEY_BASES) {
        const label = getRuntimeTranslation(locale, moneyNameKey(basis));
        expect(label, `${locale} ${basis}`).toBeTruthy();
      }
    }
  });

  it("no two bases share a label in any language, and none is the bare word", () => {
    for (const locale of LOCALES) {
      const labels = MONEY_BASES.map((basis) => MONEY_NAMES_RUNTIME[locale][moneyNameKey(basis)]);
      expect(new Set(labels).size, locale).toBe(MONEY_BASES.length);
      for (const label of labels) expect(BARE_WORDS).not.toContain(label);
    }
  });

  it("en, fr and ar carry exactly the same keys", () => {
    const keys = (locale: (typeof LOCALES)[number]) => Object.keys(MONEY_NAMES_RUNTIME[locale]).sort();
    expect(keys("fr")).toEqual(keys("en"));
    expect(keys("ar")).toEqual(keys("en"));
  });

  it("names the top-products chart by orders value in all three languages", () => {
    expect(MONEY_NAMES_RUNTIME.en["money.topProductsByOrdersValue"]).toBe("Top products (by orders value)");
    expect(MONEY_NAMES_RUNTIME.fr["money.topProductsByOrdersValue"]).toBe("Top produits (par valeur des commandes)");
    expect(MONEY_NAMES_RUNTIME.ar["money.topProductsByOrdersValue"]).toBe("أفضل المنتجات (حسب قيمة الطلبات)");
  });

  it("names the figures as decided", () => {
    const name = (locale: (typeof LOCALES)[number], basis: (typeof MONEY_BASES)[number]) =>
      MONEY_NAMES_RUNTIME[locale][moneyNameKey(basis)];
    expect(name("en", "ordersValue")).toBe("Orders value");
    expect(name("fr", "ordersValue")).toBe("Valeur des commandes");
    expect(name("ar", "ordersValue")).toBe("قيمة الطلبات");
    expect(name("en", "revenueDelivered")).toBe("Revenue delivered");
    expect(name("fr", "revenueDelivered")).toBe("Revenu livré");
    expect(name("ar", "revenueDelivered")).toBe("الإيراد المسلَّم");
    expect(name("en", "netRevenue")).toBe("Net revenue");
    expect(name("fr", "netRevenue")).toBe("Revenu net");
    expect(name("ar", "netRevenue")).toBe("صافي الإيرادات");
  });
});

describe("no component labels an orders-value number with the bare word", () => {
  const VIEWS = [
    "src/components/dashboard/dashboard-view.tsx",
    "src/components/analytics/analytics-view.tsx",
    "src/components/analytics/analytics-export-button.tsx",
    "src/components/accounting/accounting-view.tsx",
  ];
  // Keys whose text is the bare word "Revenue"/"Revenu"/"الإيرادات" in the shop catalog.
  const BARE_KEYS = [
    "dashboard.grossRevenue",
    "analytics.totalRevenue",
    "analytics.revenueTrend",
    "analytics.revenueTrendDesc",
    "accounting.revenue",
  ];
  for (const file of VIEWS) {
    it(`${file} does not read a bare-word key`, () => {
      const source = read(file);
      for (const key of BARE_KEYS) {
        expect(source.includes(`"${key}"`), `${file} uses ${key}`).toBe(false);
      }
    });
  }

  it("analytics-view has no bare revenueLabel left: the top-products chart is titled and tabled by orders value", () => {
    const source = read("src/components/analytics/analytics-view.tsx");
    expect(source.split('t("analytics.revenueLabel")').length - 1).toBe(0);
    expect(source.includes('"analytics.topProductsByRevenue"')).toBe(false);
    expect(source.split('t("money.topProductsByOrdersValue")').length - 1).toBe(2);
  });
});

describe("average order value is value / count of the same orders", () => {
  const rows = [
    { totalPrice: 1000, status: "delivered", deliveredAt: null },
    { totalPrice: 3000, status: "confirmed", deliveredAt: null },
    { totalPrice: 9000, status: "cancelled", deliveredAt: null },
    { totalPrice: 5000, status: "draft", deliveredAt: null },
  ];
  it("cancelled and draft orders are in neither the value nor the count", () => {
    const stats = revenueOrderStats(rows);
    expect(stats.revenue).toBe(4000);
    expect(stats.countedOrders).toBe(2);
    expect(stats.aov).toBe(stats.revenue / stats.countedOrders);
    const summary = analyticsService.buildSummary(rows, []);
    expect(summary.totalRevenue).toBe(4000);
    expect(summary.avgOrderValue).toBe(2000); // 4000 / 2, not 18000 / 4
  });
});
