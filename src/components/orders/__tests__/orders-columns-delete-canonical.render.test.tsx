/**
 * @vitest-environment happy-dom
 */
/**
 * The Delete action in the orders list row menu (S03a-08, Founder decision of 25 Oct, Q1).
 *
 * A cancelled order made the new way (mutationAuthority "canonical_v1") has no Delete in its
 * row menu: it stays in the list as history. An order made the old way keeps today's menu:
 * Delete for a draft or cancelled order, none for an active one.
 */
import { flexRender } from "@tanstack/react-table";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import type { OrderListItem } from "@/types/workbench";
import type { WorkbenchFieldAccess } from "@/types/workbench";

import { useOrdersColumns } from "../orders-columns";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

const ACCESS: WorkbenchFieldAccess = {
  contact: true,
  financials: true,
  risk: false,
  update: true,
  delete: true,
};

function order(
  status: string,
  mutationAuthority: OrderListItem["mutationAuthority"],
): OrderListItem {
  return {
    id: `order-${status}-${mutationAuthority}`,
    orderNumber: "ORD-1",
    status,
    totalPrice: 5000,
    wilaya: "Alger",
    phone: "0555000001",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    items: [{ id: "i1" }],
    customer: { name: "Amine", phone: "0555000001" },
    mutationAuthority,
  };
}

function ActionsCell({
  item,
  fieldAccess = ACCESS,
  onDelete = () => undefined,
}: {
  item: OrderListItem;
  fieldAccess?: WorkbenchFieldAccess;
  onDelete?: (id: string) => void;
}) {
  const columns = useOrdersColumns({ locale: "en", fieldAccess, onDelete });
  const actions = columns.find((column) => column.id === "actions");
  if (!actions?.cell) throw new Error("actions column missing");
  return <>{flexRender(actions.cell, { row: { original: item } } as never)}</>;
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: "orders.workspace.actionsFor" });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("orders list row menu: Delete (S03a-08 Q1)", () => {
  it("has no Delete for a cancelled order made the new way (and the menu still opens)", () => {
    render(<ActionsCell item={order("cancelled", "canonical_v1")} />);
    openMenu();
    expect(screen.getByText("orders.viewDetails")).toBeInTheDocument();
    expect(screen.queryByText("orders.delete")).not.toBeInTheDocument();
  });

  it("has no Delete for an active order made the new way", () => {
    render(<ActionsCell item={order("pending", "canonical_v1")} />);
    openMenu();
    expect(screen.queryByText("orders.delete")).not.toBeInTheDocument();
  });

  it("keeps Delete for a cancelled order made the old way", () => {
    const onDelete = vi.fn();
    render(
      <ActionsCell
        item={order("cancelled", "legacy_compatibility")}
        onDelete={onDelete}
      />,
    );
    openMenu();
    fireEvent.click(screen.getByText("orders.delete"));
    expect(onDelete).toHaveBeenCalledWith("order-cancelled-legacy_compatibility");
  });

  it("keeps Delete for a draft order made the old way and for a cancelled import-pending order", () => {
    const { unmount } = render(
      <ActionsCell item={order("draft", "legacy_compatibility")} />,
    );
    openMenu();
    expect(screen.getByText("orders.delete")).toBeInTheDocument();
    unmount();

    render(<ActionsCell item={order("cancelled", "confirmation_blocked")} />);
    openMenu();
    expect(screen.getByText("orders.delete")).toBeInTheDocument();
  });

  it("keeps no Delete for an active order made the old way", () => {
    render(<ActionsCell item={order("pending", "legacy_compatibility")} />);
    openMenu();
    expect(screen.queryByText("orders.delete")).not.toBeInTheDocument();
  });
});
