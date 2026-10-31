/**
 * @vitest-environment happy-dom
 */
/**
 * RiskView mounted with already-loaded data (no database) in the five states a
 * seller meets: loading and error are the route's own screens, empty (new shop,
 * nothing shipped yet), partial (some returns without a known cost, a member who
 * cannot manage the rules), populated (en and ar). The two seller sections and
 * the trend chart are stubbed: their fixtures are another file's business.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RiskError from "@/app/(dashboard)/risk/error";
import RiskLoading from "@/app/(dashboard)/risk/loading";
import { RiskView, type RiskViewProps } from "@/components/risk/risk-view";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTranslations, type Locale } from "@/lib/i18n";
import { getRiskWorkspaceCopy } from "@/lib/i18n/risk-workspace";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { formatDZD } from "@/lib/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/risk",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getTranslations: gt } = await import("@/lib/i18n");
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return { useI18n: () => ({ locale: "en", dir: "ltr", t: (key: string) => gt("en")[key] ?? rt("en", key) ?? key }) };
});
vi.mock("@/components/risk/risk-seller-sections", () => ({
  CheckBeforeShipping: () => <div data-testid="check-before-shipping" />,
  ScoreCheck: () => <div data-testid="score-check" />,
  WhereYouLoseMoney: () => <div data-testid="where-you-lose-money" />,
}));
vi.mock("@/components/charts/area-trend-chart", () => ({ AreaTrendChart: () => <div data-testid="trend-chart" /> }));

afterEach(cleanup);

function makeT(locale: Locale) {
  const catalog = getTranslations(locale);
  return (key: string, params?: Record<string, string | number>) => {
    let text = catalog[key] ?? getRuntimeTranslation(locale, key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  };
}

const populated = {
  kpis: { blacklistedCustomerCount: 2 },
  insights: {
    outcomes: { completed: 148, delivered: 121, deliverySuccessRate: 121 / 148, cameBack: 27, returnRate: 27 / 148, lostToReturnsDzd: 183400.5, unknownCostReturns: 0 },
    weekly: [
      { week: "2026-10-05", orders: 41, cameBack: 7 },
      { week: "2026-10-12", orders: 38, cameBack: 5 },
      { week: "2026-10-19", orders: 44, cameBack: 9 },
    ],
    wilayaActivity: [
      { wilaya: "16", orders: 52, finished: 40, returnRate: 0.12 },
      { wilaya: "31", orders: 31, finished: 25, returnRate: 0.36 },
    ],
  },
  attentionFactors: [],
  topFactors: [],
  confirmationByLevel: [],
  openRiskyCount: 9,
};
const empty = {
  ...populated,
  kpis: { blacklistedCustomerCount: 0 },
  insights: {
    outcomes: { completed: 0, delivered: 0, deliverySuccessRate: 0, cameBack: 0, returnRate: 0, lostToReturnsDzd: 0, unknownCostReturns: 0 },
    weekly: [],
    wilayaActivity: [],
  },
  openRiskyCount: 0,
};
const partial = {
  ...populated,
  insights: { ...populated.insights, outcomes: { ...populated.insights.outcomes, unknownCostReturns: 3 } },
};

function view(locale: Locale, report: unknown, over: Partial<RiskViewProps> = {}) {
  return render(
    <TooltipProvider>
      <RiskView
        t={makeT(locale)}
        locale={locale}
        report={report as never}
        config={{} as never}
        blacklisted={[] as never}
        rules={[] as never}
        canManage
        days={30}
        activeTab="overview"
        {...over}
      />
    </TooltipProvider>,
  );
}
const copy = (locale: Locale, key: string, values?: Record<string, string | number>) => getRiskWorkspaceCopy(locale, key as never, values);

describe("RiskView five states", () => {
  it("loading: one busy region and no figure", () => {
    const { container } = render(<RiskLoading />);
    expect(container.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(/\d|DZD|%/);
  });

  it("error: Try again calls reset, the raw message never shows", () => {
    const reset = vi.fn();
    render(<RiskError error={new Error("boom: SQLITE_BUSY database is locked")} reset={reset} />);
    expect(document.body.textContent ?? "").not.toMatch(/SQLITE_BUSY|boom/);
    fireEvent.click(screen.getAllByRole("button")[0]!);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("empty: nothing finished yet shows a dash, never 0% / NaN / undefined, and an empty trend", () => {
    const { container, queryByTestId } = view("en", empty);
    const kpis = container.querySelector("[data-risk-overview-kpis]")?.textContent ?? "";
    expect(kpis).toContain("—");
    expect(kpis).not.toMatch(/NaN|undefined|null|Infinity/);
    expect(kpis).not.toContain("0%");
    expect(kpis).toContain(formatDZD(0, "en"));
    expect(queryByTestId("trend-chart")).toBeNull();
  });

  it("partial: returns without a known cost are counted next to the lost-money figure; a member who cannot manage has no control or rules tab", () => {
    const { container, queryByText } = view("en", partial, { canManage: false });
    const kpis = container.querySelector("[data-risk-overview-kpis]")?.textContent ?? "";
    expect(kpis).toContain(copy("en", "kpiLostUnknown", { count: "3" }));
    expect(kpis).not.toContain(copy("en", "kpiLostHint"));
    expect(queryByText(makeT("en")("risk.control"))).toBeNull();
    expect(queryByText(makeT("en")("risk.rules"))).toBeNull();
  });

  it("populated (en): rates, whole-dinar loss and the to-check count; managers get the control and rules tabs", () => {
    const { container, getByText, getByTestId } = view("en", populated);
    const kpis = container.querySelector("[data-risk-overview-kpis]")?.textContent ?? "";
    expect(kpis).toContain("81.8%");
    expect(kpis).toContain(formatDZD(183400.5, "en"));
    expect(kpis).not.toContain("183400.5");
    expect(kpis).toContain(copy("en", "kpiLostHint"));
    expect(kpis).toContain("9");
    expect(getByTestId("trend-chart")).toBeTruthy();
    expect(getByText(makeT("en")("risk.control"))).toBeTruthy();
    expect(getByText(makeT("en")("risk.rules"))).toBeTruthy();
  });

  it("populated (ar): Arabic copy, not the English", () => {
    const { container } = view("ar", populated);
    const kpis = container.querySelector("[data-risk-overview-kpis]")?.textContent ?? "";
    expect(kpis).toContain(copy("ar", "kpiLostHint"));
    expect(kpis).not.toContain(copy("en", "kpiLostHint"));
    expect(copy("ar", "kpiLostHint")).not.toBe(copy("en", "kpiLostHint"));
    expect(kpis).toContain(formatDZD(183400.5, "ar"));
  });
});
