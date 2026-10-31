/**
 * @vitest-environment happy-dom
 */
/** Customers list offline: the strip, rows still readable, the read-only context control still works. */
import { screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomersDataTable } from "@/components/customers/customers-data-table";
import { render } from "@/test-utils/render";
import type { CustomersWorkbenchResponse } from "@/types/workbench";

let online = true;
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
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

const row = (id: string, name: string, phone: string, spent: number) => ({
  id,
  name,
  phone,
  wilaya: "16",
  commune: null,
  orderCount: 7,
  totalSpent: spent,
  riskScore: null,
  isBlacklisted: false,
  createdAt: "2026-10-26T10:00:00.000Z",
});
const response: CustomersWorkbenchResponse = {
  customers: [row("1", "محمد بن علي", "+213 555 12 34 56", 12500), row("2", "فاطمة الزهراء بوزيد", "+213 770 98 76 54", 0)],
  fieldAccess: { contact: true, financials: true, risk: false, manage: true, contactUpdate: true, import: false, export: false },
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};

function mount() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } })),
  );
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <CustomersDataTable fallback={response} locale="en" />
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  online = true;
});

describe("customers list offline", () => {
  it("online: no strip", () => {
    mount();
    expect(screen.queryByTestId("list-offline-banner")).toBeNull();
  });

  it("offline: the strip is shown, both rows stay, the customer link and context button still work", async () => {
    online = false;
    const { container } = mount();
    expect(screen.getByTestId("list-offline-banner").textContent).toContain("cpDetail.offline.listBanner");
    await waitFor(() => expect(screen.getAllByTestId("data-table-card")).toHaveLength(2));
    expect(container.querySelectorAll("fieldset[disabled]")).toHaveLength(0);
    for (const button of Array.from(container.querySelectorAll('[data-slot="actions"] button'))) expect(button).toBeEnabled();
    expect(document.body.textContent).toContain("محمد بن علي");
  });
});
