/**
 * @vitest-environment happy-dom
 */
/**
 * The order edit panel when the LINES of a pending order the seller typed in can be changed
 * (S03a-03B) - behaviour, not spelling.
 *
 * What the seller must be able to rely on: the quantity and the price of each line are boxes,
 * a line can be removed but never the last one, a product can be added, a save sends the new
 * list to the governed lines command at the version the screen was opened on, the other fields
 * (if changed) follow at the version the first save answered, and nothing is sent when nothing
 * changed. A hosted-storefront order does not get these boxes.
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OrderEditPanel } from "../order-edit-panel";

const harness = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: harness.refresh, back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: harness.toastError, success: harness.toastSuccess },
}));

vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn(async () => undefined) }));

const BELT = { id: "p3", name: "Belt", price: 900, stock: 5, isActive: true, productVariants: [] };

vi.mock("@/components/orders/order-product-combobox", () => ({
  fetchProductOptions: vi.fn(async () => []),
  OrderProductCombobox: ({ onSelect }: { onSelect: (product: unknown) => void }) => (
    <button type="button" onClick={() => onSelect(BELT)}>
      add-belt
    </button>
  ),
}));

const ITEMS = [
  { id: "line-1", productId: "p1", productVariantId: null, productName: "Linen shirt", productVariantName: null, quantity: 2, unitPrice: 2500, total: 5000 },
  { id: "line-2", productId: "p2", productVariantId: null, productName: "Scarf", productVariantName: null, quantity: 1, unitPrice: 1800, total: 1800 },
];

function panel(overrides: Partial<Parameters<typeof OrderEditPanel>[0]> = {}) {
  return (
    <OrderEditPanel
      orderId="order-a"
      canonicalVersion={3}
      linesEditable
      initialItems={ITEMS}
      initialDeliveryCost={600}
      initialWilaya="Alger"
      initialCommune="Alger Centre"
      initialAddress="12 rue Didouche Mourad"
      initialPhone="0550123456"
      initialNotes={null}
      {...overrides}
    >
      <div>read-only view</div>
    </OrderEditPanel>
  );
}

const fetchMock = vi.fn();

function answer(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function sent(call: number): { url: string; body: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

async function openEditor() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /orders\.detail\.edit/ }));
  });
}

async function change(box: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(box, { target: { value } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
  });
}

function row(id: string): HTMLElement {
  const found = document.querySelector(`[data-line-id="${id}"]`);
  if (!found) throw new Error(`no row ${id}`);
  return found as HTMLElement;
}

beforeEach(() => {
  fetchMock.mockReset();
  harness.refresh.mockReset();
  harness.toastError.mockReset();
  harness.toastSuccess.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrderEditPanel with editable lines", () => {
  it("shows a quantity box, a price box and a remove button on every line", async () => {
    render(panel());
    await openEditor();

    expect(within(row("line-1")).getByDisplayValue("2")).toBeTruthy();
    expect(within(row("line-1")).getByDisplayValue("2500")).toBeTruthy();
    expect(within(row("line-2")).getByDisplayValue("1800")).toBeTruthy();
    expect(within(row("line-1")).getByRole("button", { name: "orders.detail.removeLine" })).toBeTruthy();
  });

  it("does not show those boxes for an order whose lines are not editable (a storefront order)", async () => {
    render(panel({ linesEditable: false }));
    await openEditor();

    expect(screen.queryByDisplayValue("2500")).toBeNull();
    expect(screen.queryByRole("button", { name: "orders.detail.removeLine" })).toBeNull();
    expect(screen.queryByText("add-belt")).toBeNull();
  });

  it("sends nothing when nothing changed", async () => {
    render(panel());
    await openEditor();
    await save();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a changed quantity to the lines command at the opened version, and only that", async () => {
    answer(200, { order: { version: 4 }, lines: { changed: 1 }, command: { replayed: false } });
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "5");
    await save();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, body } = sent(0);
    expect(url).toBe("/api/orders/order-a/lines");
    expect(body).toMatchObject({ expectedVersion: 3, lines: [{ id: "line-1", quantity: 5 }, { id: "line-2", quantity: 1 }] });
    expect(String(body.idempotencyKey)).toMatch(/^order-lines-order-a-v3-/);
    expect(harness.toastSuccess).toHaveBeenCalledWith("orders.detail.editSaved");
    expect(harness.refresh).toHaveBeenCalled();
  });

  it("sends a price only for the line whose price the seller changed", async () => {
    answer(200, { order: { version: 4 }, command: { replayed: false } });
    render(panel());
    await openEditor();
    await change(within(row("line-2")).getByDisplayValue("1800"), "1500");
    await save();

    expect(sent(0).body.lines).toEqual([
      { id: "line-1", quantity: 2 },
      { id: "line-2", quantity: 1, unitPrice: 1500 },
    ]);
  });

  it("a retry of the same save carries the same key and a different save does not", async () => {
    answer(500, { error: "boom" });
    answer(500, { error: "boom" });
    answer(500, { error: "boom" });
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "3");
    await save();
    await save();
    await change(within(row("line-1")).getByDisplayValue("3"), "4");
    await save();

    const keys = [0, 1, 2].map((call) => sent(call).body.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("removes a line by leaving it out of the list, and never lets the last line go", async () => {
    answer(200, { order: { version: 4 }, command: { replayed: false } });
    render(panel());
    await openEditor();
    await act(async () => {
      fireEvent.click(within(row("line-2")).getByRole("button", { name: "orders.detail.removeLine" }));
    });
    // One line left in the editor: its remove button is disabled and says why.
    const last = within(row("line-1")).getByRole("button", { name: "orders.detail.removeLine" }) as HTMLButtonElement;
    expect(last.disabled).toBe(true);
    expect(last.title).toBe("orders.detail.lastLine");
    await save();

    expect(sent(0).body.lines).toEqual([{ id: "line-1", quantity: 2 }]);
  });

  it("adds a product and sends it by product id", async () => {
    answer(200, { order: { version: 4 }, command: { replayed: false } });
    render(panel());
    await openEditor();
    await act(async () => {
      fireEvent.click(screen.getByText("add-belt"));
    });
    expect(screen.getByText("Belt")).toBeTruthy();
    await save();

    expect(sent(0).body.lines).toEqual([
      { id: "line-1", quantity: 2 },
      { id: "line-2", quantity: 1 },
      { productId: "p3", quantity: 1 },
    ]);
  });

  it("shows the total from the lines and the delivery fee", async () => {
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "3");

    // 3 x 2500 + 1 x 1800 + 600 delivery
    expect(screen.getAllByText(/9,?900|9\s?900/).length).toBeGreaterThan(0);
  });

  it("posts the other fields afterwards at the version the lines save answered", async () => {
    answer(200, { order: { version: 4 }, command: { replayed: false } });
    answer(200, { order: { version: 5 }, changed: ["address"], command: { replayed: false } });
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "3");
    await change(screen.getByDisplayValue("12 rue Didouche Mourad"), "7 boulevard Zighoud Youcef");
    await save();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sent(0).url).toBe("/api/orders/order-a/lines");
    expect(sent(0).body.expectedVersion).toBe(3);
    expect(sent(1).url).toBe("/api/orders/order-a/edit");
    expect(sent(1).body).toMatchObject({ expectedVersion: 4, address: "7 boulevard Zighoud Youcef" });
    expect(harness.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("says so when the items were saved and the other changes were not", async () => {
    answer(200, { order: { version: 4 }, command: { replayed: false } });
    answer(500, { error: "boom" });
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "3");
    await change(screen.getByDisplayValue("12 rue Didouche Mourad"), "Elsewhere 1");
    await save();

    expect(harness.toastError).toHaveBeenCalledWith("orders.detail.editPartial");
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    // The page is refreshed so the seller sees what really is saved.
    expect(harness.refresh).toHaveBeenCalled();
  });

  it("does not post the other fields when the lines save failed", async () => {
    answer(409, { error: "x", code: "CONFLICT" });
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "3");
    await change(screen.getByDisplayValue("12 rue Didouche Mourad"), "Elsewhere 1");
    await save();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(harness.toastError).toHaveBeenCalledWith("orders.detail.editConflict");
  });

  it("cancel puts the lines back as they were stored", async () => {
    render(panel());
    await openEditor();
    await change(within(row("line-1")).getByDisplayValue("2"), "9");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /common\.cancel/ }));
    });
    await openEditor();

    expect(within(row("line-1")).getByDisplayValue("2")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
