/**
 * @vitest-environment happy-dom
 */
/**
 * P5 slice 1, the REAL orders list rendered with a fake network: what a seller sees and what leaves the browser when
 * they run a bulk status change. Until now no test rendered this flow at all (the contract test only read source).
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { OrderListItem, OrdersWorkbenchResponse } from "@/types/workbench";

import { OrdersDataTable } from "../orders-data-table";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: h.refresh, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/toast", () => ({ toast: h.toast, showToast: h.toast }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));
vi.mock("../order-form-dialog", () => ({ OrderFormDialog: () => null }));

function order(id: string, number: string, status = "pending"): OrderListItem {
  return {
    id,
    orderNumber: number,
    status,
    totalPrice: 4500,
    wilaya: "16",
    phone: "0555000000",
    createdAt: "2026-10-26T10:00:00.000Z",
    items: [{ id: `${id}-1` }],
    customer: { name: "Test Customer", phone: "0555000000" },
    mutationAuthority: "legacy_compatibility",
  };
}

function fallback(orders: OrderListItem[]): OrdersWorkbenchResponse {
  return {
    orders,
    fieldAccess: { contact: true, financials: true, risk: false, update: true, delete: false },
    appliedFilters: { q: null, wilaya: null, dateFrom: null, dateTo: null },
    total: orders.length,
    hasNextPage: false,
    page: 1,
    pageSize: 25,
    sort: "createdAt.desc",
  };
}

const THREE = [order("a", "ORD-0001"), order("b", "ORD-0002"), order("c", "ORD-0003")];
let bulkAnswer: () => { status: number; body: unknown };
let bulkCalls: Array<{ ids: string[]; status: string }>;
const firstCall = () => bulkCalls[0] as { ids: string[]; status: string };
let bulkGate: Promise<void>;

beforeEach(() => {
  Object.values(h.toast).forEach((fn) => fn.mockClear());
  h.push.mockClear();
  h.refresh.mockClear();
  bulkCalls = [];
  bulkGate = Promise.resolve();
  bulkAnswer = () => ({ status: 200, body: { succeeded: ["a", "b"], failed: [] } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/orders/bulk") {
        bulkCalls.push(JSON.parse(String(init?.body)));
        await bulkGate;
        const { status, body } = bulkAnswer();
        return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(fallback(THREE)), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(orders = THREE, statusFilter: "all" | "shipped" = "all") {
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <OrdersDataTable fallback={fallback(orders)} locale="en" statusFilter={statusFilter} />
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}
const pick = (number: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: `orders.workspace.selectOrder|${JSON.stringify({ number })}` }));
const bar = () => screen.queryByTestId("data-table-bulk-bar");

describe("naming and announcing the selection", () => {
  it("names every row checkbox after its order number", () => {
    mount();
    for (const number of ["ORD-0001", "ORD-0002", "ORD-0003"]) {
      expect(screen.getByRole("checkbox", { name: `orders.workspace.selectOrder|${JSON.stringify({ number })}` })).toBeInTheDocument();
    }
  });

  it("announces the selection count in a polite live region", () => {
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    expect(screen.getByTestId("data-table-selection-status")).toHaveTextContent('dataTable.selected|{"count":2}');
  });
});

describe("bulk confirm: one click, as before", () => {
  it("sends at once, with no question, and clears the selection on a clean success", async () => {
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    await waitFor(() => expect(bulkCalls).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect([...firstCall().ids].sort()).toEqual(["a", "b"]);
    expect(firstCall().status).toBe("confirmed");
    await waitFor(() => expect(bar()).toBeNull());
    expect(h.toast.success).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("orders-bulk-failure-notice")).toBeNull();
  });
});

describe("bulk ship and bulk cancel ask first", () => {
  it.each([
    ["orders.shipSelected", "shipped", "orders.workspace.bulk.shipTitle"],
    ["orders.cancelSelectedShort", "cancelled", "orders.workspace.bulk.cancelTitle"],
  ])("%s opens a question and sends nothing until it is confirmed", async (label, status, title) => {
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    fireEvent.click(screen.getByRole("button", { name: label }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    expect(within(dialog).getByText(/"count":2/)).toBeInTheDocument();
    expect(bulkCalls).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "orders.workspace.bulk.goBack" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(bulkCalls).toHaveLength(0);
    expect(bar()).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: label }));
    const again = await screen.findByRole("alertdialog");
    fireEvent.click(within(again).getAllByRole("button")[1] as HTMLElement);
    await waitFor(() => expect(bulkCalls).toHaveLength(1));
    expect(firstCall().status).toBe(status);
    expect([...firstCall().ids].sort()).toEqual(["a", "b"]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("sends exactly one request even if the confirm button is pressed twice", async () => {
    mount();
    pick("ORD-0001");
    fireEvent.click(screen.getByRole("button", { name: "orders.cancelSelectedShort" }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getAllByRole("button")[1] as HTMLElement;
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(bulkCalls.length).toBeGreaterThan(0));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(bulkCalls).toHaveLength(1);
  });
});

describe("two presses in the same instant", () => {
  it("send one request: a second press before the screen has redrawn must not start a second batch", async () => {
    let release: () => void = () => undefined;
    bulkGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mount();
    pick("ORD-0001");
    const button = screen.getByRole("button", { name: "orders.confirmSelected" });
    // One act(): React has not redrawn between the two clicks, so the button is still enabled for the second one.
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(bulkCalls).toHaveLength(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(bulkCalls).toHaveLength(1);
    release();
    await waitFor(() => expect(bar()).toBeNull());
    expect(bulkCalls).toHaveLength(1);
  });
});

describe("a batch that only partly worked", () => {
  it("lists the orders that failed, in the seller's language, and keeps only them selected", async () => {
    bulkAnswer = () => ({
      status: 200,
      body: {
        succeeded: ["a", "c"],
        failed: [{ id: "b", error: "Cannot transition from 'cancelled' to 'confirmed'. Allowed: (none)", code: "INVALID_TRANSITION" }],
      },
    });
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    pick("ORD-0003");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));

    const notice = await screen.findByTestId("orders-bulk-failure-notice");
    expect(notice).toHaveTextContent('orders.workspace.bulk.failedTitle|{"failed":1,"total":3}');
    expect(within(notice).getByText("ORD-0002")).toBeInTheDocument();
    expect(notice).toHaveTextContent("orders.workspace.bulk.reason.invalid_transition");
    expect(notice.textContent).not.toContain("Cannot transition");

    await waitFor(() => expect(within(bar() as HTMLElement).getByText('dataTable.selected|{"count":1}')).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: 'orders.workspace.selectOrder|{"number":"ORD-0002"}' })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: 'orders.workspace.selectOrder|{"number":"ORD-0001"}' })).not.toBeChecked();
    expect(h.toast.warning).toHaveBeenCalledTimes(1);
  });

  it("the notice can be dismissed and the selection stays", async () => {
    bulkAnswer = () => ({ status: 200, body: { succeeded: ["a"], failed: [{ id: "b", code: "NOT_FOUND" }] } });
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    const notice = await screen.findByTestId("orders-bulk-failure-notice");
    fireEvent.click(within(notice).getByRole("button", { name: "common.dismiss" }));
    expect(screen.queryByTestId("orders-bulk-failure-notice")).toBeNull();
    expect(bar()).not.toBeNull();
  });

  it("a new batch replaces the old notice", async () => {
    bulkAnswer = () => ({ status: 200, body: { succeeded: ["a"], failed: [{ id: "b", code: "NOT_FOUND" }] } });
    mount();
    pick("ORD-0001");
    pick("ORD-0002");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    await screen.findByTestId("orders-bulk-failure-notice");
    bulkAnswer = () => ({ status: 200, body: { succeeded: ["b"], failed: [] } });
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    await waitFor(() => expect(screen.queryByTestId("orders-bulk-failure-notice")).toBeNull());
    await waitFor(() => expect(bar()).toBeNull());
  });
});

describe("when the answer cannot be trusted", () => {
  it("does not claim success for a body it cannot read, and keeps the selection", async () => {
    bulkAnswer = () => ({ status: 200, body: { hello: "world" } });
    mount();
    pick("ORD-0001");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("orders.workspace.bulk.unreadable"));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();
  });

  it("keeps the selection when the request itself fails", async () => {
    bulkAnswer = () => ({ status: 500, body: { error: "boom" } });
    mount();
    pick("ORD-0001");
    fireEvent.click(screen.getByRole("button", { name: "orders.confirmSelected" }));
    await waitFor(() => expect(bulkCalls).toHaveLength(1));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();
  });
});

describe("an empty status tab", () => {
  it("is not first use: it says the status is empty and shows all orders", () => {
    mount([], "shipped");
    expect(screen.getByText("orders.workspace.emptyStatus.title")).toBeInTheDocument();
    expect(screen.queryByText("orders.empty.title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "orders.workspace.emptyStatus.action" }));
    expect(h.push).toHaveBeenCalledWith("/orders");
  });

  it("still teaches on a shop with no orders at all", () => {
    mount([], "all");
    expect(screen.getByText("orders.empty.title")).toBeInTheDocument();
  });
});
