/**
 * @vitest-environment happy-dom
 */
/** The deliveries list on a phone: explicit card slots, and the partial / error / offline states. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliveryWorkbenchResponse } from "@/lib/deliveries/delivery-workbench";
import { DeliveriesDataTable } from "@/components/deliveries/deliveries-data-table";
import { mountList, refreshLists, stubFetch, type FetchAnswer } from "@/components/orders/__tests__/list-state-harness";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/deliveries",
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

const row = (id: string, tracking: string) => ({
  id,
  orderId: `o-${id}`,
  provider: "yalidine",
  trackingNumber: tracking,
  cost: 600,
  status: "created",
  estimatedDelivery: null,
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
  order: { id: `o-${id}`, orderNumber: `ORD-${id}`, wilaya: "16", customer: { name: "Amine B.", phone: "0555000000" } },
});
const response: DeliveryWorkbenchResponse = {
  deliveries: [row("1", "YAL-100"), row("2", "YAL-200")],
  fieldAccess: { contact: true, financials: true, manage: true, export: false },
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};
const cards = () => screen.queryAllByTestId("data-table-card");
const slotText = (card: HTMLElement, slot: string) => card.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "";

let answer: FetchAnswer;
beforeEach(() => {
  online = true;
  answer = { status: 200, body: response };
  stubFetch(() => answer);
});
afterEach(() => vi.unstubAllGlobals());

describe("deliveries list cards", () => {
  it("tracking number is the title, the order the subtitle, cost and date the footer, status the chip, a row menu", () => {
    mountList(<DeliveriesDataTable fallback={response} status="all" locale="en" />);
    expect(screen.queryByRole("table")).toBeNull();
    const first = cards()[0] as HTMLElement;
    expect(slotText(first, "title")).toBe("YAL-100");
    expect(slotText(first, "subtitle")).toContain("ORD-1");
    expect(slotText(first, "amount")).toMatch(/600/);
    expect(slotText(first, "time")).not.toBe("");
    expect(slotText(first, "status")).not.toBe("");
    expect(first.querySelector('[data-slot="actions"]')).not.toBeNull();
    expect([...first.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "deliveries.table.customer",
      "deliveries.table.carrier",
    ]);
  });

  it("without the financials right there is no amount, without the contact right no customer field", () => {
    const limited: DeliveryWorkbenchResponse = {
      ...response,
      fieldAccess: { ...response.fieldAccess, financials: false, contact: false },
    };
    answer = { status: 200, body: limited };
    mountList(<DeliveriesDataTable fallback={limited} status="all" locale="en" />);
    const first = cards()[0] as HTMLElement;
    expect(first.querySelector('[data-slot="amount"]')).toBeNull();
    expect([...first.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["deliveries.table.carrier"]);
    expect(slotText(first, "title")).toBe("YAL-100");
  });
});

describe("deliveries list states", () => {
  it("a failed refresh keeps the rows and shows the partial banner with Refresh", async () => {
    mountList(<DeliveriesDataTable fallback={response} status="all" locale="en" />);
    await waitFor(() => expect(cards()).toHaveLength(2));
    answer = { status: 500, body: { error: "boom" } };
    await refreshLists();
    const banner = await screen.findByTestId("list-partial-banner");
    expect(banner).toHaveAttribute("data-state-kind", "partial");
    expect(cards()).toHaveLength(2);
    answer = { status: 200, body: response };
    fireEvent.click(within(banner).getByTestId("state-refresh"));
    await waitFor(() => expect(screen.queryByTestId("list-partial-banner")).toBeNull());
  });

  it("a list that never loaded shows the error with Retry", async () => {
    answer = { status: 500, body: { error: "boom" } };
    mountList(<DeliveriesDataTable fallback={{ ...response, page: 2 }} status="all" locale="en" />);
    const error = await screen.findByTestId("list-error");
    expect(within(error).getByText("error.requestFailed")).toBeInTheDocument();
    answer = { status: 200, body: response };
    fireEvent.click(within(error).getByTestId("state-retry"));
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it("offline shows the thin banner and keeps the rows", () => {
    online = false;
    mountList(<DeliveriesDataTable fallback={response} status="all" locale="en" />);
    const banner = screen.getByTestId("list-offline-banner");
    expect(banner).toHaveAttribute("data-state-kind", "offline");
    expect(within(banner).getByText("ordersStates.offline.writesPaused")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
  });
});
