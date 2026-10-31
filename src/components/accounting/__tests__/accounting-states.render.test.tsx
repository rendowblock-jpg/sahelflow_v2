/**
 * @vitest-environment happy-dom
 */
/**
 * AccountingView in its five states, three languages, with realistic
 * Algerian-dinar fixtures (integers, a half dinar, a 0.1 + 0.2 drift).
 */
import { cleanup, render } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountingView, type AccountingViewProps } from "@/components/accounting/accounting-view";
import { resolveAccountingState, type AccountingStateInput } from "@/components/accounting/accounting-state";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getTranslations, type Locale } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { formatDZD } from "@/lib/utils";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/accounting",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/toast", () => {
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), dismiss: vi.fn() };
  return { toast, showToast: toast };
});
vi.mock("@/hooks/use-i18n", async () => {
  const { getTranslations: gt } = await import("@/lib/i18n");
  const { getRuntimeTranslation: rt } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({ locale: "fr", dir: "ltr", t: (key: string) => gt("fr")[key] ?? rt("fr", key) ?? key }),
  };
});
vi.mock("@/components/accounting/expense-row-actions", () => ({
  ExpenseRowActions: ({ expense }: { expense: { id: string } }) => <button type="button">edit-{expense.id}</button>,
}));
vi.mock("@/components/charts/dual-bar-chart", () => ({ DualBarChart: () => <div data-testid="dual-bar-chart" /> }));

afterEach(cleanup);

