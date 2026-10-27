import { describe, expect, it } from "vitest";

import { forAll, forAllAsync, type SeededRandom } from "../../src/lib/__tests__/helpers/seeded-random";
import { resolveCheckoutPricing } from "./checkout-pricing";
import type { AllocationRow, StorefrontWorkerEnvironment } from "./types";
import { withMotherFeeFallback } from "./wilaya-fallback";
import { clampQuantity, feeFor, totals, type FeeTable, type Mode } from "./web/client/logic";

/**
 * Property tests for the storefront order total (area 10, money).
 *
 * The buyer's browser (web/client/logic.ts) shows a total; the Worker
 * (checkout-pricing.ts) charges one. They must agree for every cart, and the
 * charge must stay an exact integer number of dinars. Each property runs
 * generated cases from a fixed seed; a failure prints the seed and the case.
 */

const WILAYAS = Array.from({ length: 69 }, (_, index) => String(index + 1).padStart(2, "0"));
const MAX_PRICE = 1_000_000;
const MAX_QUANTITY = 1_000;
// checkout-input.ts rejects a line above 100 units; the page must never offer more.
const SERVER_MAX_LINE_QUANTITY = 100;

type Rule = { wilayaCode: string; mode: Mode; feeDzd: number };
type Line = { itemKey: string; quantity: number };
type Cart = {
  allocations: AllocationRow[];
  lines: Line[];
  rules: Rule[];
  wilaya: string;
  mode: Mode;
};

function fakeEnvironment(allocations: AllocationRow[], rules: Rule[]): StorefrontWorkerEnvironment {
  const database = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            all: async () => ({ results: sql.includes("storefront_allocation") ? allocations : [] }),
            first: async () => {
              const [, wilaya, mode] = args;
              const rule = rules.find((candidate) => candidate.wilayaCode === wilaya && candidate.mode === mode);
              return rule ? { fee_dzd: rule.feeDzd } : null;
            },
          };
        },
      };
    },
  };
  return { DB: database } as unknown as StorefrontWorkerEnvironment;
}

/** Same construction as the product page: web/shop/product.ts feeTable(), fed by withMotherFeeFallback(). */
function pageFeeTable(rules: Rule[]): FeeTable {
  const table: FeeTable = {};
  for (const rule of withMotherFeeFallback(rules.map((row) => ({ wilayaCode: row.wilayaCode, mode: row.mode, feeDzd: row.feeDzd })))) {
    const entry = table[rule.wilayaCode] ?? [null, null];
    entry[rule.mode === "home" ? 0 : 1] = rule.feeDzd;
    table[rule.wilayaCode] = entry;
  }
  return table;
}

function generateRules(rng: SeededRandom): Rule[] {
  const rules: Rule[] = [];
  for (const code of rng.shuffle(WILAYAS).slice(0, rng.int(2, 30))) {
    for (const mode of ["home", "desk"] as const) {
      if (rng.chance(0.7)) rules.push({ wilayaCode: code, mode, feeDzd: rng.chance(0.1) ? 0 : rng.int(1, 5_000) });
    }
  }
  return rules;
}

/** The rules with exactly one rule for (wilaya, mode): the Worker table has one row per pair. */
function withRule(rules: Rule[], wilayaCode: string, mode: Mode, feeDzd: number): Rule[] {
  return [...rules.filter((rule) => !(rule.wilayaCode === wilayaCode && rule.mode === mode)), { wilayaCode, mode, feeDzd }];
}

function generateCart(rng: SeededRandom, limits: { maxPrice: number; maxQuantity: number }): Cart {
  const count = rng.int(1, 6);
  const allocations: AllocationRow[] = [];
  const lines: Line[] = [];
  for (let index = 0; index < count; index += 1) {
    const quantity = rng.int(1, limits.maxQuantity);
    const itemKey = `item-${index}`;
    allocations.push({
      item_key: itemKey,
      unit_price_dzd: rng.int(0, limits.maxPrice),
      remaining_quantity: quantity + rng.int(0, 50),
    });
    lines.push({ itemKey, quantity });
  }
  return {
    allocations,
    lines,
    rules: generateRules(rng),
    // Bias towards the wilayas that have a mother-fee fallback (59..69).
    wilaya: rng.chance(0.4) ? rng.pick(WILAYAS.slice(58)) : rng.pick(WILAYAS),
    mode: rng.pick(["home", "desk"] as const),
  };
}

async function price(cart: Cart, lines: Line[] = cart.lines, allocations: AllocationRow[] = cart.allocations) {
  return resolveCheckoutPricing(fakeEnvironment(allocations, cart.rules), "release-1", lines, cart.wilaya, cart.mode);
}

