import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BENCH_QUERIES,
  formatBenchTable,
  formatMs,
  medianOf,
  p95Of,
  type BenchLine,
} from "./list-search-bench-format";

const line = (over: Partial<BenchLine>): BenchLine => ({
  suite: "customers",
  query: "name",
  customers: 10000,
  orders: 20000,
  median: 41.2,
  p95: 45.6,
  queries: 9,
  hits: 3,
  runs: 15,
  ...over,
});

describe("list search bench: pure helpers", () => {
  it("median takes the middle sample, or the mean of the two middle ones", () => {
    expect(medianOf([9, 1, 5])).toBe(5);
    expect(medianOf([4, 1, 3, 2])).toBe(2.5);
    expect(medianOf([])).toBe(0);
  });

  it("p95 is the nearest rank: the slowest of 15 runs, the 19th of 20", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => i + 1);
    expect(p95Of(fifteen)).toBe(15);
    const twenty = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(p95Of(twenty)).toBe(19);
    expect(p95Of([7])).toBe(7);
    expect(p95Of([])).toBe(0);
  });

  it("prints whole milliseconds from 10 up and one decimal below", () => {
    expect(formatMs(41.2)).toBe("41");
    expect(formatMs(9.96)).toBe("10.0");
    expect(formatMs(4.46)).toBe("4.5");
    expect(formatMs(10)).toBe("10");
  });

  it("formats one block per size, one row per suite, queries in the fixed order", () => {
    const lines: BenchLine[] = [
      line({ suite: "orders.page", query: "none", median: 128.4, p95: 150, queries: 14, hits: 0 }),
      line({ suite: "customers", query: "part", median: 62, p95: 94, queries: 9, hits: 50 }),
      line({ suite: "customers", query: "name" }),
      line({ suite: "customers", customers: 1000, orders: 2000, median: 4.04, p95: 6, queries: 5, hits: 1 }),
    ];
    const table = formatBenchTable(lines).split("\n");
    expect(table[0]).toBe("N=10000 customers / 20000 orders (median/p95 ms, q = Prisma queries, h = rows returned)");
    expect(table[1]).toBe("suite        name         part          +213  sp  ord  none");
    expect(table[2]).toBe("customers    41/46 q9 h3  62/94 q9 h50  -     -   -    -");
    expect(table[3]).toBe("orders.page  -            -             -     -   -    128/150 q14 h0");
    expect(table[4]).toBe("");
    expect(table[5]).toBe("N=1000 customers / 2000 orders (median/p95 ms, q = Prisma queries, h = rows returned)");
    expect(table[6]).toBe("suite      name           part  +213  sp  ord  none");
    expect(table[7]).toBe("customers  4.0/6.0 q5 h1  -     -     -   -    -");
  });

  it("keeps the six queries of the 24 Oct bench", () => {
    expect(BENCH_QUERIES.map(([label]) => label)).toEqual(["name", "part", "+213", "sp", "ord", "none"]);
    expect(BENCH_QUERIES.map(([, text]) => text)).toEqual([
      "أحمد بن علي",
      "احمد",
      "+213 655 12 34 56",
      "0655 12 34 56",
      "ORD-2026-0012",
      "خخخطط",
    ]);
  });

  it("the manual bench file is skipped unless SF_BENCH is set and re-exports the formatter", () => {
    const source = readFileSync(resolve(__dirname, "list-search-bench.manual.test.ts"), "utf8");
    expect(source).toContain("describe.skipIf(!process.env.SF_BENCH)");
    expect(source).toContain("export { formatBenchTable }");
  });
});
