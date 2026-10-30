/**
 * @vitest-environment happy-dom
 */
/**
 * The order history on a customer's page. Below md it is a list of cards (no sideways scrolling table on a phone);
 * from md up it is the table. Both carry the same rows: order link, status, whole-dinar total, date.
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerOrderHistory } from "@/components/customers/customer-order-history";
import { render } from "@/test-utils/render";

const t = (key: string) => key;
const orders = [
  { id: "o-412", orderNumber: "ORD-0412", status: "pending", totalPrice: 12500, createdAt: new Date("2026-10-26T10:00:00.000Z") },
  { id: "o-398", orderNumber: "ORD-0398", status: "delivered", totalPrice: null, createdAt: new Date("2026-10-02T09:30:00.000Z") },
];

describe("customer order history", () => {
  it("phone: one card per order with a 44 px link to the order, status, total and date; the table is for md and up", () => {
    const { container } = render(<CustomerOrderHistory orders={orders} locale="en" t={t} />);
    const list = screen.getByRole("list", { name: "customers.orderHistory" });
    expect(list.className).toContain("md:hidden");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const link = within(items[0] as HTMLElement).getByRole("link", { name: "ORD-0412" });
    expect(link.getAttribute("href")).toBe("/orders/o-412");
    expect(link.className).toContain("min-h-11");
    expect(items[0]?.textContent).toMatch(/12[\s,.\u202f\u00a0]?500/);
    expect(items[0]?.textContent).toContain("orders.status.pending");
    expect(items[1]?.textContent).toContain("—");
    const tableWrap = container.querySelector("table")?.closest("div.hidden");
    expect(tableWrap?.className).toContain("md:block");
  });

  it("empty: says there are no orders yet instead of an empty table", () => {
    render(<CustomerOrderHistory orders={[]} locale="en" t={t} />);
    expect(screen.getByText("customers.noOrders")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
