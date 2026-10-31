/**
 * @vitest-environment happy-dom
 */
/** The returns list on a phone: explicit card slots, and the partial / error / offline states. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReturnWorkbenchResponse } from "@/lib/returns/return-workbench";
import { ReturnsDataTable } from "@/components/returns/returns-data-table";
import { mountList, refreshLists, stubFetch, type FetchAnswer } from "@/components/orders/__tests__/list-state-harness";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/returns",
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
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};
const cards = () => screen.queryAllByTestId("data-table-card");
const slotText = (card: HTMLElement, slot: string) => card.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "";
const enabledButtons = (scope: HTMLElement) =>
  within(scope)
    .queryAllByRole("button")
    .filter((button) => !(button as HTMLButtonElement).disabled && button.getAttribute("aria-disabled") !== "true");

let answer: FetchAnswer;
beforeEach(() => {
  online = true;
  answer = { status: 200, body: response };
  stubFetch(() => answer);
});
afterEach(() => vi.unstubAllGlobals());

describe("returns list cards", () => {
  it("order number is the title, customer the subtitle, type and reason the fields, status the chip, date the footer", () => {
    mountList(<ReturnsDataTable fallback={response} locale="en" />);
    expect(screen.queryByRole("table")).toBeNull();
    const first = cards()[0] as HTMLElement;
    expect(slotText(first, "title")).toContain("ORD-1");
    expect(slotText(first, "subtitle")).toContain("Sara K.");
    expect(slotText(first, "time")).not.toBe("");
    expect(slotText(first, "status")).not.toBe("");
    expect(first.querySelector('[data-slot="amount"]')).toBeNull();
    expect(first.querySelector('[data-slot="actions"]')).not.toBeNull();
    expect([...first.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["returns.table.type", "returns.table.reason"]);
    expect(first.textContent).toContain("Wrong size");
  });

  it("without the contact right the customer is not on the card", () => {
    const limited: ReturnWorkbenchResponse = { ...response, fieldAccess: { ...response.fieldAccess, contact: false } };
    answer = { status: 200, body: limited };
    mountList(<ReturnsDataTable fallback={limited} locale="en" />);
    const first = cards()[0] as HTMLElement;
    expect(first.textContent).not.toContain("Sara K.");
    expect(slotText(first, "title")).toContain("ORD-1");
  });
});

describe("returns list states", () => {
  it("a failed refresh keeps the rows and shows the partial banner with Refresh", async () => {
    mountList(<ReturnsDataTable fallback={response} locale="en" />);
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
    mountList(<ReturnsDataTable fallback={{ ...response, page: 2 }} locale="en" />);
    const error = await screen.findByTestId("list-error");
    expect(within(error).getByText("error.requestFailed")).toBeInTheDocument();
    answer = { status: 200, body: response };
    fireEvent.click(within(error).getByTestId("state-retry"));
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it("online: the status chips are live and there is no offline banner", () => {
    mountList(<ReturnsDataTable fallback={response} locale="en" />);
    const statusSlot = (cards()[0] as HTMLElement).querySelector('[data-slot="status"]') as HTMLElement;
    expect(enabledButtons(statusSlot).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("list-offline-banner")).toBeNull();
  });

  it("offline: banner with the reason, rows kept, status chips switched off", () => {
    online = false;
    mountList(<ReturnsDataTable fallback={response} locale="en" />);
    const banner = screen.getByTestId("list-offline-banner");
    expect(within(banner).getByText("ordersStates.offline.writesPaused")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    for (const card of cards()) {
      expect(enabledButtons(card.querySelector('[data-slot="status"]') as HTMLElement)).toHaveLength(0);
    }
  });
});
