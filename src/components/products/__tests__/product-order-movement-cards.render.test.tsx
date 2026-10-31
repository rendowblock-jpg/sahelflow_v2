/**
 * @vitest-environment happy-dom
 */
/** The order-movements list on a phone: cards, integer quantities, 44 px order links, a dash when no order. */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { render } from "@/test-utils/render";
import { ProductOrderMovementCards, type OrderMovementCardRow } from "@/components/products/product-order-movement-cards";

const labels = { list: "حركات الطلبات", quantity: "الكمية", order: "الطلب" };
const rows: OrderMovementCardRow[] = [
  { id: "m1", date: "12 يناير 2026", kindLabel: "حجز لطلب", quantity: 3, orderId: "ord_77", orderNumber: "ORD-2026-0077" },
  { id: "m2", date: "11 يناير 2026", kindLabel: "إرجاع", quantity: 1, orderId: null, orderNumber: null },
];

describe("ProductOrderMovementCards", () => {
  it("one card per movement, only below md, with the list named", () => {
    render(<ProductOrderMovementCards rows={rows} labels={labels} />);
    const list = screen.getByRole("list", { name: "حركات الطلبات" });
    expect(list.className).toContain("md:hidden");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("حجز لطلب")).toBeTruthy();
  });

  it("the order number links to the order and is a 44 px target", () => {
    render(<ProductOrderMovementCards rows={rows} labels={labels} />);
    const link = screen.getByRole("link", { name: "ORD-2026-0077" });
    expect(link.getAttribute("href")).toBe("/orders/ord_77");
    expect(link.className).toContain("min-h-11");
  });

  it("a movement without an order shows a dash and no link", () => {
    render(<ProductOrderMovementCards rows={[rows[1] as OrderMovementCardRow]} labels={labels} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("no movements: an empty list, no cards", () => {
    render(<ProductOrderMovementCards rows={[]} labels={labels} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
