import { describe, expect, it } from "vitest";

import { deductOrderItemStock, restoreOrderItemStock, type StockTransitionItem } from "@/lib/data/product-stock-model";
import type { OrderChangeTransactionClient } from "@/lib/data/order-change-service";
import { ConflictError } from "@/types/errors";

import { forAll, forAllAsync, type SeededRandom } from "../../__tests__/helpers/seeded-random";
import { availableForManualConfirm, holdAlreadyLoweredStock, stockHeldAgainstOnHand, type ActiveStockHold } from "../stock-availability";

/**
 * Property tests for stock (area 10).
 *
 * Part 1: how many units a manual confirmation may still take (pure).
 * Part 2: the stock transitions an order makes (deduct on confirmation,
 * restore on cancel or return), run against an in-memory copy of the three
 * tables they touch, so the real product-stock-model code runs without a
 * database. A rejected deduct rolls the whole transaction back in production;
 * the fake restores its copy to mimic that.
 */

// ---- Part 1: availability for a manual confirmation --------------------------------------------------------------

function generateHold(rng: SeededRandom): ActiveStockHold {
  const kind = rng.int(0, 3);
  const reservationKey =
    kind === 0
      ? `0b8f6a52-4f0e-4c53-9d3e-1f6a2f6f7a10:reserve:item-${rng.int(1, 9)}`
      : kind === 1
        ? `storefront-delegation:release_abcdefgh:product-${rng.int(1, 9)}`
        : kind === 2
          ? `storefront-provisional:release_abcdefgh:product-${rng.int(1, 9)}`
          : `legacy-hold-${rng.int(1, 999)}`;
  return { reservationKey, quantity: rng.int(0, 60), reserveMovementRecorded: rng.chance(0.6) };
}

function generateAvailabilityCase(rng: SeededRandom) {
  return {
    onHand: rng.int(0, 400),
    holds: Array.from({ length: rng.int(0, 8) }, () => generateHold(rng)),
    extra: generateHold(rng),
    order: rng.int(1, 1_000_000),
  };
}

describe("units a manual confirmation may take", () => {
  it("is never negative and never more than is on the shelf (500 cases)", () => {
    const ran = forAll("availability bounds", { seed: 0x57c001, runs: 500 }, generateAvailabilityCase, ({ onHand, holds }) => {
      const available = availableForManualConfirm({ onHand, activeHolds: holds });
      expect(Number.isInteger(available)).toBe(true);
      expect(available).toBeGreaterThanOrEqual(0);
      expect(available).toBeLessThanOrEqual(onHand);
    });
    expect(ran).toBe(500);
  });

  it("does not depend on the order of the holds", () => {
    const ran = forAll("availability ignores hold order", { seed: 0x57c002, runs: 300 }, generateAvailabilityCase, ({ onHand, holds }, rng) => {
      const shuffled = rng.shuffle(holds);
      expect(stockHeldAgainstOnHand(shuffled)).toBe(stockHeldAgainstOnHand(holds));
      expect(availableForManualConfirm({ onHand, activeHolds: shuffled })).toBe(availableForManualConfirm({ onHand, activeHolds: holds }));
    });
    expect(ran).toBe(300);
  });

  it("a new hold never raises availability; it lowers it by exactly its size unless it already lowered the shelf; releasing it restores the old figure", () => {
    const ran = forAll("hold then release is a no-op", { seed: 0x57c003, runs: 400 }, generateAvailabilityCase, ({ onHand, holds, extra }) => {
      const before = availableForManualConfirm({ onHand, activeHolds: holds });
      const heldBefore = stockHeldAgainstOnHand(holds);
      const withHold = [...holds, extra];
      const after = availableForManualConfirm({ onHand, activeHolds: withHold });
      expect(after).toBeLessThanOrEqual(before);
      const counted = holdAlreadyLoweredStock(extra) ? 0 : extra.quantity;
      expect(stockHeldAgainstOnHand(withHold)).toBe(heldBefore + counted);
      if (counted === 0) expect(after).toBe(before);
      // Release: the hold leaves the active list.
      const released = withHold.filter((hold) => hold !== extra);
      expect(availableForManualConfirm({ onHand, activeHolds: released })).toBe(before);
    });
    expect(ran).toBe(400);
  });

  it("counts every storefront hold in full, even one that claims a reserve movement (stricter, never looser)", () => {
    const ran = forAll(
      "storefront holds are never discounted",
      { seed: 0x57c004, runs: 300 },
      (rng) => ({ quantity: rng.int(1, 60), prefix: rng.pick(["storefront-delegation:", "storefront-provisional:"]), recorded: rng.chance(0.5), tail: rng.int(1, 9999) }),
      ({ quantity, prefix, recorded, tail }) => {
        const hold: ActiveStockHold = { reservationKey: `${prefix}rel_${tail}:p`, quantity, reserveMovementRecorded: recorded };
        expect(holdAlreadyLoweredStock(hold)).toBe(false);
        expect(stockHeldAgainstOnHand([hold])).toBe(quantity);
      },
    );
    expect(ran).toBe(300);
  });

  it("more on the shelf never means fewer available, and one more unit adds at most one", () => {
    const ran = forAll("availability is monotone in on-hand", { seed: 0x57c005, runs: 300 }, generateAvailabilityCase, ({ onHand, holds }) => {
      const now = availableForManualConfirm({ onHand, activeHolds: holds });
      const next = availableForManualConfirm({ onHand: onHand + 1, activeHolds: holds });
      expect(next - now).toBeGreaterThanOrEqual(0);
      expect(next - now).toBeLessThanOrEqual(1);
    });
    expect(ran).toBe(300);
  });

  it("refuses quantities that are not whole non-negative safe integers instead of guessing", () => {
    const ran = forAll(
      "unsupported quantities are refused",
      { seed: 0x57c006, runs: 300 },
      (rng) => ({
        bad: rng.pick([-1, -7, 0.5, 2.25, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]),
        onHand: rng.int(0, 100),
        at: rng.int(0, 3),
      }),
      ({ bad, onHand, at }) => {
        const holds: ActiveStockHold[] = Array.from({ length: 4 }, (_, index) => ({
          reservationKey: `cmd-${index}:reserve:item`,
          quantity: index === at ? bad : 1,
          reserveMovementRecorded: false,
        }));
        expect(() => availableForManualConfirm({ onHand, activeHolds: holds })).toThrow(ConflictError);
        if (Number.isSafeInteger(bad)) {
          // A negative shelf count is a whole number: nothing can be taken, and nothing is invented.
          expect(availableForManualConfirm({ onHand: bad, activeHolds: [] })).toBe(0);
        } else {
          expect(() => availableForManualConfirm({ onHand: bad, activeHolds: [] })).toThrow(ConflictError);
        }
      },
    );
    expect(ran).toBe(300);
  });
});

