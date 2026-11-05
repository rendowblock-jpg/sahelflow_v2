/**
 * @vitest-environment happy-dom
 */
/**
 * Orders list, item 1 (5 Nov 2026): green did four jobs on the orders page (main button, active navigation, the
 * order-number links in every row, and the tinted selected card). The order numbers repeated the accent 25 times per
 * page, so the one green button no longer stood out, and a number in the accent colour reads as a status, not as an id.
 *
 * Rule pinned here: the order number is plain text colour, semibold, and stays a real link (hover underline, visible
 * focus ring, the number stays isolated as LTR so it does not leak into Arabic text). Only the accent colour is gone.
 */
import { flexRender } from "@tanstack/react-table";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { OrderListItem, WorkbenchFieldAccess } from "@/types/workbench";

import { useOrdersColumns } from "../orders-columns";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "ar", dir: "rtl" }),
}));

const FULL: WorkbenchFieldAccess = { contact: true, financials: true, risk: false, update: true, delete: false };
const NO_DETAIL: WorkbenchFieldAccess = { contact: false, financials: false, risk: false, update: false, delete: false };

const order: OrderListItem = {
  id: "o1",
  orderNumber: "ORD-6055",
  status: "pending",
  totalPrice: 5000,
  wilaya: "16",
  phone: "0555000001",
  createdAt: new Date("2026-10-20T10:00:00Z"),
  items: [{ id: "i1" }],
  customer: { name: "Amine", phone: "0555000001" },
  mutationAuthority: "legacy_compatibility",
};

function NumberCell({ access }: { access: WorkbenchFieldAccess }) {
  const columns = useOrdersColumns({ locale: "ar", fieldAccess: access, onDelete: () => undefined });
  const column = columns.find((candidate) => "accessorKey" in candidate && candidate.accessorKey === "orderNumber");
  if (!column?.cell) throw new Error("order number column missing");
  return <>{flexRender(column.cell, { row: { original: order } } as never)}</>;
}

describe("order number cell", () => {
  it("is a link to the order, in the text colour, not in the accent colour", () => {
    const { container } = render(<NumberCell access={FULL} />);
    const link = container.querySelector("a[href='/orders/o1']");
    expect(link, "a link to the order").toBeTruthy();
    const classes = link?.className ?? "";
    expect(classes).not.toMatch(/\btext-primary\b/);
    expect(classes).toMatch(/\btext-foreground\b/);
    expect(classes).toMatch(/\bfont-semibold\b/);
  });

  it("stays recognisable as a link: underline on hover and a visible focus ring", () => {
    const { container } = render(<NumberCell access={FULL} />);
    const classes = container.querySelector("a[href='/orders/o1']")?.className ?? "";
    expect(classes).toMatch(/\bhover:underline\b/);
    expect(classes).toMatch(/\bfocus-visible:ring-2\b/);
  });

  it("keeps the number isolated as left-to-right data inside an Arabic row", () => {
    render(<NumberCell access={FULL} />);
    const number = screen.getByText("ORD-6055");
    expect(number.tagName).toBe("BDI");
    expect(number).toHaveAttribute("dir", "ltr");
    expect(number).toHaveAttribute("data-order-number");
  });

  it("without the right to open an order: plain text, same weight, no link", () => {
    const { container } = render(<NumberCell access={NO_DETAIL} />);
    expect(container.querySelector("a")).toBeNull();
    const number = screen.getByText("ORD-6055");
    expect(number.className).toMatch(/\bfont-semibold\b/);
    expect(number.className).not.toMatch(/\btext-primary\b/);
  });
});
