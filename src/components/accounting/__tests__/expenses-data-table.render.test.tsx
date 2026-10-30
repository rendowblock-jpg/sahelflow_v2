/**
 * @vitest-environment happy-dom
 */
/** G4 accounting: on a 360 px phone the expenses list is one card per expense, not a sideways-scrolling table. */
import { cleanup, screen, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExpensesDataTable, type ExpenseRowView } from "@/components/accounting/expenses-data-table";
import { render } from "@/test-utils/render";

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
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "fr",
    dir: "ltr",
  }),
}));
vi.mock("@/components/accounting/expense-row-actions", () => ({
  ExpenseRowActions: ({ expense }: { expense: { id: string } }) => <button type="button">edit-{expense.id}</button>,
}));
afterEach(cleanup);

const ROWS: ExpenseRowView[] = [
  { id: "e1", category: "delivery_fees", amount: 12500, date: "2026-10-28T10:00:00.000Z", notes: "Remise Yalidine, 14 colis" },
  { id: "e2", category: "ads", amount: 40000, date: "2026-10-27T09:30:00.000Z", notes: null },
];

describe("ExpensesDataTable on a phone", () => {
  it("renders one card per expense with category, amount, notes and the row action; no table", () => {
    render(
      <NuqsTestingAdapter>
        <ExpensesDataTable rows={ROWS} canUpdate />
      </NuqsTestingAdapter>,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("accounting.category.delivery_fees")).toBeTruthy();
    expect(screen.getByText("accounting.category.ads")).toBeTruthy();
    expect(screen.getByText(/−\s*12[\s\u00a0\u202f.,]?500/)).toBeTruthy();
    expect(screen.getByText(/−\s*40[\s\u00a0\u202f.,]?000/)).toBeTruthy();
    expect(screen.getByText("Remise Yalidine, 14 colis")).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit-e1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "edit-e2" })).toBeTruthy();
  });

  it("a reader without accounting.update sees no edit actions", () => {
    render(
      <NuqsTestingAdapter>
        <ExpensesDataTable rows={ROWS} canUpdate={false} />
      </NuqsTestingAdapter>,
    );
    expect(screen.queryByRole("button", { name: /^edit-/ })).toBeNull();
    expect(within(document.body).getByText("accounting.category.ads")).toBeTruthy();
  });
});
