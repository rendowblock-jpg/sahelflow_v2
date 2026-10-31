/**
 * @vitest-environment happy-dom
 */
/**
 * The customers list on a phone, in its five states, with rows that look like a real shop's (Arabic names, +213 phones,
 * whole-dinar totals). The card must read: name, phone under it, wilaya + orders as the two fields, the money and the
 * join date as the footer, the context button as the row action.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomersDataTable } from "@/components/customers/customers-data-table";
import { render } from "@/test-utils/render";
import type { CustomersWorkbenchResponse } from "@/types/workbench";

vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customers",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

const row = (id: string, name: string | null, phone: string, spent: number | null, blacklisted = false) => ({
  id,
  name,
  phone,
  wilaya: "16",
  commune: null,
  orderCount: 7,
  totalSpent: spent,
  riskScore: null,
  isBlacklisted: blacklisted,
  createdAt: "2026-10-26T10:00:00.000Z",
});
const fieldAccess = { contact: true, financials: true, risk: false, manage: true, contactUpdate: true, import: false, export: false };
const response: CustomersWorkbenchResponse = {
  customers: [
    row("1", "محمد بن علي", "+213 555 12 34 56", 12500),
    row("2", "فاطمة الزهراء بوزيد", "+213 770 98 76 54", 0, true),
  ],
  fieldAccess,
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};
// A fallback for another page: the hook ignores it, so the list starts with no rows and must ask the server.
const noRowsYet: CustomersWorkbenchResponse = { ...response, customers: [], total: 0, page: 2 };
const emptyShop: CustomersWorkbenchResponse = { ...response, customers: [], total: 0 };

type Reply = { status: number; body: unknown } | "hang";
let reply: Reply = { status: 200, body: response };
const fetchMock = vi.fn(async () => {
  if (reply === "hang") return new Promise<Response>(() => undefined);
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

function mount(fallback: CustomersWorkbenchResponse, next: Reply) {
  reply = next;
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <CustomersDataTable fallback={fallback} locale="en" />
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}
const cards = () => screen.getAllByTestId("data-table-card");
const slotText = (card: HTMLElement, slot: string) => card.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "";

describe("customers list on a phone", () => {
  it("ready: name as title, phone as subtitle, wilaya and orders as fields, money and date as the footer, one row action", async () => {
    mount(response, { status: 200, body: response });
    expect(screen.queryByRole("table")).toBeNull();
    const first = cards()[0] as HTMLElement;
    expect(slotText(first, "title")).toContain("محمد بن علي");
    expect(slotText(first, "subtitle")).toContain("+213 555 12 34 56");
    expect([...first.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["customers.wilaya", "customers.orders"]);
    expect(slotText(first, "amount")).toMatch(/^\D*12[\s,.\u202f\u00a0]?500\D*$/);
    expect(slotText(first, "time")).not.toBe("");
    expect(first.querySelector('[data-slot="actions"]')).not.toBeNull();
    expect(slotText(cards()[1] as HTMLElement, "title")).toContain("customers.blacklisted");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("loading: no rows yet shows the table skeleton, busy, not a blank area", () => {
    mount(noRowsYet, "hang");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryAllByTestId("data-table-card")).toHaveLength(0);
  });

  it("empty: a shop with no customers says what this is and offers the next action", async () => {
    mount(emptyShop, { status: 200, body: emptyShop });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryAllByTestId("data-table-card")).toHaveLength(0);
    expect(document.body.textContent ?? "").toMatch(/customers\./);
  });

  it("error: nothing to show and the request failed -> what failed + Retry, and Retry asks again and shows the rows", async () => {
    mount(noRowsYet, { status: 500, body: { error: "boom" } });
    const retry = await screen.findByTestId("state-retry");
    // A raw server message ("boom", developer English) never reaches the seller: one calm sentence does
    // (translateServerError, wave 2 first-run). The mocked t() echoes the key.
    expect(screen.getByRole("alert").textContent).toContain("firstRun.error.unmapped");
    expect(screen.getByRole("alert").textContent).not.toContain("boom");
    reply = { status: 200, body: response };
    fireEvent.click(retry);
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.queryByTestId("state-retry")).toBeNull();
  });

  it("partial: a failed refresh keeps the rows and shows the saved-data banner with a Refresh that works", async () => {
    mount(response, { status: 500, body: { error: "boom" } });
    const refresh = await screen.findByTestId("state-refresh");
    expect(cards()).toHaveLength(2);
    reply = { status: 200, body: response };
    fireEvent.click(refresh);
    await waitFor(() => expect(screen.queryByTestId("state-refresh")).toBeNull());
    expect(cards()).toHaveLength(2);
  });
});
