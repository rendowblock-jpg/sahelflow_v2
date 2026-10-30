import { describe, expect, it } from "vitest";
import { buildChartTable } from "@/components/charts/chart-table";

const t = (key: string, params?: Record<string, string | number>) =>
  params?.title !== undefined ? `${key}:${String(params.title)}` : key;

describe("buildChartTable", () => {
  it("labels the image with title and headline number, and carries every row", () => {
    const table = buildChartTable(t, "Orders by status", "41 orders", ["Status", "Orders"], [["Delivered", "29"], ["Shipped", "6"]]);
    expect(table?.label).toBe("Orders by status: 41 orders");
    expect(table?.caption).toBe("charts.tableOf:Orders by status");
    expect(table?.columns).toEqual(["Status", "Orders"]);
    expect(table?.rows).toHaveLength(2);
    expect(table?.showLabel).toBe("charts.showAsTable");
    expect(table?.hideLabel).toBe("charts.showAsChart");
  });
  it("uses the title alone when there is no headline", () => {
    expect(buildChartTable(t, "Top wilayas", "", ["Wilaya"], [["Alger"]])?.label).toBe("Top wilayas");
  });
  it("offers no table when there are no rows (the chart shows its empty state)", () => {
    expect(buildChartTable(t, "Top wilayas", "x", ["Wilaya"], [])).toBeUndefined();
  });
});