describe("storefront total: browser and Worker agree", () => {
  it("charges exactly what the page shows: same fee, same subtotal, same total (400 carts)", async () => {
    const ran = await forAllAsync(
      "browser total equals Worker total",
      { seed: 0x5f10a1, runs: 400 },
      (rng) => generateCart(rng, { maxPrice: MAX_PRICE, maxQuantity: MAX_QUANTITY }),
      async (cart) => {
        const shownFee = feeFor(pageFeeTable(cart.rules), cart.wilaya, cart.mode);
        const result = await price(cart);
        if (shownFee === null) {
          expect(result).toEqual({ ok: false, error: "delivery_unavailable" });
          return;
        }
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        let shownSubtotal = 0;
        for (const line of cart.lines) {
          const allocation = cart.allocations.find((row) => row.item_key === line.itemKey);
          if (!allocation) throw new Error("generator produced a line without an allocation");
          shownSubtotal += totals(allocation.unit_price_dzd, line.quantity, null).subtotal;
        }
        expect(result.pricing.shippingDzd).toBe(shownFee);
        expect(result.pricing.subtotalDzd).toBe(shownSubtotal);
        expect(result.pricing.totalDzd).toBe(shownSubtotal + shownFee);
        for (const amount of [result.pricing.subtotalDzd, result.pricing.shippingDzd, result.pricing.totalDzd]) {
          expect(Number.isSafeInteger(amount)).toBe(true);
          expect(amount).toBeGreaterThanOrEqual(0);
        }
      },
    );
    expect(ran).toBe(400);
  });

  it("does not depend on line order, and one line split in two with the same unit price costs the same", async () => {
    const ran = await forAllAsync(
      "worker total ignores line order and line splits",
      { seed: 0x5f10a2, runs: 300 },
      (rng) => {
        const cart = generateCart(rng, { maxPrice: MAX_PRICE, maxQuantity: MAX_QUANTITY });
        // Make the wilaya priceable so the comparison is about amounts, not about delivery.
        cart.rules = withRule(cart.rules, cart.wilaya, cart.mode, rng.int(0, 5_000));
        const widest = cart.lines.reduce((best, line) => (line.quantity > best.quantity ? line : best));
        if (widest.quantity < 2) {
          widest.quantity = 2;
          const row = cart.allocations.find((candidate) => candidate.item_key === widest.itemKey);
          if (row) row.remaining_quantity = Math.max(row.remaining_quantity, 2);
        }
        return { cart, shuffled: rng.shuffle(cart.lines), splitKey: widest.itemKey, cut: rng.int(1, widest.quantity - 1) };
      },
      async ({ cart, shuffled, splitKey, cut }) => {
        const base = await price(cart);
        const reordered = await price(cart, shuffled);
        expect(base.ok).toBe(true);
        expect(reordered).toMatchObject({ ok: true, pricing: { subtotalDzd: base.ok ? base.pricing.subtotalDzd : -1, totalDzd: base.ok ? base.pricing.totalDzd : -1 } });

        const original = cart.lines.find((line) => line.itemKey === splitKey);
        const allocation = cart.allocations.find((row) => row.item_key === splitKey);
        if (!original || !allocation) throw new Error("generator lost the widest line");
        const twin: AllocationRow = { ...allocation, item_key: `${splitKey}-twin` };
        const split = await price(
          cart,
          [...cart.lines.filter((line) => line.itemKey !== splitKey), { itemKey: splitKey, quantity: cut }, { itemKey: twin.item_key, quantity: original.quantity - cut }],
          [...cart.allocations, twin],
        );
        expect(split).toMatchObject({ ok: true, pricing: { subtotalDzd: base.ok ? base.pricing.subtotalDzd : -1, totalDzd: base.ok ? base.pricing.totalDzd : -1 } });
      },
    );
    expect(ran).toBe(300);
  });

  it("answers exactly when the true total fits in a safe integer (BigInt oracle, 400 huge carts)", async () => {
    let fitted = 0;
    let overflowed = 0;
    const ran = await forAllAsync(
      "overflow guard matches exact arithmetic",
      { seed: 0x5f10a3, runs: 400 },
      (rng) => {
        const cart = generateCart(rng, { maxPrice: 2 ** 40, maxQuantity: 2 ** 14 });
        return { ...cart, rules: withRule(cart.rules, cart.wilaya, cart.mode, rng.int(0, 5_000)) };
      },
      async (cart) => {
        const fee = feeFor(pageFeeTable(cart.rules), cart.wilaya, cart.mode);
        const result = await price(cart);
        if (fee === null) throw new Error("generator left the wilaya without a fee");
        let exact = BigInt(fee);
        for (const line of cart.lines) {
          const allocation = cart.allocations.find((row) => row.item_key === line.itemKey);
          if (!allocation) throw new Error("generator produced a line without an allocation");
          exact += BigInt(allocation.unit_price_dzd) * BigInt(line.quantity);
        }
        if (exact <= BigInt(Number.MAX_SAFE_INTEGER)) {
          fitted += 1;
          expect(result.ok).toBe(true);
          if (result.ok) expect(BigInt(result.pricing.totalDzd)).toBe(exact);
        } else {
          overflowed += 1;
          expect(result).toEqual({ ok: false, error: "amount_overflow" });
        }
      },
    );
    expect(ran).toBe(400);
    // Both sides of the boundary must have been exercised, or the property proves nothing.
    expect(fitted).toBeGreaterThan(40);
    expect(overflowed).toBeGreaterThan(40);
  });

  it("refuses the first line that asks for more than is left, and names it", async () => {
    const ran = await forAllAsync(
      "stock shortage is named and nothing is priced",
      { seed: 0x5f10a4, runs: 300 },
      (rng) => {
        const cart = generateCart(rng, { maxPrice: MAX_PRICE, maxQuantity: 100 });
        const short = rng.shuffle(cart.allocations.map((_, index) => index)).slice(0, rng.int(1, cart.allocations.length));
        for (const index of short) {
          const line = cart.lines[index];
          if (line) cart.allocations[index] = { item_key: line.itemKey, unit_price_dzd: cart.allocations[index]?.unit_price_dzd ?? 0, remaining_quantity: rng.int(0, line.quantity - 1) };
        }
        return cart;
      },
      async (cart) => {
        const firstShort = cart.lines.find((line) => (cart.allocations.find((row) => row.item_key === line.itemKey)?.remaining_quantity ?? 0) < line.quantity);
        expect(firstShort).toBeDefined();
        expect(await price(cart)).toEqual({ ok: false, error: "allocation_unavailable", itemKey: firstShort?.itemKey });
      },
    );
    expect(ran).toBe(300);
  });
});

