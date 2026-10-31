/**
 * @vitest-environment happy-dom
 */
/**
 * The orders list in the states a seller really meets: a refresh that fails while rows are on screen (rows stay, thin
 * banner with Refresh), a list that never loaded (error with Retry), and no connection (banner, bulk actions off).
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderListItem, OrdersWorkbenchResponse } from "@/types/workbench";
import { OrdersDataTable } from "@/components/orders/orders-data-table";
import { mountList, refreshLists, stubFetch, type FetchAnswer } from "./list-state-harness";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/toast", () => {
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), dismiss: vi.fn() };
  return { toast, showToast: toast };
});
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));
let online = true;
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
vi.mock("@/components/orders/order-form-dialog", () => ({ OrderFormDialog: () => null }));

const order = (id: string, number: string, name: string): OrderListItem => ({
  id,
  orderNumber: number,
  status: "pending",
  totalPrice: 4500,
  wilaya: "16",
  phone: "0555000000",
  createdAt: "2026-10-26T10:00:00.000Z",
  items: [{ id: `${id}-1` }],
  customer: { name, phone: "0555000000" },
  mutationAuthority: "legacy_compatibility",
});
const response: OrdersWorkbenchResponse = {
  orders: [order("a", "ORD-0001", "Amine B."), order("b", "ORD-0002", "Sara K.")],
  fieldAccess: { contact: true, financials: true, risk: false, update: true, delete: false },
  appliedFilters: { q: null, wilaya: null, dateFrom: null, dateTo: null },
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
  sort: "createdAt.desc",
};
const cards = () => screen.queryAllByTestId("data-table-card");
const selectBox = (number: string) =>
  screen.getByRole("checkbox", { name: `orders.workspace.selectOrder|${JSON.stringify({ number })}` });

let answer: FetchAnswer;
let fetchCalls: string[];
beforeEach(() => {
  online = true;
  answer = { status: 200, body: response };
  fetchCalls = stubFetch(() => answer);
});
afterEach(() => vi.unstubAllGlobals());

describe("orders list: a refresh that fails while rows are on screen", () => {
  it("keeps the rows, shows the thin saved-data banner with Refresh, and clears it when the refresh works", async () => {
    mountList(<OrdersDataTable fallback={response} locale="en" />);
    expect(cards()).toHaveLength(2);
    expect(screen.queryByTestId("list-partial-banner")).toBeNull();

    answer = { status: 500, body: { error: "boom" } };
    await refreshLists();
    const banner = await screen.findByTestId("list-partial-banner");
    expect(banner).toHaveAttribute("data-state-kind", "partial");
    expect(banner).toHaveAttribute("data-state-size", "banner");
    expect(cards()).toHaveLength(2);
    expect(screen.queryByTestId("list-error")).toBeNull();

    answer = { status: 200, body: response };
    fireEvent.click(within(banner).getByTestId("state-refresh"));
    await waitFor(() => expect(screen.queryByTestId("list-partial-banner")).toBeNull());
    expect(cards()).toHaveLength(2);
  });
});

describe("orders list: it never loaded", () => {
  it("says what failed, offers Retry, and the retry brings the rows", async () => {
    answer = { status: 500, body: { error: "boom" } };
    // A fallback for another sort is not the answer to this URL, so the list has to fetch.
    mountList(<OrdersDataTable fallback={{ ...response, sort: "orderNumber.asc" }} locale="en" />);
    const error = await screen.findByTestId("list-error");
    expect(error).toHaveAttribute("data-state-kind", "error");
    expect(within(error).getByText("error.requestFailed")).toBeInTheDocument();
    expect(cards()).toHaveLength(0);

    answer = { status: 200, body: response };
    fireEvent.click(within(error).getByTestId("state-retry"));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByTestId("list-error")).toBeNull();
  });
});

describe("orders list: offline", () => {
  it("shows the thin offline banner with the reason and turns every bulk action off", async () => {
    online = false;
    mountList(<OrdersDataTable fallback={response} locale="en" />);
    const banner = screen.getByTestId("list-offline-banner");
    expect(banner).toHaveAttribute("data-state-kind", "offline");
    expect(banner).toHaveAttribute("data-state-size", "banner");
    expect(within(banner).getByText("ordersStates.offline.writesPaused")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);

    fireEvent.click(selectBox("ORD-0001"));
    for (const label of ["orders.confirmSelected", "orders.shipSelected", "orders.cancelSelectedShort", "orders.slip.printSelected"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    expect(fetchCalls.filter((url) => url === "/api/orders/bulk")).toHaveLength(0);
  });

  it("online: no banner and the bulk actions work", () => {
    mountList(<OrdersDataTable fallback={response} locale="en" />);
    expect(screen.queryByTestId("list-offline-banner")).toBeNull();
    fireEvent.click(selectBox("ORD-0001"));
    expect(screen.getByRole("button", { name: "orders.confirmSelected" })).toBeEnabled();
  });
});
