import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAction: vi.fn(),
  assertAction: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  projectProduct: vi.fn((_: unknown, product: unknown) => product),
  projectProducts: vi.fn((_: unknown, products: unknown) => products),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
  assertTrustedAction: harness.assertAction,
}));

vi.mock("@/lib/identity/product-projection", () => ({
  projectProductForTrustedActor: harness.projectProduct,
  projectProductsForTrustedActor: harness.projectProducts,
}));

vi.mock("@/lib/data", () => ({
  productService: {
    list: harness.list,
    create: harness.create,
  },
}));

vi.mock("@/lib/db", () => ({
  db: { product: { count: harness.count } },
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET, POST } from "@/app/api/products/route";

const actorContext = {
  actor: { kind: "person" },
  shop: { shopId: "shop-a" },
};

describe("product route authority", () => {
  beforeEach(() => {
    harness.requireAction.mockReset().mockResolvedValue(actorContext);
    harness.assertAction.mockReset();
    harness.list.mockReset().mockResolvedValue([]);
    harness.create.mockReset().mockResolvedValue({ id: "product-1" });
    harness.count.mockReset().mockResolvedValue(0);
    harness.projectProduct.mockClear();
    harness.projectProducts.mockClear();
  });

  it("denies a list before any catalog read", async () => {
    harness.requireAction.mockRejectedValue(new Error("forbidden"));

    await expect(
      GET(new NextRequest("http://localhost/api/products")),
    ).rejects.toThrow("forbidden");
    expect(harness.requireAction).toHaveBeenCalledWith("products.read");
    expect(harness.list).not.toHaveBeenCalled();
    expect(harness.count).not.toHaveBeenCalled();
  });

  it("denies product creation before parsing or mutation when read-back is forbidden", async () => {
    harness.assertAction.mockImplementation(() => {
      throw new Error("read forbidden");
    });

    await expect(
      POST(
        new NextRequest("http://localhost/api/products", {
          method: "POST",
          body: JSON.stringify({ name: "Widget", price: 2_000 }),
        }),
      ),
    ).rejects.toThrow("read forbidden");
    expect(harness.requireAction).toHaveBeenCalledWith("products.manage");
    expect(harness.create).not.toHaveBeenCalled();
  });
});
