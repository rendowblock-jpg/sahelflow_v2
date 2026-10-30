/**
 * @vitest-environment happy-dom
 */
/** The confirmation queue in the states a seller meets: failed refresh over rows, never loaded, offline. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmationQueueItem, ConfirmationQueueResponse } from "@/types/workbench";
import { ConfirmationQueueTable } from "@/components/orders/confirmation-queue-table";
import { mountList, refreshLists, stubFetch, type FetchAnswer } from "./list-state-harness";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/orders/confirmation-queue",
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

const item = (id: string, number: string, name: string): ConfirmationQueueItem => ({
  id,
  orderNumber: number,
  version: 1,
  ageMinutes: 42,
  isStale: false,
  ageLabel: "42m",
  mutationAuthority: "legacy_compatibility",
  canUpdate: true,
  customerName: name,
  phone: "0555000000",
  wilaya: "16",
  totalPrice: 4500,
});
const response: ConfirmationQueueResponse = {
  queue: [item("a", "ORD-0001", "Amine B."), item("b", "ORD-0002", "Sara K.")],
  fieldAccess: { contact: true, financials: true },
  total: 2,
  staleCount: 0,
  totalValue: 9000,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};
const cards = () => screen.queryAllByTestId("data-table-card");
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

describe("confirmation queue states", () => {
  it("a failed refresh keeps the rows and shows the partial banner with Refresh", async () => {
    mountList(<ConfirmationQueueTable fallback={response} locale="en" />);
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

  it("a queue that never loaded says what failed and Retry brings it back", async () => {
    answer = { status: 500, body: { error: "boom" } };
    mountList(<ConfirmationQueueTable fallback={{ ...response, page: 2 }} locale="en" />);
    const error = await screen.findByTestId("list-error");
    expect(within(error).getByText("error.requestFailed")).toBeInTheDocument();
    answer = { status: 200, body: response };
    fireEvent.click(within(error).getByTestId("state-retry"));
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it("online: no banner, row decisions and bulk actions are live", () => {
    mountList(<ConfirmationQueueTable fallback={response} locale="en" />);
    expect(screen.queryByTestId("list-offline-banner")).toBeNull();
    const first = cards()[0] as HTMLElement;
    // The decision buttons are the point of this page: they must be ON the phone card, in the actions slot.
    const actions = first.querySelector('[data-slot="actions"]') as HTMLElement;
    expect(enabledButtons(actions).length).toBeGreaterThan(0);
    const slot = (name: string) => first.querySelector(`[data-slot="${name}"]`)?.textContent ?? "";
    expect(slot("title")).toContain("ORD-0001");
    expect(slot("subtitle")).toContain("Amine B.");
    expect(slot("amount")).toMatch(/4[\s,.\u202f\u00a0]?500/);
    expect(slot("time")).toContain("42");
  });

  it("offline: banner with the reason, rows kept, every decision button off", () => {
    online = false;
    mountList(<ConfirmationQueueTable fallback={response} locale="en" />);
    const banner = screen.getByTestId("list-offline-banner");
    expect(within(banner).getByText("ordersStates.offline.writesPaused")).toBeInTheDocument();
    expect(cards()).toHaveLength(2);
    const actions = (cards()[0] as HTMLElement).querySelector('[data-slot="actions"]') as HTMLElement;
    expect(within(actions).queryAllByRole("button").length).toBeGreaterThan(0);
    expect(enabledButtons(actions)).toHaveLength(0);
    fireEvent.click(screen.getAllByRole("checkbox")[0] as HTMLElement);
    expect(screen.getByRole("button", { name: "orders.confirmSelected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "confirmationQueue.bulk.rejectSelected" })).toBeDisabled();
  });
});
