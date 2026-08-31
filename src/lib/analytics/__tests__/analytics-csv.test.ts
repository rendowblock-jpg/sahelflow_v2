import { describe, expect, it } from "vitest";

import { buildAnalyticsCsv } from "@/lib/analytics/analytics-csv";

describe("buildAnalyticsCsv", () => {
  it("renders sections with BOM and CRLF rows", () => {
    const csv = buildAnalyticsCsv([
      {
        title: "Key metrics",
        columns: ["Metric", "Value"],
        rows: [["Orders", 42]],
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Key metrics\r\nMetric,Value\r\nOrders,42\r\n");
  });

  it("separates multiple sections with a blank line", () => {
    const csv = buildAnalyticsCsv([
      {
        title: "KPIs",
        columns: ["Metric", "Value"],
        rows: [["Revenue", 1200]],
      },
      {
        title: "Couriers",
        columns: ["Courier", "Shipments"],
        rows: [["yalidine", 9]],
      },
    ]);
    expect(csv).toContain("Revenue,1200\r\n\r\nCouriers\r\n");
  });

  it("escapes commas, quotes and newlines with double quoting", () => {
    const csv = buildAnalyticsCsv([
      {
        title: "T",
        columns: ["A", "B"],
        rows: [['say "hi"', "a,b"]],
      },
    ]);
    expect(csv).toContain('"say ""hi""","a,b"');
  });

  it("guards against CSV formula injection", () => {
    const csv = buildAnalyticsCsv([
      {
        title: "T",
        columns: ["A"],
        rows: [["=SUM(A1:A2)"], ["+1"], ["@cmd"], ["-2"]],
      },
    ]);
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("'-2");
  });

  it("renders null/undefined cells as empty fields", () => {
    const csv = buildAnalyticsCsv([
      {
        title: "T",
        columns: ["Courier", "Avg days"],
        rows: [["maystro", null]],
      },
    ]);
    expect(csv).toContain("maystro,");
  });
});
