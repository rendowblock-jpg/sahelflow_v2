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
  it("courier section: the wilaya matrix is already a real table, so its two ChartCards carry NO dataTable", () => {
    // A dataTable wraps the plot in role="img". The matrix sits in a focusable, named scroll region, so axe fails it
    // (nested-interactive, serious) and a screen reader would hear an image label instead of the table. The matrix IS the text alternative.
    expect((courier.match(/<ChartCard/g) ?? []).length).toBe(2);
    expect(courier).not.toContain("dataTable=");
    expect(courier).not.toContain("buildChartTable");
    expect(courier).toContain('data-courier-matrix="true"');
    expect(courier).toContain('<ScrollRegion label={t("analytics.courier.matrix.title")}>');
  });
  it("dashboard: the three sparkline cards pass tableAlt built from their own series", () => {
    for (const [series, money] of [["ordersSpark", "false"], ["revenueSpark", "true"], ["customersSpark", "false"]]) {
      expect(dashboard).toContain(`spark={${series}}`);
      expect(dashboard).toMatch(new RegExp(`tableAlt=\\{sparkTable\\(t\\("dashboard\\.[A-Za-z]+"\\), ${series}, ${money}\\)\\}`));
    }
  });
});
