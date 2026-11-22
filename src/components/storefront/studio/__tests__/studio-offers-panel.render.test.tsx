/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTranslations } from "@/lib/i18n";
import type { StorefrontStudioDraft } from "@/lib/storefront/studio-draft";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";
import { StudioOffersPanel } from "../studio-offers-panel";

const state = vi.hoisted(() => ({ locale: "en" as "ar" | "fr" | "en" }));

vi.mock("@/hooks/use-i18n", async () => {
  const { getTranslations: lookup } = await import("@/lib/i18n");
  return {
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        const dict = lookup(state.locale);
        let text = dict[key] ?? key;
        for (const [name, value] of Object.entries(params ?? {})) {
          text = text.split(`{${name}}`).join(String(value));
        }
        return text;
      },
      locale: state.locale,
      dir: state.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});

afterEach(() => {
  cleanup();
  state.locale = "en";
});

function makeDraft(offers?: StorefrontStudioDraft["offers"]): StorefrontStudioDraft {
  const theme = createDefaultStorefrontTheme("lumen");
  return {
    name: "Sahel Shop",
    slug: "sahel-shop",
    description: "",
    theme,
    selectedProductIds: ["prod_1"],
    isActive: true,
    ...(offers ? { offers } : {}),
  };
}

const PRODUCTS = [
  { id: "prod_1", name: "Argan Serum", price: 3000, sku: null, stock: 20, images: null },
];

describe("StudioOffersPanel (Quantity Offers M3)", () => {
  it("shows live buyer-pays / savings preview and applies the % off shortcut into a fixed DA total", () => {
    const commit = vi.fn();
    render(
      <StudioOffersPanel
        draft={makeDraft({ "prod_1:base": [{ q: 2, t: 5500 }] })}
        products={PRODUCTS}
        commit={commit}
      />,
    );

    const preview = screen.getByText(/Buyer pays 5,500 DA for 2 — saves 500 DA/);
    expect(preview).toBeTruthy();

    const pctInput = screen.getByLabelText("Discount percent shortcut") as HTMLInputElement;
    fireEvent.change(pctInput, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill DA" }));

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        offers: { "prod_1:base": [{ q: 2, t: 4500 }] },
      }),
    );
  });

  it("flags a stale offer ladder clearly when the product price drops below the bundle rate", () => {
    const commit = vi.fn();
    render(
      <StudioOffersPanel
        draft={makeDraft({ "prod_1:base": [{ q: 2, t: 5500 }] })}
        products={[{ ...PRODUCTS[0]!, price: 2500 }]}
        commit={commit}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-offer-error")).toBe("stale_price");
    expect(alert.textContent).toContain("Product price changed");
  });

  it("renders cleanly in Arabic without raw translation keys", () => {
    state.locale = "ar";
    const commit = vi.fn();
    const { container } = render(
      <StudioOffersPanel
        draft={makeDraft({ "prod_1:base": [{ q: 3, t: 7500 }] })}
        products={PRODUCTS}
        commit={commit}
      />,
    );
    expect(container.textContent).toContain("عروض الكمية");
    expect(container.textContent).not.toContain("storefront.offersPanel.");
  });
});
