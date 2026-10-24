/**
 * @vitest-environment happy-dom
 */
/**
 * S06b-02: the delivery cost of an order created from a WhatsApp message is a
 * field the seller can change in the review step, and the value sent to the
 * create call is the value shown.
 */
import { describe, expect, it, vi } from "vitest";

import { ExtractionReview, type ReviewedOrder } from "@/components/inbox/extraction/extraction-review";
import type { ExtractedOrder } from "@/lib/ai/extraction";
import { getOrderExtractionCopy } from "@/lib/i18n/order-extraction";
import { fireEvent, render, screen } from "@/test-utils/render";

const copy = (key: Parameters<typeof getOrderExtractionCopy>[1], params?: Record<string, string | number>) =>
  getOrderExtractionCopy("en", key, params);

const order: ExtractedOrder = {
  customerName: "Amina",
  phone: "0555123456",
  wilaya: "Alger",
  items: [{ productName: "Robe", quantity: 2, catalogMatch: "exact" }],
};

function mount(variant: "inline" | "workspace" = "workspace") {
  const onCreate = vi.fn<(reviewed: ReviewedOrder) => void>();
  render(
    <ExtractionReview
      variant={variant}
      order={order}
      catalog={[{ name: "Robe", price: 2500 }]}
      locale="en"
      copy={copy}
      fieldId="t"
      creating={false}
      onCreate={onCreate}
    />,
  );
  return onCreate;
}

const field = () => screen.getByLabelText("Delivery cost (DA)") as HTMLInputElement;
const create = () => screen.getByRole("button", { name: /^Create/ }) as HTMLButtonElement;

describe("extraction review: delivery cost", () => {
  it.each(["inline", "workspace"] as const)("shows an editable field prefilled with 600 (%s)", (variant) => {
    mount(variant);
    expect(field().value).toBe("600");
    expect(field().disabled).toBe(false);
  });

  it("sends the edited value to the create call", () => {
    const onCreate = mount();
    fireEvent.change(field(), { target: { value: "900" } });
    fireEvent.click(create());
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0].deliveryCost).toBe(900);
  });

  it("sends the prefilled value when the seller does not touch it", () => {
    const onCreate = mount();
    fireEvent.click(create());
    expect(onCreate.mock.calls[0][0].deliveryCost).toBe(600);
  });

  it("accepts a free delivery (0)", () => {
    const onCreate = mount();
    fireEvent.change(field(), { target: { value: "0" } });
    fireEvent.click(create());
    expect(onCreate.mock.calls[0][0].deliveryCost).toBe(0);
  });

  it("shows the edited cost and the total built from it", () => {
    mount();
    fireEvent.change(field(), { target: { value: "900" } });
    const summary = document.querySelector("[data-extraction-summary]") as HTMLElement;
    expect(summary.textContent).toMatch(/900/);
    // 2 x 2500 + 900
    expect(summary.textContent).toMatch(/5[\s\u00a0\u202f,.]?900/);
  });

  it.each(["-5", "12.5", "", "abc", "9007199254740993"])("blocks the submit for %j and says why", (value) => {
    const onCreate = mount();
    fireEvent.change(field(), { target: { value } });
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(copy("deliveryCostInvalid"))).toBeTruthy();
    expect(create().disabled).toBe(true);
    fireEvent.submit(field().closest("form") as HTMLFormElement);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("reads Arabic-Indic digits typed on an Arabic keyboard", () => {
    const onCreate = mount();
    fireEvent.change(field(), { target: { value: "٧٥٠" } });
    fireEvent.click(create());
    expect(onCreate.mock.calls[0][0].deliveryCost).toBe(750);
  });
});
