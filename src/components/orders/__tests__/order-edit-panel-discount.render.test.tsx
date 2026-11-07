/**
 * @vitest-environment happy-dom
 */
/**
 * Item 2 money (M2a, task 6): the edit panel of an order that carries a discount. In edit mode the panel shows subtotal, shipping and
 * a live total. For a hosted bundle order the stored total is items - discount + delivery, so the panel must show that, not the plain
 * items + delivery: the seller must never see a total that differs from the one on the order page.
 */
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { formatDZD } from "@/lib/utils";

import { OrderEditPanel } from "../order-edit-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn(async () => undefined) }));

const ITEMS = [
  { id: "line-1", productId: "p1", productVariantId: null, productName: "Linen shirt", productVariantName: null, quantity: 3, unitPrice: 3000, total: 9000 },
];

function panel(discount?: number) {
  return (
    <OrderEditPanel
      orderId="order-a"
      initialItems={ITEMS}
      initialDeliveryCost={500}
      {...(discount === undefined ? {} : { initialDiscount: discount })}
      initialWilaya="Alger"
      initialCommune="Alger Centre"
      initialAddress="12 rue Didouche Mourad"
      initialPhone="0550123456"
      initialNotes={null}
    >
      <div>read-only view</div>
    </OrderEditPanel>
  );
}

async function openEditor() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /orders\.detail\.edit/ }));
  });
}
const totalShown = () => screen.getByText("orders.total").nextElementSibling?.textContent;

afterEach(() => vi.unstubAllGlobals());

describe("OrderEditPanel of an order with a discount", () => {
  it("shows the stored discount as a minus row and a total that takes it off: 9000 - 1500 + 500", async () => {
    render(panel(1500));
    await openEditor();

    expect(screen.getByText("orders.detail.discount").nextElementSibling?.textContent).toBe(`−${formatDZD(1500, "en")}`);
    expect(totalShown()).toBe(formatDZD(8000, "en"));
  });

  it("keeps the discount when the delivery cost is typed over", async () => {
    render(panel(1500));
    await openEditor();

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "800" } });
    });

    expect(totalShown()).toBe(formatDZD(8300, "en"));
  });

  it.each([[undefined], [0]])("shows no discount row and the plain total for a discount of %s", async (discount) => {
    render(panel(discount));
    await openEditor();

    expect(screen.queryByText("orders.detail.discount")).toBeNull();
    expect(totalShown()).toBe(formatDZD(9500, "en"));
  });
});