// ---- Part 2: order stock transitions on an in-memory copy of the tables ------------------------------------------

interface VariantRow {
  id: string;
  stock: number;
  isActive: boolean;
}
interface ProductRow {
  id: string;
  stock: number;
  isActive: boolean;
  deletedAt: Date | null;
  variants: VariantRow[];
}
type World = Map<string, ProductRow>;

function cloneWorld(world: World): World {
  return new Map([...world.entries()].map(([id, row]) => [id, { ...row, variants: row.variants.map((variant) => ({ ...variant })) }]));
}

function snapshot(world: World): string {
  return JSON.stringify(
    [...world.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((row) => [row.id, row.stock, row.isActive, row.variants.map((variant) => [variant.id, variant.stock, variant.isActive])]),
  );
}

function activeSum(row: ProductRow): number {
  return row.variants.filter((variant) => variant.isActive).reduce((sum, variant) => sum + variant.stock, 0);
}

interface VariantWhere {
  id: string;
  productId: string;
  isActive?: boolean;
  stock?: { gte: number };
}

function fakeTransaction(world: World): OrderChangeTransactionClient {
  const get = (id: string): ProductRow => {
    const row = world.get(id);
    if (!row) throw new Error(`no product ${id}`);
    return row;
  };
  const client = {
    product: {
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const row = get(args.where.id);
        return { stock: row.stock, isActive: row.isActive, deletedAt: row.deletedAt };
      },
      update: async (args: { where: { id: string }; data: { stock: number } }) => {
        get(args.where.id).stock = args.data.stock;
        return {};
      },
    },
    productVariant: {
      aggregate: async (args: { where: { productId: string; isActive: boolean } }) => {
        const rows = get(args.where.productId).variants.filter((variant) => variant.isActive === args.where.isActive);
        return { _sum: { stock: rows.length === 0 ? null : rows.reduce((sum, variant) => sum + variant.stock, 0) } };
      },
      updateMany: async (args: { where: VariantWhere; data: { stock: { decrement: number } | { increment: number } } }) => {
        const variant = get(args.where.productId).variants.find((row) => row.id === args.where.id);
        const { isActive, stock } = args.where;
        if (!variant || (isActive !== undefined && variant.isActive !== isActive) || (stock !== undefined && variant.stock < stock.gte)) return { count: 0 };
        variant.stock += "decrement" in args.data.stock ? -args.data.stock.decrement : args.data.stock.increment;
        return { count: 1 };
      },
    },
  };
  return client as unknown as OrderChangeTransactionClient;
}

