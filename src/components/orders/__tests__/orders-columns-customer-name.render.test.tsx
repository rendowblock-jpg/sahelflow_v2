/**
 * @vitest-environment happy-dom
 */
/**
 * P5 slice 1: a customer name is free text, often Arabic with a Latin word or a bracket in it. Inside an Arabic row it
 * must keep its own direction (so its punctuation does not jump to the wrong end), and a name cut short by the column
 * must still be readable in full.
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

const ACCESS: WorkbenchFieldAccess = { contact: true, financials: true, risk: false, update: true, delete: false };

function item(name: string | null): OrderListItem {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    status: "pending",
    totalPrice: 5000,
    wilaya: "16",
    phone: "0555000001",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    items: [{ id: "i1" }],
    customer: name === null ? null : { name, phone: "0555000001" },
    mutationAuthority: "legacy_compatibility",
  };
}

function CustomerCell({ order }: { order: OrderListItem }) {
  const columns = useOrdersColumns({ locale: "ar", fieldAccess: ACCESS, onDelete: () => undefined });
  const column = columns.find((candidate) => candidate.id === "customer");
  if (!column?.cell) throw new Error("customer column missing");
  return <>{flexRender(column.cell, { row: { original: order } } as never)}</>;
}

describe("customer name cell", () => {
  it("isolates the name with automatic direction and keeps the full name as a title", () => {
    render(<CustomerCell order={item("أمين (Amine) بن علي")} />);
    const name = screen.getByText("أمين (Amine) بن علي");
    expect(name.tagName).toBe("BDI");
    expect(name).toHaveAttribute("dir", "auto");
    expect(name).toHaveAttribute("title", "أمين (Amine) بن علي");
  });

  it("shows a dash, not an empty isolate, when there is no name", () => {
    const { container } = render(<CustomerCell order={item(null)} />);
    expect(container.querySelector("bdi[dir='auto']")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