describe("storefront browser arithmetic", () => {
  it("keeps dinars whole and exact for prices up to 1,000,000 and quantities up to 1,000 (500 cases)", () => {
    const ran = forAll(
      "totals() stays an exact integer",
      { seed: 0x5f10b1, runs: 500 },
      (rng) => ({ unit: rng.int(0, MAX_PRICE), quantity: rng.int(1, MAX_QUANTITY), fee: rng.chance(0.15) ? null : rng.int(0, 10_000) }),
      ({ unit, quantity, fee }) => {
        const result = totals(unit, quantity, fee);
        expect(result.subtotal).toBe(Number(BigInt(unit) * BigInt(quantity)));
        expect(Number.isSafeInteger(result.total)).toBe(true);
        expect(result.total).toBe(result.subtotal + (fee ?? 0));
        expect(result.shipping).toBe(fee);
        expect(result.total).toBeGreaterThanOrEqual(result.subtotal);
      },
    );
    expect(ran).toBe(500);
  });

  it("is additive in quantity: two lines of one unit price cost what one merged line costs", () => {
    const ran = forAll(
      "totals() splits cleanly",
      { seed: 0x5f10b2, runs: 400 },
      (rng) => ({ unit: rng.int(0, MAX_PRICE), first: rng.int(1, 500), second: rng.int(1, 500), fee: rng.int(0, 10_000) }),
      ({ unit, first, second, fee }) => {
        const merged = totals(unit, first + second, fee).subtotal;
        expect(totals(unit, first, null).subtotal + totals(unit, second, null).subtotal).toBe(merged);
      },
    );
    expect(ran).toBe(400);
  });

  it("never offers a quantity the Worker would reject or the page cannot cover", () => {
    const ran = forAll(
      "clampQuantity stays inside its bounds",
      { seed: 0x5f10b3, runs: 600 },
      (rng) => ({
        wanted: rng.chance(0.05) ? Number.NaN : rng.int(-50, 5_000) + (rng.chance(0.3) ? rng.next() : 0),
        remaining: rng.int(0, 2_000),
        hardMax: rng.chance(0.7) ? 50 : rng.int(1, 100),
      }),
      ({ wanted, remaining, hardMax }) => {
        const quantity = clampQuantity(wanted, remaining, hardMax);
        expect(Number.isInteger(quantity)).toBe(true);
        expect(quantity).toBeGreaterThanOrEqual(1);
        expect(quantity).toBeLessThanOrEqual(SERVER_MAX_LINE_QUANTITY);
        expect(quantity).toBeLessThanOrEqual(hardMax);
        // A sold-out product still shows 1 (pinned by logic.test.ts); otherwise never above what is left.
        if (remaining >= 1) expect(quantity).toBeLessThanOrEqual(remaining);
        expect(clampQuantity(quantity, remaining, hardMax)).toBe(quantity);
        // More wanted never gives fewer.
        if (Number.isFinite(wanted)) expect(clampQuantity(wanted + 1, remaining, hardMax)).toBeGreaterThanOrEqual(quantity);
      },
    );
    expect(ran).toBe(600);
  });
});
