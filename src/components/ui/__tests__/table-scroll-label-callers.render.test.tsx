/**
 * @vitest-environment happy-dom
 */
/**
 * The shared Table wraps itself in a horizontal scroller. Without `scrollLabel`
 * that wrapper is an unnamed, unfocusable scroll region (axe
 * scrollable-region-focusable) and a keyboard user cannot scroll a wide table.
 * Each caller below must pass the heading it already shows, so the wrapper is a
 * named region and a tab stop.
 */
import { cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CanonicalCodReadOnly } from "@/components/accounting/canonical-cod-readonly";
import type { CanonicalCodDashboardSummary } from "@/components/accounting/canonical-cod-dashboard";
import RiskPage from "@/app/(dashboard)/risk/page";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/risk",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));

vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: async () => ({ shop: { shopId: "shop-1" } }),
  trustedActionAllowed: () => true,
}));

vi.mock("@/lib/db", () => ({
  db: {
  },
  shopContext: { shopId: "shop-1" },
}));

const emptyOutcomes = {
  completed: 0,
  delivered: 0,
  cameBack: 0,
  deliverySuccessRate: 0,
  returnRate: 0,
  lostToReturnsDzd: 0,
  unknownCostReturns: 0,
};

vi.mock("@/lib/risk-engine", () => ({
  getRiskAnalyticsReport: async () => ({
    kpis: { blacklistedCustomerCount: 2 },
    insights: { outcomes: emptyOutcomes, weekly: [], wilayaActivity: [] },
    attentionFactors: [],
    openRiskyCount: 0,
    confirmationByLevel: [
      { level: "low", total: 4, delivered: 3, returned: 1, refused: 0, confirmationRate: 0.75, returnRate: 0.25 },
    ],
    topFactors: [{ factorId: "f1", labelKey: "risk.factor.f1", occurrenceCount: 2, avgPoints: 1.5 }],
  }),
  getRiskConfig: async () => ({}),
  getRiskRules: async () => [],
  listBlacklistedCustomers: async () => [],
}));

// Panels and charts that fetch or draw on their own are not under test.
vi.mock("@/components/risk/risk-blacklist-panel", () => ({ RiskBlacklistPanel: () => null }));
vi.mock("@/components/risk/risk-control-panel", () => ({ RiskControlPanel: () => null }));
vi.mock("@/components/risk/risk-rules-panel", () => ({ RiskRulesPanel: () => null }));
vi.mock("@/components/risk/risk-badges", () => ({ RiskLevelBadgeServer: () => null }));
vi.mock("@/components/risk/risk-seller-sections", () => ({
  CheckBeforeShipping: () => null,
  ScoreCheck: () => null,
  WhereYouLoseMoney: () => null,
}));
vi.mock("@/components/charts/area-trend-chart", () => ({ AreaTrendChart: () => null }));
vi.mock("@/components/charts/decision-visualizations", () => ({ RankedMetricList: () => null }));
vi.mock("@/components/charts/chart-primitives", () => ({
  ChartCard: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
  ChartEmpty: () => null,
}));

afterEach(() => cleanup());

function scrollers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-slot="table-container"]'));
}

function expectNamedRegions(labels: string[]): void {
  const found = scrollers();
  expect(found).toHaveLength(labels.length);
  found.forEach((wrapper, index) => {
    expect(wrapper.getAttribute("role")).toBe("region");
    expect(wrapper.getAttribute("tabindex")).toBe("0");
    expect((wrapper.getAttribute("aria-label") ?? "").trim()).not.toBe("");
    expect(wrapper.getAttribute("aria-label")).toBe(labels[index]);
  });
}

describe("shared Table callers name their scroll region", () => {
  it("/risk analysis: the confirmation table and the top factors table", async () => {
    const ui = (await RiskPage({ searchParams: Promise.resolve({ tab: "analysis" }) })) as ReactElement;
    render(ui);
    expectNamedRegions(["risk.confirmationByLevel.title", "risk.topFactors.title"]);
  });

  it("canonical COD read-only: the review table and the recent settlements table", async () => {
    const summary = {
      totals: {},
      reviewLines: [
        { lineId: "l1", orderNumber: "A1", provider: "yalidine", effectiveDiscrepancy: 5, unresolvedUnmatched: false },
      ],
      disputed: [],
      recentSettlements: [
        { settlementId: "s1", provider: "yalidine", externalReference: "R1", receivedAt: new Date("2026-10-01T00:00:00Z"), netAmount: 10, status: "posted" },
      ],
    } as unknown as CanonicalCodDashboardSummary;
    const ui = await CanonicalCodReadOnly({ summary });
    render(ui);
    const titles = Array.from(document.querySelectorAll('[data-slot="card-title"]')).map(
      (title) => title.textContent?.trim() ?? "",
    );
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expectNamedRegions(titles.slice(-2));
  });
});
