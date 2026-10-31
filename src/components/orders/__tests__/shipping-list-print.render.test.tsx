/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ShippingListPrintButton,
  ShippingListPrintRoot,
  useOrdersShippingList,
} from "@/components/orders/shipping-list-print";
import { buildShippingList, type ShippingListOrderInput } from "@/lib/orders/shipping-list";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const loadSlips = vi.hoisted(() => vi.fn());
vi.mock("@/components/orders/delivery-slip", () => ({ loadDeliverySlipsForOrders: loadSlips }));
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

const input = (o: Partial<ShippingListOrderInput> = {}): ShippingListOrderInput => ({
  orderNumber: "ORD-1", status: "confirmed", customerName: "Sara", phone: "0555123456", wilaya: "16",
  commune: "Hydra", address: "12 rue A", items: [{ name: "Robe", quantity: 2 }], total: 4500,
  provider: "Yalidine", trackingNumber: "T1", ...o,
});
const NOW = new Date("2026-10-31T09:50:00Z");
const root = () => document.body.querySelector(".sf-shipping-list-root") as HTMLElement;

afterEach(() => cleanup());

describe("ShippingListPrintRoot", () => {
  it("is a print-only portal on <body>, with a repeating header row and a totals row last", () => {
    const list = buildShippingList([input(), input({ orderNumber: "B", customerName: "Omar", total: 1000 })], { locale: "en", now: NOW });
    render(<ShippingListPrintRoot list={list} />);
    expect(root().parentElement).toBe(document.body);
    expect(root().classList.contains("hidden")).toBe(true);
    expect(root().classList.contains("print:block")).toBe(true);
    expect(root().querySelectorAll("table > thead > tr > th")).toHaveLength(10);
    const rows = Array.from(root().querySelectorAll("tbody.sf-sl-rows > tr"));
    expect(rows).toHaveLength(2);
    const last = Array.from(root().querySelectorAll("table tr")).pop() as HTMLElement;
    expect(last.classList.contains("sf-sl-total")).toBe(true);
    expect(last.textContent).toContain(list.rows[0]?.cod ? String(list.totals.parcels) : "");
    expect(root().textContent).toContain("SahelFlow");
  });

  it("prints exactly the builder rows, in order", () => {
    const list = buildShippingList([input({ orderNumber: "Z", wilaya: "31" }), input()], { locale: "en", now: NOW });
    render(<ShippingListPrintRoot list={list} />);
    const cells = Array.from(root().querySelectorAll("tbody.sf-sl-rows > tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.textContent),
    );
    expect(cells.map((c) => c[0])).toEqual(list.rows.map((r) => r.number));
    expect(cells[0]).toEqual(expect.arrayContaining([list.rows[0]?.customer, list.rows[0]?.cod, list.rows[0]?.items, "T1"]));
  });

  it("escapes customer text and says 'address missing' instead of a blank cell", () => {
    const list = buildShippingList([input({ customerName: "<script>alert(1)</script>", address: null })], { locale: "en", now: NOW });
    render(<ShippingListPrintRoot list={list} />);
    expect(root().querySelector("script")).toBeNull();
    expect(root().innerHTML).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(root().textContent).toContain("orders.shippingList.addressMissing");
  });
});

describe("ShippingListPrintButton", () => {
  it("is disabled with a reason that aria-describedby points to when nothing can be printed", () => {
    const onPrint = vi.fn();
    const { getByRole } = render(<ShippingListPrintButton count={0} onPrint={onPrint} />);
    const button = getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "none");
    expect(reason?.textContent).toBe("orders.shippingList.emptyReason");
    fireEvent.click(button);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("prints when there is something to print", () => {
    const onPrint = vi.fn();
    const { getByRole } = render(<ShippingListPrintButton count={3} onPrint={onPrint} />);
    const button = getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-describedby")).toBeNull();
    fireEvent.click(button);
    expect(onPrint).toHaveBeenCalledTimes(1);
  });
});

describe("useOrdersShippingList", () => {
  const rows = [
    { id: "a", orderNumber: "A", status: "confirmed", customer: { name: "Sara" } },
    { id: "b", orderNumber: "B", status: "pending", customer: { name: "Omar" } },
    { id: "c", orderNumber: "C", status: "confirmed", customer: null },
  ];
  const slip = (n: string) => ({ ...input({ orderNumber: n }), createdAt: "2026-10-30", total: 100, provider: "Yalidine" });
  let bulk: ((ids: string[]) => void) | undefined;
  function Harness() {
    const sl = useOrdersShippingList(rows, true);
    bulk = (ids) => sl.bulkAction.onClick(ids, {} as Parameters<typeof sl.bulkAction.onClick>[1]);
    return <>{sl.button}{sl.printRoot}</>;
  }
  beforeEach(() => {
    loadSlips.mockReset();
    loadSlips.mockImplementation(async (list: Array<{ id: string }>) => ({ slips: list.map((r) => slip(r.id.toUpperCase())), failed: [] }));
    window.print = vi.fn();
  });

  it("with nothing selected prints the confirmed rows, then cleans up after the print dialog", async () => {
    const { getByRole } = render(<Harness />);
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(loadSlips.mock.calls[0]?.[0].map((r: { id: string }) => r.id)).toEqual(["a", "c"]);
    expect(document.body.classList.contains("sf-shipping-list-printing")).toBe(true);
    expect(root()).not.toBeNull();
    act(() => { window.dispatchEvent(new Event("afterprint")); });
    expect(document.body.classList.contains("sf-shipping-list-printing")).toBe(false);
    expect(root()).toBeNull();
  });

  it("with a selection prints the selected rows, whatever their status", async () => {
    render(<Harness />);
    act(() => bulk?.(["b"]));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(loadSlips.mock.calls[0]?.[0].map((r: { id: string }) => r.id)).toEqual(["b"]);
  });
});

describe("runtime strings", () => {
  it.each(["ar", "fr", "en"] as const)("%s has copy for the button and the empty reason", (locale) => {
    expect(getRuntimeTranslation(locale, "orders.shippingList.print")).toBeTruthy();
    expect(getRuntimeTranslation(locale, "orders.shippingList.emptyReason")).toBeTruthy();
    expect(getRuntimeTranslation(locale, "orders.shippingList.addressMissing")).toBeTruthy();
  });
});
