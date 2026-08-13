import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 visible locale and layout closure", () => {
  it("keeps Product list money and stock under the active locale", () => {
    const products = read("src/components/products/products-data-table.tsx");

    expect(products).toContain("const { t, locale } = useI18n()");
    expect(products).toContain("formatDZD(row.original.price, locale)");
    expect(products).toContain("formatDZD(product.price, locale)");
    expect(products).toContain("formatDZD(product.cost, locale)");
    expect(products).toContain("integerFormatter.format(row.original.stock)");
    expect(products).not.toContain("formatDZD(row.original.price)");
  });

  it("localizes Risk KPIs, tables and empty analytical states", () => {
    const risk = read("src/app/(dashboard)/risk/page.tsx");

    expect(risk).toContain('style: "percent"');
    expect(risk).toContain("formatDZD(kpis.potentialSavingsDzd, locale)");
    expect(risk).toContain("integerFormatter.format(kpis.avgRiskScore)");
    expect(risk).toContain("integerFormatter.format(row.total)");
    expect(risk).toContain("signedPointsFormatter.format(factor.avgPoints)");
    expect(risk).toContain("ChartEmpty");
    expect(risk).not.toContain("toFixed(1)");
    expect(risk).not.toContain('h-[260px]');
  });

  it("prevents Dashboard sibling panels from stretching into dead space", () => {
    const dashboard = read("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain('data-dashboard-operational-grid="true"');
    expect(dashboard).toContain("grid min-w-0 items-start gap-3");
    expect(dashboard).toContain("self-start rounded-md");
  });

  it("localizes Dashboard counts and rates without changing query authority", () => {
    const dashboard = read("src/app/(dashboard)/dashboard/page.tsx");

    expect(dashboard).toContain('style: "percent"');
    expect(dashboard).toContain("integerFormatter.format(stats.ordersToday)");
    expect(dashboard).toContain("integerFormatter.format(stats.newCustomers)");
    expect(dashboard).toContain("percentFormatter.format(delivery.deliveryRate / 100)");
    expect(dashboard).not.toContain("`${delivery.deliveryRate}%`");
  });
});
