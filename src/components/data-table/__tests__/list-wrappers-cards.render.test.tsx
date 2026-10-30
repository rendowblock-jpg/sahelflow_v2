/**
 * @vitest-environment happy-dom
 */
/**
 * The five list tables (orders, deliveries, returns, customers, products) feed their own columns into the shared
 * DataTable. This renders each real wrapper on a phone (use-mobile says so) with sample rows and checks that the DEFAULT
 * mapping gives a usable card with no change to the wrapper: a title with the row's identity, no table, no cell twice.
 * Orders also carries explicit slots, checked in detail.
 */
import { screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { DeliveryWorkbenchResponse } from "@/lib/deliveries/delivery-workbench";
import type { ReturnWorkbenchResponse } from "@/lib/returns/return-workbench";
import type { OrderListItem, OrdersWorkbenchResponse } from "@/types/workbench";

import { CustomersDataTable } from "@/components/customers/customers-data-table";
import { DeliveriesDataTable } from "@/components/deliveries/deliveries-data-table";
import { OrdersDataTable } from "@/components/orders/orders-data-table";
import { ProductsDataTable } from "@/components/products/products-data-table";
import { ReturnsDataTable } from "@/components/returns/returns-data-table";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/list",
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
vi.mock("@/components/orders/order-form-dialog", () => ({ OrderFormDialog: () => null }));

let payload: unknown;
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(ui: ReactElement, response: unknown) {
  payload = response;
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>
    </NuqsTestingAdapter>,
  );
}
const page = { total: 2, hasNextPage: false, page: 1, pageSize: 25 };
const cards = () => screen.getAllByTestId("data-table-card");
const slotText = (card: HTMLElement, slot: string) => card.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "";

function expectPhoneCards(count: number) {
  expect(screen.queryByRole("table")).toBeNull();
  expect(cards()).toHaveLength(count);
  expect(screen.getAllByRole("list")).toHaveLength(1);
  for (const card of cards()) expect(slotText(card, "title").trim()).not.toBe("");
}

describe("orders (explicit slots)", () => {
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
    ...page,
    sort: "createdAt.desc",
  };

  it("shows number and customer as the identity, the status chip, the amount and date as the footer, and a row menu", async () => {
    mount(<OrdersDataTable fallback={response} locale="en" />, response);
    expectPhoneCards(2);
    const first = cards()[0] as HTMLElement;
    expect(slotText(first, "title")).toBe("ORD-0001");
    expect(slotText(first, "subtitle")).toContain("Amine B.");
    expect(slotText(first, "subtitle")).toContain("0555000000");
    expect(within(first.querySelector('[data-slot="status"]') as HTMLElement).getAllByRole("button").length).toBeGreaterThan(0);
    expect(slotText(first, "amount")).toMatch(/4[\s,.\u202f\u00a0]?500/);
    expect(slotText(first, "time")).not.toBe("");
    expect(first.querySelector('[data-slot="actions"]')).not.toBeNull();
    expect(first.querySelector('[data-slot="select"]')).not.toBeNull();
    const terms = [...first.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toEqual(["orders.items", "orders.wilaya"]);
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it("without the update right there is no checkbox, and without financials no amount", () => {
    const limited: OrdersWorkbenchResponse = { ...response, fieldAccess: { ...response.fieldAccess, update: false, financials: false } };
    mount(<OrdersDataTable fallback={limited} locale="en" />, limited);
    const first = cards()[0] as HTMLElement;
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(first.querySelector('[data-slot="amount"]')).toBeNull();
    expect(slotText(first, "title")).toBe("ORD-0001");
  });
});

describe("the other four tables work on cards with the default mapping, wrapper untouched", () => {
  it("deliveries: the tracking number is the title", () => {
    const row = (id: string, tracking: string) => ({
      id,
      orderId: `o-${id}`,
      provider: "yalidine",
      trackingNumber: tracking,
      cost: 600,
      status: "created",
      estimatedDelivery: null,
      createdAt: "2026-10-26T10:00:00.000Z",
      order: { id: `o-${id}`, orderNumber: `ORD-${id}`, wilaya: "16", customer: { name: "Amine B.", phone: "0555000000" } },
    });
    const response: DeliveryWorkbenchResponse = {
      deliveries: [row("1", "YAL-100"), row("2", "YAL-200")],
      fieldAccess: { contact: true, financials: true, manage: true, export: false },
      ...page,
    };
    mount(<DeliveriesDataTable fallback={response} status="all" locale="en" />, response);
    expectPhoneCards(2);
    expect(slotText(cards()[0] as HTMLElement, "title")).toBe("YAL-100");
  });

  it("returns: the order number is the title", () => {
    const row = (id: string) => ({
      id,
      orderId: `o-${id}`,
      reason: "Wrong size",
      status: "requested",
      type: "return",
      notes: null,
      createdAt: "2026-10-26T10:00:00.000Z",
      order: { id: `o-${id}`, orderNumber: `ORD-${id}`, customer: { name: "Sara K." } },
    });
    const response: ReturnWorkbenchResponse = {
      returns: [row("1"), row("2")],
      fieldAccess: { contact: true, financials: true, manage: true, create: true, export: false },
      ...page,
    };
    mount(<ReturnsDataTable fallback={response} locale="en" />, response);
    expectPhoneCards(2);
    expect(slotText(cards()[0] as HTMLElement, "title")).toContain("ORD-1");
  });

  it("customers: the name is the title", () => {
    type Props = ComponentProps<typeof CustomersDataTable>["fallback"];
    const row = (id: string, name: string) => ({
      id,
      name,
      phone: "0555000000",
      wilaya: "16",
      commune: null,
      orderCount: 3,
      totalSpent: 9000,
      riskScore: null,
      isBlacklisted: false,
      createdAt: "2026-10-26T10:00:00.000Z",
    });
    const response: Props = {
      customers: [row("1", "Amine B."), row("2", "Sara K.")],
      fieldAccess: { contact: true, financials: true, risk: false, manage: true, contactUpdate: true, import: false, export: false },
      ...page,
    };
    mount(<CustomersDataTable fallback={response} locale="en" />, response);
    expectPhoneCards(2);
    expect(slotText(cards()[0] as HTMLElement, "title")).toContain("Amine B.");
    // The fifth and later columns do not crowd the card: at most four label/value pairs.
    for (const card of cards()) expect(card.querySelectorAll("dt").length).toBeLessThanOrEqual(4);
  });

  it("products: the name is the title", () => {
    type Props = ComponentProps<typeof ProductsDataTable>["fallback"];
    const row = (id: string, name: string) => ({
      id,
      name,
      sku: `SKU-${id}`,
      price: 2500,
      cost: 1200,
      stock: 8,
      lowStockThreshold: 3,
      categoryId: null,
      images: null,
      productVariants: [],
      isActive: true,
      createdAt: "2026-10-26T10:00:00.000Z",
    });
    const response: Props = {
      products: [row("1", "Cotton tee"), row("2", "Linen shirt")],
      fieldAccess: { cost: true, manage: true, costUpdate: true, import: false, export: false },
      ...page,
    };
    mount(<ProductsDataTable fallback={response} categories={[]} />, response);
    expectPhoneCards(2);
    expect(slotText(cards()[0] as HTMLElement, "title")).toContain("Cotton tee");
  });
});
