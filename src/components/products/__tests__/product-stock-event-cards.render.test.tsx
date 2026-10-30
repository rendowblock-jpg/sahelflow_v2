/**
 * @vitest-environment happy-dom
 */
/**
 * The stock audit trail on a product page. A phone gets one card per movement (date, signed change, source and new
 * stock, reason, who); the six-column table stays for md and up. The sign is isolated left-to-right so "-3" does not
 * flip in Arabic.
 */
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductStockEventCards, formatStockDelta } from "@/components/products/product-stock-event-cards";
import { render } from "@/test-utils/render";

const labels = { list: "productStock.historyTitle", newStock: "productStock.newStock", by: "productStock.by" };
const rows = [
  { id: "e1", date: "26/10/2026", delta: 12, toStock: 20, sourceLabel: "Réception", reason: "وصلت شحنة جديدة من المورد", actorLabel: "Amine" },
  { id: "e2", date: "24/10/2026", delta: -3, toStock: 8, sourceLabel: "Commande", reason: null, actorLabel: "System" },
  { id: "e3", date: "20/10/2026", delta: null, toStock: null, sourceLabel: "Import", reason: null, actorLabel: "System" },
];

describe("formatStockDelta", () => {
  it.each([
    [12, "+12"],
    [1, "+1"],
    [0, "0"],
    [-3, "-3"],
    [-1200, "-1200"],
    [null, "—"],
  ])("%s -> %s", (delta, expected) => {
    expect(formatStockDelta(delta)).toBe(expected);
  });
});

describe("product stock event cards", () => {
  it("phone: one card per movement with the signed change, new stock, reason and who; hidden from md up", () => {
    render(<ProductStockEventCards rows={rows} labels={labels} />);
    const list = screen.getByRole("list", { name: "productStock.historyTitle" });
    expect(list.className).toContain("md:hidden");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const first = items[0] as HTMLElement;
    const delta = within(first).getByText("+12");
    expect(delta.getAttribute("dir")).toBe("ltr");
    expect(delta.className).toContain("text-success");
    expect(first.textContent).toContain("Réception");
    expect(first.textContent).toContain("productStock.newStock");
    expect(first.textContent).toContain("وصلت شحنة جديدة من المورد");
    expect(first.textContent).toContain("Amine");
    expect(within(items[1] as HTMLElement).getByText("-3").className).toContain("text-destructive");
    expect(items[1]?.textContent).not.toContain("undefined");
    expect(within(items[2] as HTMLElement).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
