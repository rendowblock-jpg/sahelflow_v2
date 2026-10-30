/** @vitest-environment happy-dom */
/**
 * AnalyticsView mounted with already-loaded data (no database): the chart text
 * alternatives. Every chart that wires `dataTable` gets a role=img label with
 * its headline number and a "Show as table" toggle that swaps the plot for a
 * real table with every row. Plots (echarts) are stubbed; ChartCard is real.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnalyticsView, type AnalyticsViewProps } from "@/components/analytics/analytics-view";
import { getTranslations, type Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

vi.mock("@/components/charts/area-trend-chart", () => ({ AreaTrendChart: () => <div data-plot="area" /> }));
vi.mock("@/components/charts/composed-trend-chart", () => ({ ComposedTrendChart: () => <div data-plot="composed" /> }));
vi.mock("@/components/charts/line-trend-chart", () => ({ LineTrendChart: () => <div data-plot="line" /> }));
vi.mock("@/components/analytics/analytics-range-controls", () => ({ AnalyticsRangeControls: () => null }));
vi.mock("@/components/analytics/analytics-export-button", () => ({ AnalyticsExportButton: () => null }));
// An async server component (it awaits the shop locale): it would suspend a client render forever.
vi.mock("@/components/analytics/courier-performance-section", () => ({ CourierPerformanceSection: () => null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/analytics",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function makeT(locale: Locale) {
  const catalog = getTranslations(locale);
  return (key: string, params?: Record<string, string | number>) => {
    let text = catalog[key] ?? getRuntimeTranslation(locale, key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  };
}

const day = (date: string) => ({ date, label: date });
const report = {
  summary: {
    totalRevenue: 184000, totalOrders: 41, avgOrderValue: 4488, deliveryRate: 71,
    realizedRevenue: 130500, netRevenue: 121000, netProfit: 40000, profitabilityComplete: true,
    revenueDelta: 12, ordersDelta: -4, aovDelta: 3,
  },
  revenueTimeSeries: [
    { ...day("2026-10-28"), revenue: 52000, orders: 11, aov: 4727 },
    { ...day("2026-10-29"), revenue: 61000, orders: 14, aov: 4357 },
    { ...day("2026-10-30"), revenue: 71000, orders: 16, aov: 4437 },
  ],
  aovTimeSeries: [
    { ...day("2026-10-28"), revenue: 52000, orders: 11, aov: 4727 },
    { ...day("2026-10-29"), revenue: 61000, orders: 14, aov: 4357 },
    { ...day("2026-10-30"), revenue: 71000, orders: 16, aov: 4437 },
  ],
  statusDistribution: [
    { key: "delivered", label: "delivered", value: 29 },
    { key: "shipped", label: "shipped", value: 6 },
    { key: "cancelled", label: "cancelled", value: 4 },
    { key: "returned", label: "returned", value: 2 },
  ],
  topProducts: [
    { key: "p1", name: "فستان قبائلي", revenue: 96000, units: 12, orders: 11 },
    { key: "p2", name: "صابون حلب", revenue: 31500, units: 63, orders: 20 },
  ],
  topWilayas: [
    { key: "16", name: "الجزائر", orders: 14, revenue: 70000 },
    { key: "31", name: "وهران", orders: 9, revenue: 41000 },
  ],
  salesByHour: [
    { hour: 10, orders: 5, revenue: 21000 },
    { hour: 21, orders: 9, revenue: 40500 },
  ],
  deliveryPerformance: { deliveryRate: 71, delivered: 29, inTransit: 6, pending: 4, returned: 2, byProvider: [] },
  customerGrowth: [
    { ...day("2026-10-29"), newCustomers: 3, cumulative: 120 },
    { ...day("2026-10-30"), newCustomers: 5, cumulative: 125 },
  ],
};

function props(locale: Locale): AnalyticsViewProps {
  return {
    t: makeT(locale) as unknown as AnalyticsViewProps["t"],
    locale,
    range: { fromIso: "2026-10-01", toIso: "2026-10-30" } as unknown as AnalyticsViewProps["range"],
    report: report as unknown as AnalyticsViewProps["report"],
    returnRateByWilaya: [
      { wilaya: "الجزائر", returnRate: 12.5, returned: 2, total: 16 },
    ] as unknown as AnalyticsViewProps["returnRateByWilaya"],
    skuProjection: { fieldAccess: { cost: false }, rows: [] } as unknown as AnalyticsViewProps["skuProjection"],
    showSkuCost: false,
    comparison: {
      current: { orders: 41, revenue: 184000, delivered: 29, returnRate: 5 },
      previous: { orders: 43, revenue: 164000, delivered: 27, returnRate: 6 },
      changes: { orders: -4, revenue: 12, delivered: 8, returnRate: -1 },
    } as unknown as AnalyticsViewProps["comparison"],
    courier: { providers: [], matrix: [], totalShipments: 0, feesIncluded: false } as unknown as AnalyticsViewProps["courier"],
  };
}

/** The chart card whose header carries this title (cards are marked data-chart-card). */
function cardOf(container: HTMLElement, title: string): HTMLElement {
  const card = Array.from(container.querySelectorAll<HTMLElement>("[data-chart-card]")).find((el) =>
    Array.from(el.querySelectorAll<HTMLElement>("[id]")).some((node) => (node.textContent ?? "").trim() === title),
  );
  if (!card) throw new Error(`no chart card titled "${title}"`);
  return card;
}

