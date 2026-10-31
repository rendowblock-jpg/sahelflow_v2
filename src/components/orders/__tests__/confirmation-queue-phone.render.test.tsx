/**
 * @vitest-environment happy-dom
 */
/** On a phone, every confirmation-queue card carries Confirm, Reject and Review (the point of the page). */
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmationQueueItem, ConfirmationQueueResponse } from "@/types/workbench";
import { ConfirmationQueueTable } from "@/components/orders/confirmation-queue-table";
import { mountList, stubFetch } from "./list-state-harness";

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
    locale: "ar",
    dir: "rtl",
  }),
}));
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }));

const item = (id: string, number: string, name: string, phone: string, wilaya: string, total: number): ConfirmationQueueItem => ({
  id,
  orderNumber: number,
  version: 1,
  ageMinutes: 42,
  isStale: false,
  ageLabel: "42m",
  mutationAuthority: "legacy_compatibility",
  canUpdate: true,
  customerName: name,
  phone,
  wilaya,
  totalPrice: total,
});
const response: ConfirmationQueueResponse = {
  queue: [
    item("a", "ORD-0101", "أمين بن علي", "+213555123456", "16", 4500),
    item("b", "ORD-0102", "سارة قاسمي", "+213770654321", "31", 12800),
    item("c", "ORD-0103", "يوسف بوزيد", "+213661987654", "25", 7300),
    { ...item("d", "ORD-0104", "ليلى مزياني", "+213550112233", "09", 3900), canUpdate: false },
  ],
  fieldAccess: { contact: true, financials: true },
  total: 4,
  staleCount: 0,
  totalValue: 28500,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};

beforeEach(() => stubFetch(() => ({ status: 200, body: response })));
afterEach(() => vi.unstubAllGlobals());

describe("confirmation queue on a phone", () => {
  const cardOf = (orderNumber: string) => {
    const card = screen.getAllByTestId("data-table-card").find((el) => el.textContent?.includes(orderNumber));
    expect(card, orderNumber).toBeDefined();
    return card as HTMLElement;
  };
  const actionsOf = (card: HTMLElement) => within(card.querySelector('[data-slot="actions"]') as HTMLElement);

  it("a row the seller may decide carries Confirm and Reject in its actions slot, and Review is the card's own link", async () => {
    mountList(<ConfirmationQueueTable fallback={response} locale="ar" />);
    await waitFor(() => expect(screen.queryAllByTestId("data-table-card")).toHaveLength(4));
    for (const [orderNumber, id] of [["ORD-0101", "a"], ["ORD-0102", "b"], ["ORD-0103", "c"]] as const) {
      const card = cardOf(orderNumber);
      expect(card.querySelector('[data-slot="actions"]'), orderNumber).not.toBeNull();
      expect(actionsOf(card).getByRole("button", { name: "confirmationQueue.inline.confirm" })).toBeEnabled();
      expect(actionsOf(card).getByRole("button", { name: "confirmationQueue.inline.reject" })).toBeEnabled();
      expect(card.querySelector(`a[href="/orders/${id}"]`), `${orderNumber} review link`).not.toBeNull();
    }
  });

  it("a row the seller may not decide carries Review in its actions slot instead", async () => {
    mountList(<ConfirmationQueueTable fallback={response} locale="ar" />);
    await waitFor(() => expect(screen.queryAllByTestId("data-table-card")).toHaveLength(4));
    const card = cardOf("ORD-0104");
    expect(actionsOf(card).getByRole("link", { name: "orders.workspace.confirmation.review" })).toHaveAttribute("href", "/orders/d");
    expect(actionsOf(card).queryByRole("button", { name: "confirmationQueue.inline.confirm" })).toBeNull();
  });
});