function makeT(locale: Locale) {
  const catalog = getTranslations(locale);
  return (key: string, params?: Record<string, string | number>) => {
    let text = catalog[key] ?? getRuntimeTranslation(locale, key) ?? key;
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{{${name}}}`, String(value));
    return text;
  };
}
const Providers = ({ children }: { children: ReactNode }) => (
  <NuqsTestingAdapter><TooltipProvider>{children}</TooltipProvider></NuqsTestingAdapter>
);

const expenses = [
  { id: "e1", category: "delivery_fees" as const, amount: 12500, date: "2026-10-28T10:00:00.000Z", notes: "Remise Yalidine, 14 colis" },
  { id: "e2", category: "ads" as const, amount: 40000, date: "2026-10-27T09:30:00.000Z", notes: null },
];
const monthly = [
  { month: "Aug", revenue: 812000, expenses: 540000 },
  { month: "Sep", revenue: 947500, expenses: 611250 },
  { month: "Oct", revenue: 1234567.5, expenses: 486200 },
];
const financials = { netRevenue: 1234567.5, cogs: 0.1 + 0.2, totalExpenses: 486200, netProfit: 748367.5, profitabilityComplete: true };

function view(locale: Locale, over: Partial<AccountingViewProps> = {}) {
  const props: AccountingViewProps = {
    t: makeT(locale),
    locale,
    state: "populated",
    periodLabel: "1 Oct – 31 Oct",
    canReadFigures: true,
    canUpdate: true,
    financials,
    monthly,
    chartTotals: { revenue: 2994067.5, expenses: 1637450 },
    expenses,
    failed: { expenses: false, figures: false },
    retryHref: "/accounting",
    addExpenseAction: <button type="button">add-expense</button>,
    ...over,
  };
  return render(
    <div dir={locale === "ar" ? "rtl" : "ltr"}><AccountingView {...props} /></div>,
    { wrapper: Providers },
  );
}
const cards = (c: HTMLElement) => c.querySelector("[data-accounting-figures]");
const cardOf = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("section")].find((s) => s.textContent?.includes(label));

describe("resolveAccountingState", () => {
  const base: AccountingStateInput = { expensesFailed: false, figuresFailed: false, canReadFigures: true, expenseCount: 2, hasFigures: true };
  it.each([
    [{ loading: true }, "loading"],
    [{}, "populated"],
    [{ expenseCount: 0, hasFigures: false }, "empty"],
    [{ expenseCount: 0, hasFigures: true }, "populated"],
    [{ expenseCount: 3, hasFigures: false }, "populated"],
    [{ expensesFailed: true }, "partial"],
    [{ figuresFailed: true }, "partial"],
    [{ expensesFailed: true, figuresFailed: true }, "error"],
    [{ canReadFigures: false, figuresFailed: true }, "populated"],
    [{ canReadFigures: false, expensesFailed: true }, "error"],
  ] as const)("%j -> %s", (over, expected) => {
    expect(resolveAccountingState({ ...base, ...over })).toBe(expected);
  });
});

describe("AccountingView states", () => {
  it("loading: a skeleton shaped like the page, announced once, no figures", () => {
    const { container } = view("en", { state: "loading" });
    const sk = container.querySelector("[data-accounting-skeleton]");
    expect(sk?.getAttribute("role")).toBe("status");
    expect(sk?.getAttribute("aria-busy")).toBe("true");
    expect([...container.querySelectorAll("[data-skeleton-section]")].map((n) => n.getAttribute("data-skeleton-section"))).toEqual(["header", "cards", "chart", "list"]);
    expect(sk?.firstElementChild?.textContent).toBe(makeT("en")("common.loading"));
    expect(cards(container)).toBeNull();
  });

  it("error: kit error with Retry, 44 px target, never raw text", () => {
    const { container, getByRole } = view("en", { state: "error", failed: { expenses: true, figures: true } });
    const alert = getByRole("alert");
    const t = makeT("en");
    expect(alert.textContent).toContain(t("accounting.loadFailed"));
    expect(alert.textContent).toContain(t("error.requestFailed"));
    expect(alert.textContent).not.toMatch(/SQLITE|Error:|undefined|null|\[object|prisma/i);
    const retry = getByRole("link", { name: t("common.retry") });
    expect(retry.getAttribute("href")).toBe("/accounting");
    expect(retry.className).toContain("min-h-11");
    expect(cards(container)).toBeNull();
    expect(container.querySelector("[data-accounting-expenses]")).toBeNull();
  });

  it("empty: one sentence, one action, no figures and no table", () => {
    const { container, getByText } = view("en", { state: "empty", financials: null, expenses: [] });
    const t = makeT("en");
    expect(getByText(t("accounting.state.empty"))).toBeTruthy();
    expect(getByText("add-expense")).toBeTruthy();
    expect(cards(container)).toBeNull();
    expect(container.querySelector("[data-accounting-expenses]")).toBeNull();
  });

  it("empty without the right to add expenses: no action", () => {
    const { queryByText } = view("en", { state: "empty", financials: null, expenses: [], canUpdate: false });
    expect(queryByText("add-expense")).toBeNull();
  });

  it("partial (figures failed): thin banner with Retry, the expenses that loaded stay", () => {
    const { container, getByTestId, getByRole } = view("en", { state: "partial", financials: null, failed: { expenses: false, figures: true } });
    const t = makeT("en");
    expect(getByTestId("accounting-partial").textContent).toContain(t("accounting.state.partialFigures"));
    expect(getByRole("link", { name: t("common.retry") }).getAttribute("href")).toBe("/accounting");
    expect(cards(container)).toBeNull();
    expect(container.querySelector("[data-accounting-expenses]")).not.toBeNull();
  });

  it("partial (expenses failed): the figures that loaded stay, no expenses card", () => {
    const { container, getByTestId } = view("en", { state: "partial", expenses: [], failed: { expenses: true, figures: false } });
    expect(getByTestId("accounting-partial").textContent).toContain(makeT("en")("accounting.state.partialExpenses"));
    expect(cards(container)).not.toBeNull();
    expect(container.querySelector("[data-accounting-expenses]")).toBeNull();
  });

  it("populated: no banner, no empty sentence, no error", () => {
    const { container, queryByTestId } = view("en");
    expect(queryByTestId("accounting-partial")).toBeNull();
    expect(queryByTestId("accounting-empty")).toBeNull();
    expect(queryByTestId("accounting-error")).toBeNull();
    expect(cards(container)?.querySelectorAll("section").length).toBe(4);
    expect(container.querySelector("[data-accounting-state]")?.getAttribute("data-accounting-state")).toBe("populated");
  });

  it("a member who may not read figures sees the forbidden notice, never a number", () => {
    const { container } = view("en", { canReadFigures: false, financials: null });
    expect(cards(container)).toBeNull();
    expect(container.textContent).toContain(makeT("en")("error.forbidden"));
  });
});

describe("AccountingView money and definitions", () => {
  it("money goes through formatDZD: whole dinars, no float drift (0.1 + 0.2, 1,234,567.5)", () => {
    const { container } = view("en");
    const text = cards(container)?.textContent ?? "";
    expect(text).toContain(formatDZD(1234567.5, "en"));
    expect(text).toContain(formatDZD(0.1 + 0.2, "en"));
    expect(text).toContain("1,234,568");
    expect(text).not.toContain("0.30000000000000004");
    expect(text).not.toContain("0.3");
    expect(text).not.toContain("567.5");
    expect(text).not.toMatch(/\d\.\d/);
    expect(container.textContent).toContain(`−${formatDZD(12500, "en")}`);
  });

  it.each(["en", "fr", "ar"] as const)("%s: each headline figure carries its own one-sentence definition (R3 under net revenue, nothing swapped)", (locale) => {
    const t = makeT(locale);
    const { container } = view(locale);
    const net = cardOf(container, t("accounting.netRevenue"));
    const cogs = cardOf(container, t("accounting.cogs"));
    expect(net?.textContent).toContain(t("accounting.def.netRevenue"));
    expect(net?.textContent).not.toContain(t("accounting.def.cogs"));
    expect(net?.textContent).not.toContain(t("accounting.def.netProfit"));
    expect(cogs?.textContent).toContain(t("accounting.def.cogs"));
    expect(cogs?.textContent).not.toContain(t("accounting.def.netRevenue"));
    for (const key of ["netRevenue", "cogs", "expenses", "netProfit"]) {
      expect(cards(container)?.textContent).toContain(t(`accounting.def.${key}`));
    }
  });

  it("the new sentences exist in ar, fr and en and differ between the three", () => {
    const keys = ["accounting.def.netRevenue", "accounting.def.cogs", "accounting.def.expenses", "accounting.def.netProfit", "accounting.state.empty", "accounting.state.partialFigures", "accounting.state.partialExpenses"];
    for (const key of keys) {
      const [ar, fr, en] = (["ar", "fr", "en"] as const).map((l) => makeT(l)(key));
      expect(new Set([ar, fr, en]).size, key).toBe(3);
      for (const text of [ar, fr, en]) expect(text, key).not.toBe(key);
    }
  });

  it("phone: expenses are one card each under md, the wide table only from md, targets 44 px", () => {
    const { container, getAllByText } = view("en");
    const exp = container.querySelector("[data-accounting-expenses]");
    expect(exp?.querySelector(".md\\:hidden")).not.toBeNull();
    expect(exp?.querySelector(".hidden.md\\:block table")).not.toBeNull();
    // Both layouts are in the page; CSS shows one: the card list and the wide table each hold the row action.
    expect(getAllByText("edit-e1").length).toBe(2);
    expect(container.querySelectorAll("[data-skeleton-section]").length).toBe(0);
  });

  it("ar renders right to left with Arabic copy", () => {
    const { container } = view("ar");
    expect(container.firstElementChild?.getAttribute("dir")).toBe("rtl");
    expect(container.textContent).toContain(makeT("ar")("accounting.def.netRevenue"));
    expect(container.textContent).not.toContain(makeT("en")("accounting.def.netRevenue"));
  });
});
