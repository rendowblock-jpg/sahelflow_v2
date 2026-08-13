import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 analytics locale and hierarchy contract", () => {
  it("keeps seller-facing Analytics money under the active locale", () => {
    const analytics = read("src/app/(dashboard)/analytics/page.tsx");

    expect(analytics).toContain("formatDZD(summary.totalRevenue, locale)");
    expect(analytics).toContain("formatDZD(summary.avgOrderValue, locale)");
    expect(analytics).toContain("formatDZD(item.revenue, locale)");
    expect(analytics).toContain("formatDZD(item.cost, locale)");
    expect(analytics).toContain("formatDZD(item.margin, locale)");
    expect(analytics).not.toContain("formatDZD(summary.totalRevenue)");
    expect(analytics).not.toContain("formatDZD(summary.avgOrderValue)");
    expect(analytics).not.toContain("formatDZD(item.revenue)");
  });

  it("uses locale-aware percent, integer and hour formatting instead of string suffixes", () => {
    const analytics = read("src/app/(dashboard)/analytics/page.tsx");
    const statCard = read("src/components/shared/stat-card.tsx");
    const utils = read("src/lib/utils.ts");

    expect(analytics).toContain("new Intl.NumberFormat(dateLocale");
    expect(analytics).toContain("percentFormatter.format(value / 100)");
    expect(analytics).toContain("hourFormatter.format(hour)");
    expect(analytics).toContain('formatValue="percent"');
    expect(statCard).toContain("style: \"percent\"");
    expect(statCard).toContain("signDisplay: \"exceptZero\"");
    expect(statCard).not.toContain("trend.toFixed(1)");
    expect(utils).toContain('notation: "compact"');
    expect(utils).not.toContain("toFixed(1)}M");
    expect(utils).not.toContain("toFixed(1)}K");
  });

  it("removes page-level fixed chart canvases and uses governed empty states", () => {
    const analytics = read("src/app/(dashboard)/analytics/page.tsx");

    expect(analytics).not.toContain("height={320}");
    expect(analytics).not.toContain("height={300}");
    expect(analytics).not.toContain("height={280}");
    expect(analytics).not.toContain('h-[300px]');
    expect(analytics).toContain("ChartEmpty");
  });

  it("expresses an explicit decision hierarchy across the Analytics workspace", () => {
    const analytics = read("src/app/(dashboard)/analytics/page.tsx");

    for (const section of [
      "scorecard",
      "headline",
      "operations",
      "rankings",
      "timing",
      "trends",
      "returns",
      "comparison",
      "sku-pnl",
    ]) {
      expect(analytics).toContain(`data-analytics-section=\"${section}\"`);
    }
    expect(analytics).toContain("xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]");
  });
});
