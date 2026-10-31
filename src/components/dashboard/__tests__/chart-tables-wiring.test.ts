import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Every ChartCard of the analytics delivery card and the courier section carries a text alternative. */
describe("chart text alternatives (buildChartTable) are wired", () => {
  const analytics = readFileSync("src/components/analytics/analytics-view.tsx", "utf8");
  const courier = readFileSync("src/components/analytics/courier-performance-section.tsx", "utf8");
  const dashboard = readFileSync("src/components/dashboard/dashboard-view.tsx", "utf8");

  it("analytics: the delivery performance card has a dataTable with the four outcomes", () => {
    const start = analytics.indexOf('title={t("analytics.deliveryPerformance")}');
    const card = analytics.slice(start, analytics.indexOf("<OutcomeProgress", start));
    expect(card).toContain("dataTable={buildChartTable(");
    for (const key of ["analytics.delivered", "analytics.inTransit", "dashboard.pending", "analytics.returned"]) expect(card).toContain(`t("${key}")`);
    for (const field of ["delivery.delivered", "delivery.inTransit", "delivery.pending", "delivery.returned"]) expect(card).toContain(field);
  });
  it("courier section: both ChartCards carry a dataTable", () => {
    expect((courier.match(/<ChartCard/g) ?? []).length).toBe(2);
    expect((courier.match(/dataTable=\{buildChartTable\(/g) ?? []).length).toBe(2);
    expect(courier).toContain("cell.successRate / 100");
    expect(courier).toContain('[t("orders.wilaya"), ...matrix.providers]');
  });
  it("dashboard: the three sparkline cards pass tableAlt built from their own series", () => {
    for (const [series, money] of [["ordersSpark", "false"], ["revenueSpark", "true"], ["customersSpark", "false"]]) {
      expect(dashboard).toContain(`spark={${series}}`);
      expect(dashboard).toMatch(new RegExp(`tableAlt=\\{sparkTable\\(t\\("dashboard\\.[A-Za-z]+"\\), ${series}, ${money}\\)\\}`));
    }
  });
});
