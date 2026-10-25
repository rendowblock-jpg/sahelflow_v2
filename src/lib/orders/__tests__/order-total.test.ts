import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAX_MONEY_DZD,
  assertOrderTotalWithinLimit,
} from "@/lib/orders/money-limits";
import { lineTotalOf, orderTotalOf, sumLineTotals } from "../order-total";

interface Line {
  unitPrice: number;
  quantity: number;
}

/** Tiny seeded generator so a failing cart can be replayed from its seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact reference: BigInt cannot lose precision, so it is the oracle. */
function referenceTotal(lines: readonly Line[], deliveryCost: number): bigint {
  let sum = BigInt(deliveryCost);
  for (const line of lines) sum += BigInt(line.unitPrice) * BigInt(line.quantity);
  return sum;
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

describe("lineTotalOf", () => {
  it.each([
    [0, 0, 0],
    [0, 7, 0],
    [2500, 0, 0],
    [2500, 1, 2500],
    [2500, 3, 7500],
    [MAX_MONEY_DZD, 1, MAX_MONEY_DZD],
    [1, 100_000, 100_000],
  ])("unit price %d x quantity %d = %d", (unitPrice, quantity, expected) => {
    expect(lineTotalOf(unitPrice, quantity)).toBe(expected);
  });
});

describe("orderTotalOf (table)", () => {
  it.each<{ name: string; lines: Line[]; delivery: number | null | undefined; items: number; total: number }>([
    { name: "no lines, no delivery", lines: [], delivery: 0, items: 0, total: 0 },
    { name: "no lines, delivery only", lines: [], delivery: 600, items: 0, total: 600 },
    { name: "one line", lines: [{ unitPrice: 2500, quantity: 3 }], delivery: 600, items: 7500, total: 8100 },
    { name: "zero unit price", lines: [{ unitPrice: 0, quantity: 5 }], delivery: 450, items: 0, total: 450 },
    {
      name: "two lines",
      lines: [
        { unitPrice: 1200, quantity: 2 },
        { unitPrice: 990, quantity: 1 },
      ],
      delivery: 500,
      items: 3390,
      total: 3890,
    },
    { name: "large quantity", lines: [{ unitPrice: 9_999, quantity: 100_000 }], delivery: 0, items: 999_900_000, total: 999_900_000 },
    // The lines edit reads order.deliveryCost, which is null for old rows.
    { name: "null delivery counts as 0", lines: [{ unitPrice: 100, quantity: 2 }], delivery: null, items: 200, total: 200 },
    { name: "undefined delivery counts as 0", lines: [{ unitPrice: 100, quantity: 2 }], delivery: undefined, items: 200, total: 200 },
  ])("$name", ({ lines, delivery, items, total }) => {
    expect(orderTotalOf(lines, delivery)).toEqual({ itemsTotal: items, totalPrice: total });
    expect(sumLineTotals(lines)).toBe(items);
  });

  it("does not modify the lines it is given", () => {
    const lines = Object.freeze([
      Object.freeze({ unitPrice: 10, quantity: 2 }),
      Object.freeze({ unitPrice: 5, quantity: 1 }),
    ]);
    expect(orderTotalOf(lines, 7).totalPrice).toBe(32);
  });

  it("accepts rows that carry more fields than the arithmetic needs", () => {
    const rows = [{ id: "a", productName: "x", unitPrice: 40, quantity: 2, total: 80 }];
    expect(orderTotalOf(rows, 0).itemsTotal).toBe(80);
  });
});

describe("orderTotalOf (properties)", () => {
  const lines: Line[] = [
    { unitPrice: 1500, quantity: 2 },
    { unitPrice: 320, quantity: 7 },
    { unitPrice: 0, quantity: 4 },
    { unitPrice: 89_000, quantity: 1 },
  ];

  it("gives the same total in every order of the lines", () => {
    const next = mulberry32(27);
    const expected = orderTotalOf(lines, 600);
    for (let i = 0; i < 50; i += 1) {
      expect(orderTotalOf(shuffled(lines, next), 600)).toEqual(expected);
    }
  });

  it("splitting a line in two with the same unit price keeps the total", () => {
    const whole = orderTotalOf([{ unitPrice: 1750, quantity: 9 }], 400);
    for (let first = 0; first <= 9; first += 1) {
      const split = orderTotalOf(
        [
          { unitPrice: 1750, quantity: first },
          { unitPrice: 1750, quantity: 9 - first },
        ],
        400,
      );
      expect(split).toEqual(whole);
    }
  });

  it("delivery cost moves totalPrice but never itemsTotal", () => {
    const a = orderTotalOf(lines, 0);
    const b = orderTotalOf(lines, 800);
    expect(b.itemsTotal).toBe(a.itemsTotal);
    expect(b.totalPrice - a.totalPrice).toBe(800);
  });

  it("matches an exact BigInt sum on 300 random carts", () => {
    const next = mulberry32(0x5afe10);
    for (let cart = 0; cart < 300; cart += 1) {
      const count = Math.floor(next() * 9);
      const random: Line[] = [];
      for (let i = 0; i < count; i += 1) {
        random.push({
          unitPrice: Math.floor(next() * (MAX_MONEY_DZD + 1)),
          quantity: 1 + Math.floor(next() * 999),
        });
      }
      const delivery = Math.floor(next() * (MAX_MONEY_DZD + 1));
      const result = orderTotalOf(random, delivery);
      const expected = referenceTotal(random, delivery);
      expect(BigInt(result.totalPrice), `cart ${cart}`).toBe(expected);
      expect(Number.isSafeInteger(result.totalPrice)).toBe(true);
    }
  });
});

describe("orderTotalOf with the shared ceiling", () => {
  const tooLarge = { code: "VALIDATION_ERROR", statusCode: 400, message: "The order total is too large" };

  it("a total of exactly MAX_MONEY_DZD is accepted, one dinar more is refused", () => {
    const atCeiling = orderTotalOf([{ unitPrice: MAX_MONEY_DZD - 600, quantity: 1 }], 600);
    expect(atCeiling.totalPrice).toBe(MAX_MONEY_DZD);
    expect(() => assertOrderTotalWithinLimit(atCeiling.totalPrice, "items")).not.toThrow();

    const over = orderTotalOf([{ unitPrice: MAX_MONEY_DZD - 600, quantity: 1 }], 601);
    expect(over.totalPrice).toBe(MAX_MONEY_DZD + 1);
    expect(() => assertOrderTotalWithinLimit(over.totalPrice, "items")).toThrow(
      expect.objectContaining(tooLarge),
    );
  });

  it("many small lines that add up past the ceiling are refused", () => {
    const lines: Line[] = Array.from({ length: 11 }, () => ({ unitPrice: 100_000_000, quantity: 1 }));
    const { totalPrice } = orderTotalOf(lines, 0);
    expect(totalPrice).toBe(1_100_000_000);
    expect(() => assertOrderTotalWithinLimit(totalPrice, "lines")).toThrow(
      expect.objectContaining({ ...tooLarge, field: "lines" }),
    );
  });

  it("a total that left the safe integer range is still refused by the caller's check", () => {
    // 999 999 999 x 10 000 000 is about 1e16, above Number.MAX_SAFE_INTEGER.
    const { totalPrice } = orderTotalOf([{ unitPrice: MAX_MONEY_DZD, quantity: 10_000_000 }], 0);
    expect(Number.isSafeInteger(totalPrice)).toBe(false);
    expect(() => assertOrderTotalWithinLimit(totalPrice, "items")).toThrow(
      expect.objectContaining(tooLarge),
    );
  });
});

// Source contract: the sum lives in order-total.ts only. A new inline copy in
// a transaction would be untestable and could drift from the other callers.
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const SWITCHED_CALLERS = [
  "src/lib/orders/manual-order.ts",
  "src/lib/orders/canonical-source-order.ts",
  "src/lib/orders/manual-order-lines-edit.ts",
  "src/lib/orders/canonical-customer-return.ts",
  "src/lib/data/order-service.ts",
];

function codeOf(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("order total source contract", () => {
  it.each(SWITCHED_CALLERS)("%s uses the shared order-total functions", (file) => {
    const code = codeOf(file);
    expect(code).toMatch(/from "@\/lib\/orders\/order-total"/);
    expect(code).toMatch(/\b(orderTotalOf|lineTotalOf|sumLineTotals)\(/);
  });

  it.each(SWITCHED_CALLERS)("%s has no inline unitPrice x quantity arithmetic", (file) => {
    const code = codeOf(file);
    expect(code).not.toMatch(/unitPrice\s*\*\s*[\w.]*quantity/);
    expect(code).not.toMatch(/quantity\s*\*\s*[\w.]*unitPrice/);
  });
});
