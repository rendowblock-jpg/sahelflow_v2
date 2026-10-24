/**
 * @vitest-environment happy-dom
 */
/**
 * The status tabs on /orders and /deliveries are links to a re-rendered
 * page, not controls for a panel that sits in the same document. Radix still
 * wrote `aria-controls="<base>-content-<value>"` on every tab, and axe
 * (`aria-valid-attr-value`, critical) fails the selected tab because that id
 * does not exist. Assert the rule axe applies, without axe: every id named by
 * an ARIA reference attribute must be in the document. Mounts the real page
 * components (data layer and the two heavy data tables are mocked) so the
 * tabs, the page header, the stat cards and the orders filter bar are real.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DeliveriesPage from "@/app/(dashboard)/deliveries/page";
import OrdersPage from "@/app/(dashboard)/orders/page";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/orders",
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
    order: {
      groupBy: async () => [
        { status: "pending", _count: { _all: 3 } },
        { status: "delivered", _count: { _all: 2 } },
      ],
      count: async () => 5,
      aggregate: async () => ({ _sum: { totalPrice: 1000 } }),
    },
    customer: { findMany: async () => [] },
    product: { findMany: async () => [] },
    delivery: {
      groupBy: async () => [
        { status: "pending", _count: { _all: 2 } },
        { status: "delivered", _count: { _all: 1 } },
      ],
      aggregate: async () => ({ _sum: { cost: 500 } }),
    },
  },
}));

vi.mock("@/lib/orders/order-list-workbench", () => ({
  getOrdersWorkbenchPage: async () => ({
    orders: [],
    total: 0,
    pageSize: 25,
    sort: "newest",
    fieldAccess: { risk: true, financials: true },
  }),
  getOrdersWorkbenchStatusCounts: async () => null,
  resolveOrdersWorkbenchAccess: () => ({ risk: true, financials: true }),
}));

vi.mock("@/lib/deliveries/delivery-workbench", () => ({
  getDeliveryWorkbenchPage: async () => ({ deliveries: [], total: 0, pageSize: 25 }),
  resolveDeliveryWorkbenchAccess: () => ({ financials: true, export: true, manage: true }),
}));

// The orders table body is replaced by the real filter bar it mounts; the
// create dialog and the deliveries table are not part of the filter strip.
vi.mock("@/components/orders/orders-data-table", async () => {
  const { OrdersFilterBar } = await import("@/components/orders/orders-filter-bar");
  return { OrdersDataTable: () => <OrdersFilterBar /> };
});
vi.mock("@/components/shared/create-param-dialog", () => ({ CreateParamDialog: () => null }));
vi.mock("@/components/deliveries/deliveries-data-table", () => ({
  DeliveriesDataTable: () => null,
}));

const ID_ATTRIBUTES = [
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-activedescendant",
  "aria-owns",
] as const;

/** Every id an ARIA attribute inside `root` names that is absent from the document. */
function danglingIds(root: HTMLElement): string[] {
  const missing: string[] = [];
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of ID_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      for (const id of value.split(/\s+/)) {
        if (!document.getElementById(id)) {
          missing.push(`${attribute}="${id}" on <${element.tagName.toLowerCase()}>`);
        }
      }
    }
  }
  return missing;
}

function expectNoDanglingIds(root: HTMLElement): void {
  const missing = danglingIds(root);
  if (missing.length > 0) expect.fail(`ids missing from the page: ${missing.join("; ")}`);
}

type Search = Record<string, string>;

const PAGES: Array<{
  name: string;
  load: (search: Search) => Promise<ReactElement>;
  tabCount: number;
  changeTo: string;
}> = [
  {
    name: "/orders",
    load: async (search) => (await OrdersPage({ searchParams: Promise.resolve(search) })) as ReactElement,
    tabCount: 7,
    changeTo: "pending",
  },
  {
    name: "/deliveries",
    load: async (search) =>
      (await DeliveriesPage({ searchParams: Promise.resolve(search) })) as ReactElement,
    tabCount: 6,
    changeTo: "delivered",
  },
];

async function mount(page: (typeof PAGES)[number], search: Search = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  const ui = await page.load(search);
  return render(<NuqsTestingAdapter>{ui}</NuqsTestingAdapter>);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe.each(PAGES)("$name status tabs ARIA references", (page) => {
  it("default state: no ARIA reference names an id that is missing from the page", async () => {
    const { container } = await mount(page);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThanOrEqual(page.tabCount - 1);
    expectNoDanglingIds(container);
  });

  it("after one tab change (client state and a fresh server render) the references still resolve", async () => {
    const { container, unmount } = await mount(page);
    const target = screen
      .getAllByRole("tab")
      .find((tab) => (tab.getAttribute("href") ?? "").includes(`status=${page.changeTo}`));
    expect(target).toBeDefined();
    fireEvent.mouseDown(target as HTMLElement, { button: 0 });
    expect(target?.getAttribute("aria-selected")).toBe("true");
    expectNoDanglingIds(container);
    unmount();

    const next = await mount(page, { status: page.changeTo });
    const selected = screen.getAllByRole("tab").filter((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("href") ?? "").toContain(`status=${page.changeTo}`);
    expectNoDanglingIds(next.container);
  });

  it("still a tablist of link tabs with one selected tab and roving arrow keys", async () => {
    await mount(page);
    expect(screen.getByRole("tablist")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.every((tab) => tab.tagName === "A" && tab.hasAttribute("href"))).toBe(true);
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
    const first = tabs[0] as HTMLElement;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    // Radix moves focus on the next macrotask.
    await waitFor(() => expect(document.activeElement).toBe(tabs[1]));
  });
});