function generateWorld(rng: SeededRandom): World {
  const world: World = new Map();
  for (let index = 0; index < rng.int(1, 3); index += 1) {
    const variants: VariantRow[] = Array.from({ length: rng.int(0, 4) }, (_, at) => ({
      id: `p${index}-v${at}`,
      stock: rng.int(0, 60),
      isActive: rng.chance(0.85),
    }));
    const row: ProductRow = { id: `p${index}`, stock: 0, isActive: rng.chance(0.95), deletedAt: rng.chance(0.05) ? new Date(0) : null, variants };
    // Product.stock is the mixed counter: active variant stock plus the variantless remainder.
    row.stock = activeSum(row) + rng.int(0, 60);
    world.set(row.id, row);
  }
  return world;
}

function generateItems(rng: SeededRandom, world: World, quantityMax = 40, activeOnly = true): StockTransitionItem[] {
  const items: StockTransitionItem[] = [];
  for (let at = 0; at < rng.int(1, 7); at += 1) {
    const product = rng.pick([...world.values()]);
    const pool = product.variants.filter((variant) => !activeOnly || variant.isActive);
    const useVariant = pool.length > 0 && rng.chance(0.6);
    items.push({ productId: product.id, productVariantId: useVariant ? rng.pick(pool).id : null, quantity: rng.int(1, quantityMax) });
  }
  return items;
}

/** What the guarded deduct must accept: every variant and the variantless remainder cover what is asked. */
function deductIsFeasible(world: World, items: StockTransitionItem[]): boolean {
  for (const row of world.values()) {
    const mine = items.filter((item) => item.productId === row.id);
    if (mine.length === 0) continue;
    const variantless = mine.filter((item) => item.productVariantId === null).reduce((sum, item) => sum + item.quantity, 0);
    if (variantless > 0 && (!row.isActive || row.deletedAt !== null)) return false;
    if (variantless > row.stock - activeSum(row)) return false;
    for (const variant of row.variants) {
      const asked = mine.filter((item) => item.productVariantId === variant.id).reduce((sum, item) => sum + item.quantity, 0);
      if (asked > 0 && (!variant.isActive || asked > variant.stock)) return false;
    }
  }
  return true;
}

async function tryDeduct(world: World, items: StockTransitionItem[], requireAvailability = true): Promise<boolean> {
  const backup = cloneWorld(world);
  try {
    await deductOrderItemStock(fakeTransaction(world), items, { requireAvailability });
    return true;
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    // The real transaction rolls back.
    world.clear();
    for (const [id, row] of backup) world.set(id, row);
    return false;
  }
}

