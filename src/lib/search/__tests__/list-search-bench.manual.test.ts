/**
 * MANUAL BENCH (skipped unless SF_BENCH is set): how long one keystroke of the
 * list searches takes on a big shop. Method of the 24 Oct 2026 bench (audit/reports/
 * list-search-bench-20261024.md): the real protected client (src/lib/db.ts, sealed
 * name/phone/address, blind indexes) behind a counting Prisma extension, rows seeded
 * with createMany, per case 2 warm-ups + 15 timed runs, median and p95.
 *
 *   SF_BENCH=1 SF_BENCH_SCALE=10000 SF_BENCH_OUT=/tmp/x.jsonl flock /tmp/vt.lock sf vt WT <this file>
 *
 * SF_BENCH_SCALE = customers (default 1000); orders = 2 x that; products = min(5000, scale).
 * Every seeded row has an id that starts with "bench-" and is deleted in afterAll.
 * NODE_ENV=test keeps the plaintext `contains` fallback branches, so the orders numbers are pessimistic.
 */
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { clearFoldedRowCache } from "@/lib/search/list-search-candidates";
import { warmLocalSearchProjection } from "@/lib/search/local-search-projection";

import {
  BENCH_QUERIES,
  BENCH_SUITES,
  formatBenchTable,
  medianOf,
  p95Of,
  type BenchLine,
} from "./list-search-bench-format";

export { formatBenchTable };

type Passthrough = { args: unknown; query: (a: unknown) => Promise<unknown> };
const probe = vi.hoisted(() => ({ ops: 0 }));
vi.mock("@/lib/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/db")>();
  const counted = real.db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: Passthrough) {
          probe.ops += 1;
          return query(args);
        },
      },
    },
  });
  return { ...real, db: counted };
});
vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/identity/authorization")>();
  return {
    ...real,
    assertTrustedAction: () => undefined,
    // Everything allowed except the risk read: the list page then skips the risk assessment queries.
    trustedActionAllowed: (_actor: unknown, action: string) => action !== "risk.read",
  };
});

import { dbRaw, db as countedDb, shopContext } from "@/lib/db";
import { customerServiceExtensions } from "@/lib/data/extensions/customer-extensions";
import { orderServiceExtensions } from "@/lib/data/extensions/order-extensions";
import { productServiceExtensions } from "@/lib/data/extensions/product-extensions";
import { searchCannedResponses } from "@/lib/data/canned-response-service";
import { getOrdersWorkbenchPage } from "@/lib/orders/order-list-workbench";
import { getProductsWorkbenchPage } from "@/lib/products/product-workbench";

const SCALE = Math.max(100, Number(process.env.SF_BENCH_SCALE ?? "1000") || 1000);
const CUSTOMERS = SCALE;
const ORDERS = SCALE * 2;
const PRODUCTS = Math.min(5000, SCALE);
const CANNED = 50;
const WARMUPS = 2;
const RUNS = 15;
const OUT = process.env.SF_BENCH_OUT;
const FAMILIES = ["customer", "order", "product", "conversation", "delivery", "return"];

const AR_FIRST = ["أحمد", "محمد", "يوسف", "كريم", "سمير", "ليلى", "فاطمة", "نور", "أمينة", "ياسين"];
const FR_FIRST = ["Karim", "Yacine", "Amine", "Sofiane", "Nadia", "Samira", "Lilia", "Mehdi", "Rania", "Walid"];
const AR_LAST = ["بن علي", "بوزيد", "مرزوق", "بلقاسم", "حداد", "بن عمر", "قاسمي", "عباسي"];
const FR_LAST = ["Benali", "Boudiaf", "Mezouar", "Belkacem", "Haddad", "Benamar", "Cherif", "Abbasi"];
const WILAYAS = ["Alger", "16", "وهران", "Constantine", "31", "Blida", "Sétif", "19"];
const STATUSES = ["draft", "confirmed", "shipped", "delivered"];

/** Cycle through a list; the `?? ""` only satisfies unchecked indexed access (the lists are never empty). */
const pick = (list: readonly string[], i: number): string => list[i % list.length] ?? "";

function customerName(i: number): string {
  const first = i % 10;
  const last = Math.floor(i / 10) % 8;
  if (i % 3 === 0) return `${AR_FIRST[first]} ${AR_LAST[last]}`;
  if (i % 3 === 1) return `${FR_FIRST[first]} ${FR_LAST[last]}`;
  return `${FR_FIRST[first]} ${AR_LAST[last]}`;
}
function customerPhone(i: number): string {
  if (i === 0) return "0655123456";
  return `0${[5, 6, 7][i % 3]}${String(10000000 + ((i * 7919) % 89999999))}`;
}
async function inBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let at = 0; at < rows.length; at += 500) await write(rows.slice(at, at + 500));
}
async function sweep(): Promise<void> {
  const prefix = { gte: "bench-", lt: "bench." };
  await dbRaw.order.deleteMany({ where: { id: prefix } });
  await dbRaw.customer.deleteMany({ where: { id: prefix } });
  await dbRaw.product.deleteMany({ where: { id: prefix } });
  await dbRaw.cannedResponse.deleteMany({ where: { id: prefix } });
  for (const family of FAMILIES) {
    await dbRaw.searchProjectionToken.deleteMany({ where: { family, entityId: prefix } });
    await dbRaw.searchProjectionDirty.deleteMany({ where: { family, entityId: prefix } });
  }
}