const FAMILIES: ReadonlyArray<{ family: string; titleKey: string; cells: readonly string[] }> = [
  { family: "status", titleKey: "analytics.ordersByStatus", cells: ["29", "6", "4"] },
  { family: "products", titleKey: "analytics.topProductsByRevenue", cells: ["فستان قبائلي", "صابون حلب"] },
  { family: "wilayas", titleKey: "analytics.topWilayas", cells: ["الجزائر", "وهران", "14", "9"] },
  { family: "hour", titleKey: "analytics.salesByHour", cells: ["10:00", "21:00", "9"] },
  { family: "average order value", titleKey: "analytics.aovTrend", cells: ["4727", "4357", "4437"] },
  { family: "customer growth", titleKey: "analytics.customerGrowth", cells: ["120", "125", "5"] },
  { family: "return rate by wilaya", titleKey: "analytics.returnRateByWilaya", cells: ["الجزائر", "2"] },
];

describe("analytics charts have a text alternative with a table toggle", () => {
  for (const locale of ["en", "ar"] as const) {
    const t = makeT(locale);
    const showLabel = t("charts.showAsTable");
    for (const { family, titleKey, cells } of FAMILIES) {
      it(`${locale}: ${family} chart is an image with a headline label and opens as a table`, () => {
        const { container } = render(<TooltipProvider><AnalyticsView {...props(locale)} /></TooltipProvider>);
        const card = cardOf(container, t(titleKey));
        const image = card.querySelector('[role="img"]');
        expect(image?.getAttribute("aria-label") ?? "").toContain(t(titleKey));
        const toggle = card.querySelector<HTMLButtonElement>("button[aria-pressed]");
        expect(toggle?.textContent).toBe(showLabel);
        fireEvent.click(toggle!);
        const table = card.querySelector("table");
        expect(table).not.toBeNull();
        const text = (table?.textContent ?? "").replace(/[\s\u00a0\u202f,.]/g, "");
        for (const cell of cells) expect(text).toContain(cell.replace(/[\s,.]/g, ""));
        expect(card.querySelector("button[aria-pressed]")?.textContent).toBe(t("charts.showAsChart"));
      });
    }
  }

  it("every chart that has numbers offers the toggle (8 on this page: revenue + 7)", () => {
    const { container } = render(<TooltipProvider><AnalyticsView {...props("en")} /></TooltipProvider>);
    expect(container.querySelectorAll("[data-chart-card] button[aria-pressed][aria-controls]")).toHaveLength(8);
  });
});
