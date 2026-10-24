process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getCanonicalCodOrderPosition,
  getCanonicalCodWorkspaceSummary,
} from "@/lib/accounting/canonical-cod-projections";
import type { ServiceContext } from "@/lib/data/service-base";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

/**
 * MNY-01 / MNY-01B against a REAL SQLite database. canonical-cod-isolation.test.ts proves the paging logic against an in-memory
 * stand-in; this file proves that the paging on the real table returns every delivered order exactly once, newest delivery first,
 * and that SQLite answers each page from the (status, createdAt) index without sorting the whole remaining set (the id-keyset
 * shape did, so the read grew with the square of the order count: 12 s at 60,000 orders).
 *
 * 2,300 orders were delivered at the SAME instant (a bulk import, a courier sync): the delivery date alone cannot order them.
 * The pages are cut by createdAt and id, and their createdAt is chosen so a page boundary falls inside a group of orders created at
 * the same millisecond: 100 newest orders with their own createdAt, then 2,150 orders on ONE createdAt (more than two pages, so the
 * whole of page 2 is inside the group), then 50 older ones. 2,300 = three pages (1,000 + 1,000 + 300), which crosses two page
 * boundaries. Two more orders test the order of the list: one delivered a day LATER (it must come first although its id may sort
 * anywhere) and one with NO delivery date (it must come last).
 *
 * The orders have no receivable record on purpose: the projection then reports each one as flagged (receivable_missing), a per-order
 * answer that carries the order id, so completeness, uniqueness and order can be read from `flaggedOrders` without writing the money
 * facts. NOT covered here: the settlement side (it needs settlement rows; the stand-in test covers it).
 */

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
/** The SQL (and its bound values) of every query that paged the delivered orders, in the order they ran. */
const orderPageQueries: Array<{ query: string; params: string }> = [];
db.$on("query", (event: Prisma.QueryEvent) => {
  if (/^SELECT .* FROM `main`\.`Order` WHERE/.test(event.query) && event.query.includes("`deliveryState` = ?") && event.query.includes("LIMIT")) {
    orderPageQueries.push({ query: event.query, params: event.params });
  }
});
const context = { prisma: db as never } satisfies ServiceContext;

const SAME_INSTANT = 2_300;
const PREFIX = "PAGING-";
const AT = new Date("2026-10-01T10:00:00.000Z");
/** The createdAt the 2,150 tied orders share. */
const TIED_CREATED_AT = new Date("2026-09-15T08:00:00.000Z");
const createdAtOf = (index: number): Date =>
  index < 100
    ? new Date(Date.UTC(2026, 9, 1, 0, 0, 0) - index * 1_000) // 100 newest, each its own createdAt
    : index < 2_250
      ? TIED_CREATED_AT
      : new Date(Date.UTC(2026, 8, 1, 0, 0, 0) - index * 1_000); // 50 oldest, each its own createdAt

async function clean(): Promise<void> {
  await db.order.deleteMany({ where: { orderNumber: { startsWith: PREFIX } } });
  await db.customer.deleteMany({ where: { phone: "paging-customer" } });
}

beforeAll(async () => {
  await clean();
  orderPageQueries.length = 0;
  const customer = await db.customer.create({
    data: { name: "Paging customer", phone: "paging-customer", nameBlindIndex: "paging-customer", wilaya: "Alger", commune: "Alger Centre", address: "Test" },
  });
  const sourceMetadata = trustedManualOrderSourceMetadata();
  const row = (orderNumber: string, deliveredAt: Date | null, createdAt: Date = AT) => ({
    orderNumber,
    createdAt,
    status: "delivered",
    deliveryState: "delivered",
    codState: "receivable",
    deliveredAt,
    version: 1,
    customerId: customer.id,
    totalPrice: 2_500,
    deliveryCost: 0,
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "Test",
    phone: `paging-${orderNumber}`,
    source: "manual",
    sourceMetadata,
  });
  for (let from = 0; from < SAME_INSTANT; from += 500) {
    await db.order.createMany({
      data: Array.from({ length: Math.min(500, SAME_INSTANT - from) }, (_, offset) => row(`${PREFIX}${String(from + offset).padStart(5, "0")}`, AT, createdAtOf(from + offset))),
    });
  }
  await db.order.create({ data: row(`${PREFIX}ZZZ-NEWEST`, new Date("2026-10-02T10:00:00.000Z")) });
  await db.order.create({ data: row(`${PREFIX}AAA-UNDATED`, null) });
}, 120_000);

afterAll(async () => {
  await clean();
  await db.$disconnect();
}, 120_000);

