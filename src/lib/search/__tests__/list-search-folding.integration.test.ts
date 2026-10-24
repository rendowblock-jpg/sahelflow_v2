import { appendFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEST_SHOP_CONTEXT,
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedOrder,
  seedProduct,
  uniquePhone,
} from "@/lib/data/__tests__/helpers";
import { searchCannedResponses } from "@/lib/data/canned-response-service";
import { customerServiceExtensions } from "@/lib/data/extensions/customer-extensions";
import { orderServiceExtensions } from "@/lib/data/extensions/order-extensions";
import { productServiceExtensions } from "@/lib/data/extensions/product-extensions";
import { warmLocalSearchProjection } from "@/lib/search/local-search-projection";

/**
 * Real SQLite rows. The app's `db` is replaced by a counting client on the same test database, so the
 * number of queries one search costs is measured, not guessed.
 */
const probe = vi.hoisted(() => ({ ops: 0 }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  const base = new Client();
  const db = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
          probe.ops += 1;
          return query(args);
        },
      },
    },
  });
  return { db, shopContext: helpers.TEST_SHOP_CONTEXT };
});

import { db as countedDb } from "@/lib/db";

let seed: PrismaClient;
const ctx = () => ({ prisma: countedDb as never, shop: TEST_SHOP_CONTEXT });
const WARM_ALL = { customer: true, order: true, product: false, delivery: false, return: false, conversation: false };

beforeEach(async () => {
  seed = await createTestPrisma();
});
afterEach(async () => {
  await disconnectTestPrisma(seed);
});

describe("customers list search", () => {
  const CASES: Array<[string, string]> = [
    ["احمد", "أحمد بن علي"],
    ["بن", "أحمد بن علي"],
    ["فاطمه", "فاطمة"],
    ["مصطفي", "مصطفى"],
    ["+213 655 12 34 56", "أحمد بن علي"],
    ["٠٦٥٥١٢٣٤٥٦", "أحمد بن علي"],
    ["0655 12 34 56", "أحمد بن علي"],
    ["أحمد بن علي", "أحمد بن علي"],
  ];

  it.each(CASES)("query %s finds %s", async (q, expected) => {
    await seedCustomer(seed, { name: "أحمد بن علي", phone: "0655123456" });
    await seedCustomer(seed, { name: "فاطمة", phone: uniquePhone() });
    await seedCustomer(seed, { name: "مصطفى", phone: uniquePhone() });
    const rows = await customerServiceExtensions.search(ctx(), q);
    expect(rows.map((r) => r.name)).toEqual([expected]);
  });

  it("reports how many queries one search costs", async () => {
    await seedCustomer(seed, { name: "أحمد بن علي", phone: "0655123456" });
    await customerServiceExtensions.search(ctx(), "ahmed"); // warm key caches
    probe.ops = 0;
    await customerServiceExtensions.search(ctx(), "احمد");
    appendFileSync("/tmp/w13b-queries.txt", `customers.search ${probe.ops}\n`);
    expect(probe.ops).toBeGreaterThan(0);
  });
});

describe("orders search", () => {
  async function seedTwoOrders() {
    const product = await seedProduct(seed);
    const ahmed = await seedCustomer(seed, { name: "أحمد بن علي", phone: "0655123456" });
    const fatima = await seedCustomer(seed, { name: "فاطمة", phone: uniquePhone() });
    const o1 = await seedOrder(seed, { customerId: ahmed.id, productId: product.id });
    const o2 = await seedOrder(seed, { customerId: fatima.id, productId: product.id });
    await seed.order.update({ where: { id: o1.id }, data: { orderNumber: "ORD-2026-0012", wilaya: "باتنة", phone: "0655123456" } });
    await seed.order.update({ where: { id: o2.id }, data: { orderNumber: "ORD-2026-0099", wilaya: "Oran" } });
  }

  const CASES: Array<[string, string]> = [
    ["احمد", "ORD-2026-0012"],
    ["+213 655 12 34 56", "ORD-2026-0012"],
    ["٠٦٥٥١٢٣٤٥٦", "ORD-2026-0012"],
    ["فاطمه", "ORD-2026-0099"],
    ["ord-٢٠٢٦-٠٠١٢", "ORD-2026-0012"],
    ["ORD-2026-0012", "ORD-2026-0012"],
    ["باتنه", "ORD-2026-0012"],
    ["أحمد بن علي", "ORD-2026-0012"],
  ];

  it.each(CASES)("query %s finds order %s", async (q, expected) => {
    await seedTwoOrders();
    const rows = await orderServiceExtensions.search(ctx(), q);
    expect(rows.map((r) => r.orderNumber)).toEqual([expected]);
  });

  it("reports how many queries one search costs", async () => {
    await seedTwoOrders();
    await orderServiceExtensions.search(ctx(), "ord");
    probe.ops = 0;
    await orderServiceExtensions.search(ctx(), "احمد");
    appendFileSync("/tmp/w13b-queries.txt", `orders.search ${probe.ops}\n`);
    expect(probe.ops).toBeGreaterThan(0);
  });
});

describe("products and canned responses", () => {
  it.each([
    ["decoratif", "Décoratif miroir"],
    ["DECORATIF", "Décoratif miroir"],
    ["احمد", "أحمد"],
  ])("product query %s finds %s", async (q, expected) => {
    // seedProduct creates a fixed category, so the second product is a copy of the first.
    const a = await seedProduct(seed);
    await seed.product.update({ where: { id: a.id }, data: { name: "Décoratif miroir", sku: "SKU-0012" } });
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = (await seed.product.findUniqueOrThrow({ where: { id: a.id } }));
    await seed.product.create({ data: { ...rest, name: "أحمد", sku: "AHM-1" } });
    const rows = await productServiceExtensions.search(ctx(), q);
    expect(rows.map((r) => r.name)).toEqual([expected]);
  });

  it.each([
    ["احمد", "salut"],
    ["decoratif", "promo"],
  ])("canned response query %s finds %s", async (q, expected) => {
    await seed.cannedResponse.deleteMany({});
    await seed.cannedResponse.create({ data: { shortCode: "salut", content: "مرحبا أحمد" } });
    await seed.cannedResponse.create({ data: { shortCode: "promo", content: "x", description: "Décoratif" } });
    const rows = await searchCannedResponses(ctx(), q);
    expect(rows.map((r) => r.shortCode)).toEqual([expected]);
  });
});

describe("one-time re-queue of the stored tokens", () => {
  const tokens = (id: string) => seed.searchProjectionToken.count({ where: { family: "customer", entityId: id } });

  it("rebuilds every customer once when the stored token revision is old, then leaves them alone", async () => {
    const c = await seedCustomer(seed, { name: "فاطمة", phone: "0655000111" });
    await warmLocalSearchProjection("test", WARM_ALL);
    // Rows as the old fold wrote them: tokens exist, no dirty row, no revision marker.
    await seed.searchProjectionDirty.deleteMany({});
    await seed.searchProjectionRevision.deleteMany({ where: { id: "token-fold" } });
    await seed.searchProjectionToken.deleteMany({ where: { family: "customer", entityId: c.id } });

    await warmLocalSearchProjection("test", WARM_ALL);
    expect(await tokens(c.id)).toBeGreaterThan(0);
    const marker = await seed.searchProjectionRevision.findUnique({ where: { id: "token-fold" } });
    expect(marker?.revision ?? 0).toBeGreaterThan(0);

    await seed.searchProjectionToken.deleteMany({ where: { family: "customer", entityId: c.id } });
    await warmLocalSearchProjection("test", WARM_ALL);
    expect(await tokens(c.id)).toBe(0);
  });
});
