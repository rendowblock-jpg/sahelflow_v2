/**
 * @vitest-environment happy-dom
 */
/**
 * The confirmation queue is where a seller accepts or rejects every new order. DataTable v2 shows one card per row on a
 * phone, so the decision controls must be IN the card: wave 1 kept this table as a table (layout="table") because its
 * action column was not a card slot; wave 2 maps that column to the card's "actions" slot. This pins the result: on a
 * phone-width screen every order is a card whose actions slot holds the decision buttons, and the order number links to
 * the review page.
 */
import { screen, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmationQueueTable } from "@/components/orders/confirmation-queue-table";
import { render } from "@/test-utils/render";
import type { ConfirmationQueueResponse } from "@/types/workbench";

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

const response: ConfirmationQueueResponse = {
  queue: [
    {
      id: "ord-57",
      orderNumber: "ORD-0057",
      version: 1,
      ageMinutes: 12,
      isStale: false,
      ageLabel: "12 min",
      mutationAuthority: "canonical_v1",
      canUpdate: true,
      customerName: "Ahmed Benali",
      phone: "+213555010203",
      wilaya: "16",
      totalPrice: 450000,
    },
  ],
  fieldAccess: { contact: true, financials: true },
  total: 1,
  staleCount: 0,
  totalValue: 450000,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("confirmation queue on a phone-width screen", () => {
  it("is a card per order with its decision buttons inside the card and a link to the review page", () => {
    render(
      <NuqsTestingAdapter>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <ConfirmationQueueTable fallback={response} locale="en" />
        </SWRConfig>
      </NuqsTestingAdapter>,
    );
    expect(screen.queryByRole("table")).toBeNull();
    const cardsOnScreen = screen.getAllByTestId("data-table-card");
    expect(cardsOnScreen).toHaveLength(1);
    const card = cardsOnScreen[0] as HTMLElement;
    const actions = card.querySelector('[data-slot="actions"]');
    expect(actions, "the card has an actions slot").not.toBeNull();
    expect(within(actions as HTMLElement).getAllByRole("button").length).toBeGreaterThanOrEqual(2);
    const links = within(card).getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "/orders/ord-57")).toBe(true);
  });
});