describe("order stock transitions", () => {
  it("the guarded deduct accepts exactly what the shelf covers, and nothing goes negative (400 cases)", async () => {
    const ran = await forAllAsync(
      "deduct is feasible-iff and never negative",
      { seed: 0x57c101, runs: 400 },
      (rng) => {
        const world = generateWorld(rng);
        return { world, items: generateItems(rng, world, 70) };
      },
      async ({ world, items }) => {
        const expected = deductIsFeasible(world, items);
        const before = cloneWorld(world);
        const accepted = await tryDeduct(world, items);
        expect(accepted).toBe(expected);
        if (!accepted) {
          expect(snapshot(world)).toBe(snapshot(before));
          return;
        }
        for (const row of world.values()) {
          expect(row.stock).toBeGreaterThanOrEqual(0);
          for (const variant of row.variants) expect(variant.stock).toBeGreaterThanOrEqual(0);
          // Exactly the asked units left the shelf.
          const asked = items.filter((item) => item.productId === row.id).reduce((sum, item) => sum + item.quantity, 0);
          expect(row.stock).toBe((before.get(row.id)?.stock ?? NaN) - asked);
        }
      },
    );
    expect(ran).toBe(400);
  });

  it("reserve then release is a no-op, in either order (cancel and return give back exactly what was taken)", async () => {
    const ran = await forAllAsync(
      "deduct then restore returns to the start",
      { seed: 0x57c102, runs: 400 },
      (rng) => {
        const world = generateWorld(rng);
        return { world, items: generateItems(rng, world, 30) };
      },
      async ({ world, items }) => {
        const start = snapshot(world);
        const restored = cloneWorld(world);
        if (await tryDeduct(world, items)) {
          await restoreOrderItemStock(fakeTransaction(world), items);
          expect(snapshot(world)).toBe(start);
        }
        // Restoring first and deducting after lands back on the start. The guarded deduct still refuses a variantless
        // line on an inactive or deleted product, so that one case is left to the feasibility rule.
        await restoreOrderItemStock(fakeTransaction(restored), items);
        const feasible = deductIsFeasible(restored, items);
        const sellable = items.every((item) => {
          const row = restored.get(item.productId ?? "");
          return item.productVariantId !== null || (row !== undefined && row.isActive && row.deletedAt === null);
        });
        expect(feasible || !sellable).toBe(true);
        expect(await tryDeduct(restored, items)).toBe(feasible);
        if (feasible) expect(snapshot(restored)).toBe(start);
      },
    );
    expect(ran).toBe(400);
  });

  it("the unguarded deduct (refund-reversal compensation) may go below zero by design, and restore still undoes it exactly", async () => {
    let wentNegative = 0;
    const ran = await forAllAsync(
      "unguarded deduct then restore returns to the start",
      { seed: 0x57c103, runs: 400 },
      (rng) => {
        const world = generateWorld(rng);
        return { world, items: generateItems(rng, world, 200, false) };
      },
      async ({ world, items }) => {
        const start = snapshot(world);
        expect(await tryDeduct(world, items, false)).toBe(true);
        if ([...world.values()].some((row) => row.stock < 0 || row.variants.some((variant) => variant.stock < 0))) wentNegative += 1;
        await restoreOrderItemStock(fakeTransaction(world), items);
        expect(snapshot(world)).toBe(start);
      },
    );
    expect(ran).toBe(400);
    expect(wentNegative).toBeGreaterThan(20);
  });

  it("the result does not depend on the order of the order's lines, nor on splitting a line in two", async () => {
    const ran = await forAllAsync(
      "stock transitions ignore line order and splits",
      { seed: 0x57c104, runs: 400 },
      (rng) => {
        const world = generateWorld(rng);
        const items = generateItems(rng, world, 30);
        const cutAt = rng.int(0, items.length - 1);
        const target = items[cutAt];
        const first = target ? rng.int(0, target.quantity) : 0;
        return { world, items, shuffled: rng.shuffle(items), cutAt, first };
      },
      async ({ world, items, shuffled, cutAt, first }) => {
        const target = items[cutAt];
        const parts = target ? [{ ...target, quantity: first }, { ...target, quantity: target.quantity - first }] : [];
        const split = [...items.slice(0, cutAt), ...parts, ...items.slice(cutAt + 1)].filter((item) => item.quantity > 0);
        const outcomes: string[] = [];
        for (const variant of [items, shuffled, split]) {
          const copy = cloneWorld(world);
          const accepted = await tryDeduct(copy, variant);
          if (accepted) await restoreOrderItemStock(fakeTransaction(copy), variant.slice().reverse());
          outcomes.push(`${accepted}|${snapshot(copy)}`);
          const bare = cloneWorld(world);
          const guarded = await tryDeduct(bare, variant);
          outcomes.push(`deduct:${guarded}|${snapshot(bare)}`);
        }
        // Every pair (round trip, deduct) must match across the three arrangements.
        expect(outcomes[2]).toBe(outcomes[0]);
        expect(outcomes[4]).toBe(outcomes[0]);
        expect(outcomes[3]).toBe(outcomes[1]);
        expect(outcomes[5]).toBe(outcomes[1]);
      },
    );
    expect(ran).toBe(400);
  });

  it("any run of confirmations, cancellations and returns keeps stock equal to the start plus the movements, and never negative", async () => {
    const ran = await forAllAsync(
      "movements reconcile with on-hand",
      { seed: 0x57c105, runs: 300 },
      (rng) => {
        const world = generateWorld(rng);
        const steps = Array.from({ length: rng.int(5, 25) }, () => ({ restore: rng.chance(0.4), items: generateItems(rng, world, 25) }));
        return { world, steps };
      },
      async ({ world, steps }) => {
        const start = cloneWorld(world);
        // Net movement per variant and per product's variantless remainder, as a ledger would hold it.
        const ledger = new Map<string, number>();
        const bump = (key: string, delta: number) => ledger.set(key, (ledger.get(key) ?? 0) + delta);
        for (const step of steps) {
          if (step.restore) {
            await restoreOrderItemStock(fakeTransaction(world), step.items);
          } else if (!(await tryDeduct(world, step.items))) {
            continue;
          }
          const sign = step.restore ? 1 : -1;
          for (const item of step.items) bump(item.productVariantId ?? `${item.productId}:direct`, sign * item.quantity);
        }
        for (const row of world.values()) {
          const origin = start.get(row.id);
          if (!origin) throw new Error("product vanished");
          for (const variant of row.variants) {
            const first = origin.variants.find((candidate) => candidate.id === variant.id);
            expect(variant.stock).toBe((first?.stock ?? NaN) + (ledger.get(variant.id) ?? 0));
            if (variant.isActive) expect(variant.stock).toBeGreaterThanOrEqual(0);
          }
          const direct = origin.stock - activeSum(origin) + (ledger.get(`${row.id}:direct`) ?? 0);
          expect(row.stock).toBe(activeSum(row) + direct);
          expect(direct).toBeGreaterThanOrEqual(0);
        }
      },
    );
    expect(ran).toBe(300);
  });
});
