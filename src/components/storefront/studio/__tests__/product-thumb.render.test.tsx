/**
 * @vitest-environment happy-dom
 */
/** Missing or broken product photos are a designed empty slot, never a broken image. */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductThumb } from "@/components/storefront/studio/product-thumb";
import { ProductsPanel } from "@/components/storefront/studio/studio-design-panels";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

afterEach(() => cleanup());

describe("ProductThumb", () => {
  it("shows the photo when there is one", () => {
    const { container } = render(<ProductThumb image="/uploads/a.jpg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/uploads/a.jpg");
    expect(screen.queryByTestId("product-thumb-empty")).toBeNull();
  });
  it("shows a labelled empty slot when there is no photo", () => {
    const { container } = render(<ProductThumb image={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("product-thumb-empty").getAttribute("aria-label")).toBe(
      "storefront.studioStates.photos.none",
    );
  });
  it("falls back to the empty slot when the photo fails to load", () => {
    const { container } = render(<ProductThumb image="file:///C:/photos/a.jpg" />);
    fireEvent.error(container.querySelector("img") as HTMLElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("product-thumb-empty")).toBeInTheDocument();
  });
});

describe("ProductsPanel photo honesty", () => {
  const products = [
    { id: "p1", name: "قميص قطني", price: 2500, sku: null, stock: 4, images: '["/uploads/a.jpg"]' },
    { id: "p2", name: "Sac cuir", price: 4800, sku: null, stock: 0, images: null },
  ];
  it("says the online store does not host photos yet and shows one slot per missing photo", () => {
    const { container } = render(
      <ProductsPanel products={products} selected={["p1"]} onChange={vi.fn()} onSetAll={vi.fn()} />,
    );
    expect(screen.getByTestId("products-photo-note").textContent).toContain(
      "storefront.studioStates.photos.notHosted",
    );
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getAllByTestId("product-thumb-empty")).toHaveLength(1);
  });
});