describe("COD reconciliation paging on a real SQLite database (MNY-01)", () => {
  it("reads every one of 2,302 orders exactly once across three pages, the same-instant ones included", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context as never);
    const mine = summary.flaggedOrders.filter((entry) => entry.orderNumber.startsWith(PREFIX));
    expect(mine).toHaveLength(SAME_INSTANT + 2);
    expect(new Set(mine.map((entry) => entry.orderId)).size).toBe(SAME_INSTANT + 2);
    expect(new Set(mine.map((entry) => entry.orderNumber)).size).toBe(SAME_INSTANT + 2);
    expect(mine.every((entry) => entry.reason === "receivable_missing")).toBe(true);
    expect(summary.truncated).toEqual({ orders: false, settlements: false });
  }, 120_000);

  it("lists the later delivery first and the order with no delivery date last", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context as never);
    const mine = summary.flaggedOrders.filter((entry) => entry.orderNumber.startsWith(PREFIX));
    expect(mine[0]?.orderNumber).toBe(`${PREFIX}ZZZ-NEWEST`);
    expect(mine[mine.length - 1]?.orderNumber).toBe(`${PREFIX}AAA-UNDATED`);
  }, 120_000);

  it("lists the orders in the contract order: delivery time newest first, no delivery date last, ties by id descending", async () => {
    const summary = await getCanonicalCodWorkspaceSummary(context as never);
    const mine = summary.flaggedOrders.filter((entry) => entry.orderNumber.startsWith(PREFIX));
    const rows = await db.order.findMany({ where: { orderNumber: { startsWith: PREFIX } }, select: { id: true, deliveredAt: true } });
    const expected = rows
      .sort((a, b) => {
        const timeA = a.deliveredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const timeB = b.deliveredAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        if (timeA !== timeB) return timeB > timeA ? 1 : -1;
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      })
      .map((row) => row.id);
    expect(mine.map((entry) => entry.orderId)).toEqual(expected);
  }, 120_000);

  it("reads the 2,302 orders in three queries of at most 1,000 rows, a tie-group offset only where the createdAt repeats", async () => {
    orderPageQueries.length = 0;
    await getCanonicalCodWorkspaceSummary(context as never);
    const pages = orderPageQueries.filter((entry) => !entry.query.includes("`id` IN"));
    // The shop may hold other delivered orders in this database; only the count of pages that cover our 2,302 is fixed.
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const page of pages) expect(page.query).toMatch(/ORDER BY `main`\.`Order`\.`createdAt` DESC, `main`\.`Order`\.`id` DESC/);
    expect(pages.filter((entry) => entry.query.includes("`createdAt` <= ?"))).toHaveLength(pages.length - 1);
    // Page 2 and 3 start inside the tie group: their offset is the number of rows already read on that createdAt.
    const offsets = pages.map((entry) => (JSON.parse(entry.params) as unknown[]).at(-1));
    expect(offsets.slice(1).some((offset) => typeof offset === "number" && offset > 0)).toBe(true);
  }, 120_000);

  it("answers every page from the (status, createdAt) index and sorts nothing but ties (no TEMP B-TREE for the whole ORDER BY)", async () => {
    orderPageQueries.length = 0;
    await getCanonicalCodWorkspaceSummary(context as never);
    const pages = orderPageQueries.filter((entry) => !entry.query.includes("`id` IN"));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const page of pages) {
      // The log prints a date as text; the plan does not depend on the value, so a number stands in for it.
      const params = (JSON.parse(page.params) as unknown[]).map((value) =>
        typeof value === "string" && /\d{4}-\d{2}-\d{2}.*UTC$/.test(value) ? Date.parse(value.replace(" ", "T").replace(" UTC", "Z")) : value,
      );
      const plan = await db.$queryRawUnsafe<Array<{ detail: string }>>(`EXPLAIN QUERY PLAN ${page.query}`, ...params);
      const details = plan.map((line) => line.detail);
      expect(details, details.join(" | ")).not.toContain("USE TEMP B-TREE FOR ORDER BY");
      expect(details.some((line) => line.includes("Order_status_createdAt_deletedAt_idx")), details.join(" | ")).toBe(true);
    }
  }, 120_000);

  it("finds the position of one order through a direct query (it fails closed because this order has no receivable)", async () => {
    const last = await db.order.findFirstOrThrow({ where: { orderNumber: `${PREFIX}${String(SAME_INSTANT - 1).padStart(5, "0")}` }, select: { id: true } });
    await expect(getCanonicalCodOrderPosition(context as never, last.id)).rejects.toThrow(/requires exactly one positive delivered receivable/);
  });
});
