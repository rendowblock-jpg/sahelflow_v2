import { describe, expect, it } from "vitest";

import { publishTestStore, SAMPLE_PRODUCTS } from "./test-support";
import { adaptPublicRelease } from "./adapt-release";
import type { PublicArtifact } from "../shared";
import type { StockRow } from "./types";

type Published = Awaited<ReturnType<typeof publishTestStore>>;

function load(store: Published): { artifact: PublicArtifact; stock: Map<string, StockRow> } {
  const release = store.database
    .prepare("SELECT artifact_json FROM storefront_release")
    .get() as { artifact_json: string };
  const rows = store.database
    .prepare("SELECT item_key, unit_price_dzd, remaining_quantity FROM storefront_allocation")
    .all() as Array<{ item_key: string; unit_price_dzd: number; remaining_quantity: number }>;
  return {
    artifact: JSON.parse(release.artifact_json) as PublicArtifact,
    stock: new Map(rows.map((row) => [row.item_key, { unitPriceDzd: row.unit_price_dzd, remaining: row.remaining_quantity }])),
  };
}

function adapt(store: Published, mutate?: (loaded: ReturnType<typeof load>) => void) {
  const loaded = load(store);
  mutate?.(loaded);
  return adaptPublicRelease({
    slug: store.slug,
    storeName: loaded.artifact.storeName,
    description: loaded.artifact.description,
    theme: loaded.artifact.theme,
    products: loaded.artifact.products,
    stock: loaded.stock,
  });
}

describe("adaptPublicRelease", () => {
  it("shows one card per product and folds variants: lowest price, combined units, retired variants out", async () => {
    const store = await publishTestStore();
    const { products, draft } = adapt(store);
    expect(products.map((product) => product.id)).toEqual(["product_00000001", "product_00000002", "product_00000003"]);
    expect(draft.selectedProductIds).toEqual(products.map((product) => product.id));
    const rug = products.find((product) => product.id === "product_00000003");
    expect(rug).toMatchObject({ price: 8_000, stock: 3 });
    store.database.close();
  });

  it("keeps a sold-out product on the page with zero units", async () => {
    const store = await publishTestStore();
    const clock = adapt(store).products.find((product) => product.id === "product_00000002");
    expect(clock).toMatchObject({ price: 4_200, stock: 0 });
    store.database.close();
  });

  it("passes https images through as the JSON list the renderer reads, and nothing for none", async () => {
    const store = await publishTestStore();
    const { products } = adapt(store);
    const mirror = products.find((product) => product.id === "product_00000001");
    expect(JSON.parse(mirror?.images ?? "[]")).toEqual([
      "https://images.example.test/miroir-1.jpg",
      "https://images.example.test/miroir-2.jpg",
    ]);
    expect(products.find((product) => product.id === "product_00000002")?.images).toBeNull();
    store.database.close();
  });

  it("leaves out an item that has no allocation row instead of showing it at price 0", async () => {
    const store = await publishTestStore();
    const { products } = adapt(store, (loaded) => loaded.stock.delete("product_00000001:base"));
    expect(products.map((product) => product.id)).toEqual(["product_00000002", "product_00000003"]);
    store.database.close();
  });

  it("never carries private fields: no delivery rules, no domain", async () => {
    const store = await publishTestStore();
    const { draft } = adapt(store);
    expect(draft.theme.builder.shippingRules).toEqual([]);
    expect(draft.theme.builder.domain).toMatchObject({ hostname: null, verificationName: null, verificationValue: null });
    expect(draft.isActive).toBe(true);
    expect(draft.slug).toBe("sahel-store");
    store.database.close();
  });

  it.each(["sahara", "atlas", "oasis"] as const)("keeps the %s palette and layout the seller published", async (template) => {
    const store = await publishTestStore({ template });
    const { draft } = adapt(store);
    expect(draft.theme.template).toBe(template);
    expect(draft.theme.primaryColor).toBe(store.theme.primaryColor);
    expect(draft.theme.hero.style).toBe(store.theme.hero.style);
    expect(draft.theme.builder.composition.sections.map((section) => section.type)).toEqual(
      store.theme.builder.composition.sections.map((section) => section.type),
    );
    store.database.close();
  });

  it("keeps the seller's contact details", async () => {
    const store = await publishTestStore({
      shapeTheme: (theme) => {
        theme.builder.contact = { phone: "0550 12 34 56", whatsapp: "0550123456", email: "shop@example.test", address: "Alger" };
      },
    });
    expect(adapt(store).draft.theme.builder.contact).toEqual({
      phone: "0550 12 34 56", whatsapp: "0550123456", email: "shop@example.test", address: "Alger",
    });
    store.database.close();
  });

  it("covers every sample product", () => {
    expect(SAMPLE_PRODUCTS.length).toBe(3);
  });
});
