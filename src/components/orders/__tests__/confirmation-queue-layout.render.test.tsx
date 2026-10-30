/**
 * @vitest-environment happy-dom
 */
/**
 * The confirmation queue is where a seller accepts or rejects every new order. Wave 1 turned the shared table into one
 * card per row below 768 px, but this table's action column (id "action") is not one of the card slots, so on a phone the
 * Confirm / Reject / Review controls would fall off the card. Until the queue has its own slot map (wave 2), it keeps the
 * table at every width, exactly as before wave 1: a real <table> with a row per order and a review link.
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
  it("stays a table with a row per order and a review link (no card layout)", () => {
    render(
      <NuqsTestingAdapter>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <ConfirmationQueueTable fallback={response} locale="en" />
        </SWRConfig>
      </NuqsTestingAdapter>,
    );
    expect(screen.queryByTestId("data-table-card")).toBeNull();
    const row = screen.getAllByRole("row").find((candidate) => candidate.textContent?.includes("ORD-0057"));
    expect(row, "a table row for ORD-0057").toBeDefined();
    const links = within(row as HTMLElement).getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "/orders/ord-57")).toBe(true);
  });
});
