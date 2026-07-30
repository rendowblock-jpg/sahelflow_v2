process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { cleanDb, getJson, rawDb } from "@/app/api/__tests__/helpers";
import { POST as importOrders } from "@/app/api/import/orders/route";
import { orderService } from "@/lib/data/order-service";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

function importRequest(csv: string): NextRequest {
  const form = new FormData();
  form.set("file", new File([csv], "orders.csv", { type: "text/csv" }));
  form.set("commit", "true");
  return new NextRequest("http://localhost/api/import/orders", {
    method: "POST",
    body: form,
  });
}

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("order import compatibility authority", () => {
  it("preserves historical states but denies confirming unmapped pending imports", async () => {
    const csv = [
      "customerName,phone,wilaya,commune,address,productName,quantity,unitPrice,status,orderNumber",
      "Pending Customer,0555000101,Alger,Alger Centre,Address A,Imported Product,2,1500,pending,LEG-001",
      "Delivered Customer,0555000102,Oran,Oran Centre,Address B,Historical Product,1,2500,delivered,LEG-002",
    ].join("\n");

    const response = await importOrders(importRequest(csv));
    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({ inserted: 2, errors: [] });

    const orders = await rawDb.order.findMany({
      orderBy: { sourceOrderId: "asc" },
      include: { items: true },
    });
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      source: "import",
      sourceOrderId: "LEG-001",
      status: "pending",
    });
    expect(orders[0]!.items[0]).toMatchObject({
      productId: null,
      productName: "Imported Product",
    });
    expect(orders[1]).toMatchObject({
      source: "import",
      sourceOrderId: "LEG-002",
      status: "delivered",
    });

    await expect(
      orderService.updateStatus(
        { prisma: rawDb as never },
        orders[0]!.id,
        "confirmed",
      ),
    ).rejects.toThrow(/invalid transition|cannot transition/i);
    expect(await rawDb.order.findUnique({ where: { id: orders[0]!.id } })).toMatchObject({
      status: "pending",
    });
  });

  it("rejects unknown lifecycle labels instead of recategorizing them as pending", async () => {
    const csv = [
      "customerName,phone,wilaya,commune,address,productName,quantity,unitPrice,status",
      "Unknown State,0555000103,Alger,Alger Centre,Address C,Product,1,1000,archived",
    ].join("\n");

    const response = await importOrders(importRequest(csv));
    expect(response.status).toBe(200);
    expect(await getJson(response)).toMatchObject({ inserted: 0 });
    expect(await rawDb.order.count()).toBe(0);
  });
});
