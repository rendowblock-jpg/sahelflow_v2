/**
 * @vitest-environment happy-dom
 */
/**
 * The products list on a phone, in its five states, with a real-looking catalogue (Arabic names, whole-dinar prices).
 * The card must read: picture + name (+ SKU) as the title, the category under it, price as the money line, stock as the
 * one field, active/inactive as the status chip, the row menu as the action.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductsDataTable } from "@/components/products/products-data-table";
import { render } from "@/test-utils/render";
import type { ProductsResponse } from "@/hooks/swr/use-products";
import type { Category } from "@/types/domain";

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

const stamp = new Date("2026-10-01T00:00:00.000Z");
const categories: Category[] = [
  { id: "c1", name: "ملابس رجالية", createdAt: stamp, updatedAt: stamp },
  { id: "c2", name: "أحذية", createdAt: stamp, updatedAt: stamp },
];
const product = (id: string, name: string, price: number, stock: number, categoryId: string | null, isActive: boolean) => ({
  id,
  name,
  sku: `SKU-${id}`,
  price,
  cost: 1200,
  stock,
  lowStockThreshold: 3,
  categoryId,
  images: null,
  productVariants: [],
  isActive,
  createdAt: "2026-10-26T10:00:00.000Z",
});
const response: ProductsResponse = {
  products: [product("1", "قميص قطني رجالي", 2500, 8, "c1", true), product("2", "حذاء رياضي", 8900, 2, null, false)],
  fieldAccess: { cost: true, manage: true, costUpdate: true, import: false, export: false },
  total: 2,
  hasNextPage: false,
  page: 1,
  pageSize: 25,
};
const noRowsYet: ProductsResponse = { ...response, products: [], total: 0, page: 2 };
const emptyShop: ProductsResponse = { ...response, products: [], total: 0 };

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

function mount(fallback: ProductsResponse, next: Reply) {
  reply = next;
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <NuqsTestingAdapter>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
        <ProductsDataTable fallback={fallback} categories={categories} />
      </SWRConfig>
    </NuqsTestingAdapter>,
  );
}
const cards = () => screen.getAllByTestId("data-table-card");
const slotText = (card: HTMLElement, slot: string) => card.querySelector(`[data-slot="${slot}"]`)?.textContent ?? "";

describe("products list on a phone", () => {
  it("ready: name+SKU title, category subtitle, price as money, stock as the one field, active status, row menu", async () => {
    mount(response, { status: 200, body: response });
    expect(screen.queryByRole("table")).toBeNull();
    const first = cards()[0] as HTMLElement;
    expect(slotText(first, "title")).toContain("قميص قطني رجالي");
    expect(slotText(first, "title")).toContain("SKU-1");
    expect(slotText(first, "title")).not.toContain("ملابس رجالية");
    expect(slotText(first, "subtitle")).toBe("ملابس رجالية");
    expect(slotText(first, "amount")).toMatch(/^\D*2[\s,.\u202f\u00a0]?500\D*$/);
    expect([...first.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["products.stock"]);
    expect(slotText(first, "status")).toBe("common.active");
    expect(first.querySelector('[data-slot="actions"]')).not.toBeNull();
    const second = cards()[1] as HTMLElement;
    expect(slotText(second, "status")).toBe("common.inactive");
    expect(slotText(second, "amount")).toMatch(/^\D*8[\s,.\u202f\u00a0]?900\D*$/);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("loading: no rows yet shows the skeleton, busy, not a blank area", () => {
    mount(noRowsYet, "hang");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryAllByTestId("data-table-card")).toHaveLength(0);
  });

  it("empty: an empty catalogue says what this is", async () => {
    mount(emptyShop, { status: 200, body: emptyShop });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryAllByTestId("data-table-card")).toHaveLength(0);
    expect(document.body.textContent ?? "").toMatch(/products\./);
  });

  it("error: nothing to show and the request failed -> what failed + Retry that asks again, search box kept", async () => {
    mount(noRowsYet, { status: 500, body: { error: "boom" } });
    const retry = await screen.findByTestId("state-retry");
    // A raw server message ("boom", developer English) never reaches the seller: one calm sentence does
    // (translateServerError, wave 2 first-run). The mocked t() echoes the key.
    expect(screen.getByRole("alert").textContent).toContain("firstRun.error.unmapped");
    expect(screen.getByRole("alert").textContent).not.toContain("boom");
    expect(screen.getByPlaceholderText("products.searchPlaceholder")).toBeTruthy();
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
