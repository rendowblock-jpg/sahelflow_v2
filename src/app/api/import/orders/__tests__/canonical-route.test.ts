process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

import { POST } from "@/app/api/import/orders/route";
import { cleanDb, getJson, rawDb } from "@/app/api/__tests__/helpers";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

const mapping = {
  Order: "orderNumber",
  Customer: "customerName",
  Phone: "phone",
  Wilaya: "wilaya",
  Commune: "commune",
  Address: "address",
  SKU: "productSku",
  Product: "productName",
  Variant: "variantName",
  "Variant SKU": "variantSku",
  Qty: "quantity",
  Price: "unitPrice",
  Delivery: "deliveryCost",
  Status: "status",
};

function importRequest(csv: string, commit: boolean): NextRequest {
  const formData = new FormData();
  formData.append("file", new File([csv], "orders.csv", { type: "text/csv" }));
  formData.append("commit", String(commit));
  formData.append("mapping", JSON.stringify(mapping));
  return new NextRequest("http://localhost/api/import/orders", {
    method: "POST",
    body: formData,
  });
}

function csv(rows: string[][]): string {
  return [
    [
      "Order",
      "Customer",
      "Phone",
      "Wilaya",
      "Commune",
      "Address",
      "SKU",
      "Product",
      "Variant",
      "Variant SKU",
      "Qty",
      "Price",
      "Delivery",
      "Status",
    ],
    ...rows,
  ]
    .map((row) => row.join(","))
    .join("\n");
}

async function product(input: {
  name: string;
  sku?: string;
  price: number;
  stock?: number;
}) {
  const category = await rawDb.category.create({
    data: { name: `Import category ${input.name} ${crypto.randomUUID()}` },
  });
  return rawDb.product.create({
    data: {
      name: input.name,
      sku: input.sku ?? null,
      price: input.price,
      stock: input.stock ?? 20,
      isActive: true,
      categoryId: category.id,
    },
  });
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical CSV/XLSX order import", () => {
  it("previews grouped rows using server catalog prices", async () => {
    await product({ name: "Phone Case", sku: "CASE-1", price: 2400 });
    await product({ name: "Cable", sku: "CABLE-1", price: 900 });
    const contents = csv([
      [
        "EXT-100",
        "Import Customer",
        "0555123456",
        "Alger",
        "Bab Ezzouar",
        "1 Import Street",
        "CASE-1",
        "Phone Case",
        "",
        "",
        "2",
        "1",
        "500",
        "pending",
      ],
      [
        "EXT-100",
        "Import Customer",
        "0555123456",
        "Alger",
        "Bab Ezzouar",
        "1 Import Street",
        "CABLE-1",
        "Cable",
        "",
        "",
        "1",
        "99999",
        "500",
        "pending",
      ],
    ]);

    const response = await POST(importRequest(contents, false));
    expect(response.status).toBe(200);
    const body = await getJson(response);
    expect(body).toMatchObject({
      totalRows: 2,
      validCount: 2,
      validOrderCount: 1,
      invalidCount: 0,
      source: "csv",
    });
    expect(body.preview).toEqual([
      expect.objectContaining({
        groupKey: "EXT-100",
        productName: "Phone Case",
        serverUnitPrice: 2400,
        suppliedUnitPrice: 1,
        priceChanged: true,
      }),
      expect.objectContaining({
        productName: "Cable",
        serverUnitPrice: 900,
        suppliedUnitPrice: 99999,
        priceChanged: true,
      }),
    ]);
    expect(await rawDb.order.count()).toBe(0);
  });

  it("commits one grouped canonical order and safely replays the same file", async () => {
    await product({ name: "Phone Case", sku: "CASE-2", price: 2500 });
    await product({ name: "Cable", sku: "CABLE-2", price: 1000 });
    const contents = csv([
      [
        "EXT-200",
        "Grouped Customer",
        "0555123456",
        "Alger",
        "Bab Ezzouar",
        "2 Import Street",
        "CASE-2",
        "Phone Case",
        "",
        "",
        "2",
        "2",
        "500",
        "pending",
      ],
      [
        "EXT-200",
        "Grouped Customer",
        "0555123456",
        "Alger",
        "Bab Ezzouar",
        "2 Import Street",
        "CABLE-2",
        "Cable",
        "",
        "",
        "1",
        "1",
        "500",
        "pending",
      ],
    ]);

    const first = await POST(importRequest(contents, true));
    const replay = await POST(importRequest(contents, true));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await getJson(first)).toMatchObject({
      inserted: 1,
      replayed: 0,
      processedRows: 2,
      validOrderCount: 1,
      errors: [],
    });
    expect(await getJson(replay)).toMatchObject({
      inserted: 0,
      replayed: 1,
      processedRows: 2,
      errors: [],
    });

    const orders = await rawDb.order.findMany({ include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      source: "csv",
      status: "pending",
      totalPrice: 6500,
      deliveryCost: 500,
    });
    expect(orders[0]?.items).toHaveLength(2);
    expect(
      isCanonicalOrderAuthority(
        orders[0]?.source,
        orders[0]?.sourceMetadata,
      ),
    ).toBe(true);
    expect(await rawDb.businessCommand.count()).toBe(1);
  });

  it("requires exact variant identity and applies the variant server price", async () => {
    const base = await product({ name: "T-Shirt", sku: "TSHIRT", price: 2000 });
    await rawDb.productVariant.createMany({
      data: [
        {
          productId: base.id,
          name: "Small",
          sku: "TS-S",
          price: 2200,
          stock: 5,
          isActive: true,
        },
        {
          productId: base.id,
          name: "Large",
          sku: "TS-L",
          price: 2600,
          stock: 5,
          isActive: true,
        },
      ],
    });
    const missingVariant = csv([
      [
        "EXT-300",
        "Variant Customer",
        "0555123456",
        "Alger",
        "Centre",
        "3 Import Street",
        "TSHIRT",
        "T-Shirt",
        "",
        "",
        "1",
        "2000",
        "0",
        "pending",
      ],
    ]);
    const invalidPreview = await getJson(
      await POST(importRequest(missingVariant, false)),
    );
    expect(invalidPreview).toMatchObject({
      validOrderCount: 0,
      invalidCount: 1,
    });

    const exactVariant = missingVariant.replace(
      "TSHIRT,T-Shirt,,,1,2000",
      "TSHIRT,T-Shirt,Large,TS-L,1,2000",
    );
    const response = await POST(importRequest(exactVariant, true));
    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({ inserted: 1, errors: [] });
    const order = await rawDb.order.findFirst({ include: { items: true } });
    expect(order?.items[0]).toMatchObject({
      productVariantName: "Large",
      unitPrice: 2600,
    });
  });

  it("rejects ambiguous product names before command creation", async () => {
    await product({ name: "Duplicate Name", price: 1000 });
    await product({ name: "Duplicate Name", price: 1500 });
    const contents = csv([
      [
        "EXT-400",
        "Ambiguous Customer",
        "0555123456",
        "Alger",
        "Centre",
        "4 Import Street",
        "",
        "Duplicate Name",
        "",
        "",
        "1",
        "1000",
        "0",
        "pending",
      ],
    ]);

    const preview = await getJson(await POST(importRequest(contents, false)));
    expect(preview).toMatchObject({ validOrderCount: 0, invalidCount: 1 });
    expect(preview.errors).toEqual([
      expect.objectContaining({
        errors: [expect.stringMatching(/ambiguous/i)],
      }),
    ]);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });
});
