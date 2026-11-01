/**
 * @vitest-environment happy-dom
 */
/** Every row of the orders list has its own button names, so a screen reader (or a test) can tell the rows apart. */
import { flexRender } from "@tanstack/react-table";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import type { OrderListItem, WorkbenchFieldAccess } from "@/types/workbench";

import { useOrdersColumns } from "../orders-columns";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

afterEach(cleanup);

const ACCESS: WorkbenchFieldAccess = { contact: true, financials: true, risk: false, update: true, delete: true };

function order(orderNumber: string): OrderListItem {
  return {
    id: `id-${orderNumber}`,
    orderNumber,
    status: "pending",
    totalPrice: 5000,
    wilaya: "Alger",
    phone: "0555000001",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    items: [{ id: "i1" }],
    customer: { name: "Amine", phone: "0555000001" },
    mutationAuthority: "legacy_compatibility",
  };
}

function ActionsCell({ item }: { item: OrderListItem }) {
  const columns = useOrdersColumns({ locale: "en", fieldAccess: ACCESS, onDelete: () => undefined });
  const actions = columns.find((column) => column.id === "actions");
  if (!actions?.cell) throw new Error("actions column missing");
  return <>{flexRender(actions.cell, { row: { original: item } } as never)}</>;
}

describe("orders list row buttons are named per order", () => {
  it("names the actions menu and the WhatsApp link with the order number", () => {
    render(
      <>
        <ActionsCell item={order("ORD-0001")} />
        <ActionsCell item={order("ORD-0002")} />
      </>,
    );
    const menus = screen.getAllByRole("button").map((button) => button.textContent);
    expect(menus).toEqual([
      'orders.workspace.actionsFor|{"number":"ORD-0001"}',
      'orders.workspace.actionsFor|{"number":"ORD-0002"}',
    ]);
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("aria-label"));
    expect(links).toEqual([
      'orders.workspace.whatsappFor|{"number":"ORD-0001"}',
      'orders.workspace.whatsappFor|{"number":"ORD-0002"}',
    ]);
  });
});

describe("the two new row texts", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    it(`exist in ${locale}, carry the order number, and the WhatsApp one still contains the visible label`, () => {
      const actions = getRuntimeTranslation(locale, "orders.workspace.actionsFor") ?? "";
      const whatsapp = getRuntimeTranslation(locale, "orders.workspace.whatsappFor") ?? "";
      const visible = getRuntimeTranslation(locale, "orders.whatsapp.confirm") ?? "";
      expect(actions).toContain("{{number}}");
      expect(whatsapp).toContain("{{number}}");
      expect(visible).not.toBe("");
      expect(whatsapp.startsWith(visible)).toBe(true);
      if (locale === "ar") {
        expect(actions).toMatch(/[\u0600-\u06FF]/);
        expect(whatsapp).toMatch(/[\u0600-\u06FF]/);
      }
    });
  }
});