const ctx = { prisma: countedDb as never, shop: shopContext };
const actor = { shop: { shopId: shopContext.shopId } } as never;
const CASES: Record<(typeof BENCH_SUITES)[number], (text: string) => Promise<number>> = {
  customers: async (q) => (await customerServiceExtensions.search(ctx, q)).length,
  "orders.search": async (q) => (await orderServiceExtensions.search(ctx, q)).length,
  "orders.page": async (q) => (await getOrdersWorkbenchPage(actor, { q })).orders.length,
  "products.search": async (q) => (await productServiceExtensions.search(ctx, q)).length,
  "products.page": async (q) => (await getProductsWorkbenchPage(actor, { q })).products.length,
  canned: async (q) => (await searchCannedResponses(ctx, q)).length,
};

describe.skipIf(!process.env.SF_BENCH)("list search bench", () => {
  const lines: BenchLine[] = [];

  beforeAll(async () => {
    await sweep();
    const now = Date.now();
    const customers = Array.from({ length: CUSTOMERS }, (_, i) => {
      return { id: `bench-c-${i}`, name: customerName(i), phone: customerPhone(i), wilaya: pick(WILAYAS, i) };
    });
    await inBatches(customers, (data) => countedDb.customer.createMany({ data }));
    const orders = Array.from({ length: ORDERS }, (_, i) => ({
      id: `bench-o-${i}`,
      orderNumber: `ORD-2026-${String(i + 1).padStart(4, "0")}`,
      status: pick(STATUSES, i),
      customerId: `bench-c-${i % CUSTOMERS}`,
      totalPrice: 1000 + (i % 50) * 100,
      wilaya: pick(WILAYAS, i),
      commune: "Centre",
      address: `Rue ${i} Cité ${i % 40}`,
      phone: customerPhone(i % CUSTOMERS),
      createdAt: new Date(now - i * 60_000),
    }));
    await inBatches(orders, (data) => countedDb.order.createMany({ data }));
    const products = Array.from({ length: PRODUCTS }, (_, i) => ({
      id: `bench-p-${i}`,
      name: i % 500 === 0 ? `قميص أحمد ${i}` : i % 2 === 0 ? `Produit ${i}` : `منتج ${i}`,
      sku: `BENCH-SKU-${i}`,
      price: 500 + (i % 90) * 50,
    }));
    await inBatches(products, (data) => countedDb.product.createMany({ data }));
    const canned = Array.from({ length: CANNED }, (_, i) => ({
      id: `bench-r-${i}`,
      shortCode: `bench-${i}`,
      content: i % 5 === 0 ? `مرحبا أحمد رقم ${i}` : `Bonjour, commande ${i} confirmée`,
    }));
    await countedDb.cannedResponse.createMany({ data: canned });

    const t0 = performance.now();
    const scope = { customer: true, order: true, product: true, delivery: false, return: false, conversation: false };
    for (let pass = 0; pass < 12; pass += 1) {
      await warmLocalSearchProjection(shopContext.shopId, scope);
      const dirty = await dbRaw.searchProjectionDirty.count({ where: { entityId: { gte: "bench-", lt: "bench." } } });
      process.stdout.write(`bench warm pass ${pass + 1}: ${dirty} dirty bench rows left, ${Math.round(performance.now() - t0)} ms\n`);
      if (dirty === 0) break;
    }
  }, 30 * 60_000);

  afterAll(async () => {
    await sweep();
    expect(await dbRaw.customer.count({ where: { id: { gte: "bench-", lt: "bench." } } })).toBe(0);
    expect(await dbRaw.order.count({ where: { id: { gte: "bench-", lt: "bench." } } })).toBe(0);
    clearFoldedRowCache();
  }, 10 * 60_000);

  it("times every suite on the six queries", async () => {
    for (const suite of BENCH_SUITES) {
      for (const [label, text] of BENCH_QUERIES) {
        const run = CASES[suite];
        for (let i = 0; i < WARMUPS; i += 1) await run(text);
        const samples: number[] = [];
        let queries = 0;
        let hits = 0;
        for (let i = 0; i < RUNS; i += 1) {
          probe.ops = 0;
          const start = performance.now();
          hits = await run(text);
          samples.push(performance.now() - start);
          if (i === 0) queries = probe.ops;
        }
        const line: BenchLine = {
          suite,
          query: label,
          customers: CUSTOMERS,
          orders: ORDERS,
          median: medianOf(samples),
          p95: p95Of(samples),
          queries,
          hits,
          runs: RUNS,
        };
        lines.push(line);
        if (OUT) appendFileSync(OUT, `${JSON.stringify(line)}\n`);
      }
    }
    process.stdout.write(`\n${formatBenchTable(lines)}\n\n`);
    expect(lines).toHaveLength(BENCH_SUITES.length * BENCH_QUERIES.length);
  }, 30 * 60_000);
});
