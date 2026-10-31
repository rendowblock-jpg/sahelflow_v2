/**
 * @vitest-environment happy-dom
 */
/** Products list offline: rows stay readable, the row writes are off with the reason, the strip says so. */
import { screen, waitFor, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductsDataTable } from "@/components/products/products-data-table";
import { render } from "@/test-utils/render";
import type { ProductsResponse } from "@/hooks/swr/use-products";

let online = true;
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/products",
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

const product = (id: string, name: string, price: number, stock: number) => ({
  id,
  name,
  sku: `SKU-${id}`,
  price,
  cost: 1200,
  stock,
  lowStockThreshold: 3,
  categoryId: null,
  images: null,
  productVariants: [],
  isActive: true,
  createdAt: "2026-10-26T10:00:00.000Z",
});
const response: ProductsResponse = {
  products: [product("1", "قميص قطني رجالي", 2500, 8), product("2", "حذاء رياضي", 8900, 2)],
  fieldAccess: { cost: true, manage: true, costUpdate: true, import: false, export: false },
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};

function mount(fallback: ProductsResponse = response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(fallback), { status: 200, headers: { "content-type": "application/json" } })),
  );
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <ProductsDataTable fallback={fallback} categories={[]} />
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  online = true;
});

describe("products list offline", () => {
  it("online: no strip, no gate is closed", () => {
    const { container } = mount();
    expect(screen.queryByTestId("list-offline-banner")).toBeNull();
    expect(container.querySelectorAll("fieldset[disabled]")).toHaveLength(0);
  });

  it("offline: the strip says writes are paused, the rows stay, each row's edit/delete group is off with the reason", async () => {
    online = false;
    const { container } = mount();
    expect(screen.getByTestId("list-offline-banner").textContent).toContain("cpDetail.offline.listBanner");
    await waitFor(() => expect(screen.getAllByTestId("data-table-card")).toHaveLength(2));
    const gates = container.querySelectorAll("fieldset[disabled]");
    expect(gates).toHaveLength(2);
    for (const gate of Array.from(gates)) {
      expect(gate.getAttribute("title")).toBe("ordersDetail.offline.reason");
      for (const button of Array.from(within(gate as HTMLElement).queryAllByRole("button"))) expect(button).toBeDisabled();
    }
    // The read-only "view details" control is not behind the gate.
    const view = screen.getAllByRole("button", { name: /products\.viewDetails/ })[0] as HTMLElement;
    expect(view.closest("fieldset")).toBeNull();
    expect(view).toBeEnabled();
  });
});
