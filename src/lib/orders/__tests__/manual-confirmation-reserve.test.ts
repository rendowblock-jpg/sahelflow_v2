/**
 * Drives the REAL executeManualOrderDecision handler (and therefore the real
 * reserveOrderItem arithmetic) against an in-memory stand-in for the command
 * kernel and the database transaction.
 *
 * What this proves: the availability decision and the stock decrement that
 * manual-confirmation.ts makes for a given set of rows.
 * What this does NOT prove: the SQL itself. The stand-in re-implements the
 * reservation read in JavaScript, and ship/cancel are simulated by their
 * documented effects. The real SQL and the real ship/cancel commands are
 * exercised by manual-confirmation-availability.integration.test.ts, which
 * needs a real SQLite database and therefore only runs in CI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trustedManualOrderSourceMetadata } from "../manual-order-authority";
import { executeManualOrderDecision } from "../manual-confirmation";

interface FakeProduct {
  id: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
}
interface FakeVariant {
  id: string;
  productId: string;
  stock: number;
}
interface FakeItem {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  productVariantName: string | null;
  quantity: number;
}
interface FakeOrder {
  id: string;
  orderNumber: string;
  status: string;
  version: number;
  source: string;
  sourceMetadata: string;
  customerId: string;
  customer: { name: string };
  phone: string;
  totalPrice: number;
  wilaya: string;
  items: FakeItem[];
}
interface FakeReservation {
  id: string;
  reservationKey: string;
  orderId: string;
  productId: string;
  productVariantId: string | null;
  quantity: number;
  state: string;
  createdByCommandId: string;
}
interface FakeMovement {
  reservationId: string | null;
  commandId: string;
  movementType: string;
}
interface FakeOutcome {
  result: unknown;
  reservations?: Array<{
    operation: string;
    id: string;
    reservationKey?: string;
    orderId?: string;
    productId?: string;
    productVariantId?: string;
    quantity?: number;
  }>;
  inventoryMovements?: Array<{ movementType: string; reservationId?: string }>;
}
interface FakeHandlerArgs {
  tx: unknown;
  commandId: string;
  aggregateVersion: number;
  principal: { auditActor: string };
}

const h = vi.hoisted(() => ({
  seq: 0,
  state: {
    products: [] as FakeProduct[],
    variants: [] as FakeVariant[],
    orders: [] as FakeOrder[],
    reservations: [] as FakeReservation[],
    movements: [] as FakeMovement[],
  },
}));

vi.mock("@/lib/business-truth/command-kernel", () => {
  const isStorefrontKey = (key: string) =>
    key.startsWith("storefront-delegation:") ||
    key.startsWith("storefront-provisional:");
  const protectedFor = (productId: string, variantId: string | null) =>
    h.state.reservations
      .filter(
        (r) =>
          r.state === "active" &&
          r.productId === productId &&
          (variantId === null || r.productVariantId === variantId) &&
          isStorefrontKey(r.reservationKey),
      )
      .reduce((sum, r) => sum + r.quantity, 0);

  const tx = {
    order: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        h.state.orders.find((o) => o.id === where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const order = h.state.orders.find(
          (o) =>
            o.id === where.id &&
            o.status === where.status &&
            o.version === where.version,
        );
        if (!order) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
    orderChange: { create: async () => ({}) },
    product: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        const product = h.state.products.find((p) => p.id === where.id);
        return product ? { ...product } : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        h.state.products
          .filter((p) => where.id.in.includes(p.id))
          .map((p) => ({ ...p })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; stock: { gte: number } };
        data: { stock: { decrement: number } };
      }) => {
        const product = h.state.products.find((p) => p.id === where.id);
        if (!product || product.stock < where.stock.gte) return { count: 0 };
        const next = product.stock - data.stock.decrement;
        // Mirrors prisma/migrations/20260814030000_storefront_delegation_guards.
        if (next < protectedFor(product.id, null)) {
          throw new Error("storefront_delegation_stock_conflict");
        }
        product.stock = next;
        return { count: 1 };
      },
    },
    productVariant: {
      findFirst: async ({ where }: { where: { id: string; productId: string } }) => {
        const variant = h.state.variants.find(
          (v) => v.id === where.id && v.productId === where.productId,
        );
        return variant ? { ...variant } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; productId: string; stock: { gte: number } };
        data: { stock: { decrement: number } };
      }) => {
        const variant = h.state.variants.find(
          (v) => v.id === where.id && v.productId === where.productId,
        );
        if (!variant || variant.stock < where.stock.gte) return { count: 0 };
        const next = variant.stock - data.stock.decrement;
        if (next < protectedFor(variant.productId, variant.id)) {
          throw new Error("storefront_delegation_stock_conflict");
        }
        variant.stock = next;
        return { count: 1 };
      },
    },
    // Serves both the old shape (SUM of every active hold) and the new shape
    // (one row per hold with its key and whether a `reserve` movement exists),
    // so this file can run unchanged against the old and the new source.
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      const productId = values[0] as string;
      const variantId = (values[1] as string | undefined) ?? null;
      const holds = h.state.reservations.filter(
        (r) =>
          r.state === "active" &&
          r.productId === productId &&
          r.productVariantId === variantId,
      );
      if (text.includes('"reservationKey"')) {
        return holds.map((r) => ({
          reservationKey: r.reservationKey,
          quantity: r.quantity,
          reserveMovement: h.state.movements.some(
            (m) =>
              m.commandId === r.createdByCommandId &&
              m.reservationId === r.id &&
              m.movementType === "reserve",
          )
            ? 1
            : 0,
        }));
      }
      return [{ quantity: holds.reduce((sum, r) => sum + r.quantity, 0) }];
    },
  };

  return {
    executeBusinessCommand: async (
      _context: unknown,
      _command: unknown,
      handler: (args: FakeHandlerArgs) => Promise<FakeOutcome>,
    ) => {
      const before = structuredClone(h.state);
      h.seq += 1;
      const commandId = `00000000-0000-4000-8000-${String(h.seq).padStart(12, "0")}`;
      try {
        const outcome = await handler({
          tx,
          commandId,
          aggregateVersion: 1,
          principal: { auditActor: "test-owner" },
        });
        for (const r of outcome.reservations ?? []) {
          if (r.operation !== "open") continue;
          h.state.reservations.push({
            id: r.id,
            reservationKey: r.reservationKey ?? "",
            orderId: r.orderId ?? "",
            productId: r.productId ?? "",
            productVariantId: r.productVariantId ?? null,
            quantity: r.quantity ?? 0,
            state: "active",
            createdByCommandId: commandId,
          });
        }
        for (const m of outcome.inventoryMovements ?? []) {
          h.state.movements.push({
            reservationId: m.reservationId ?? null,
            commandId,
            movementType: m.movementType,
          });
        }
        return { result: outcome.result, replayed: false, aggregateVersion: 1 };
      } catch (error) {
        h.state = before; // the real kernel rolls the whole transaction back
        throw error;
      }
    },
  };
});

vi.mock("@/lib/business-truth/envelope-key", () => ({
  getBusinessEnvelopeKey: async () => null,
}));
vi.mock("@/lib/business-truth/payload-codec", () => ({
  sealBusinessPayloadWithKey: () => ({}),
}));
vi.mock("@/lib/connected-platform/storefront-delegation", () => ({
  consumeStorefrontDelegation: async () => [],
}));

const context = { prisma: {} } as never;
let sequence = 0;

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required by the test fixture`);
  }
  return value;
}

function seedProduct(stock: number, id = "prod-1"): void {
  h.state.products.push({ id, name: `Product ${id}`, stock, lowStockThreshold: 0 });
}

function seedVariant(productId: string, stock: number, id = "var-1"): void {
  h.state.variants.push({ id, productId, stock });
}

function seedOrder(productId: string, quantity: number, variantId?: string): string {
  sequence += 1;
  const id = `order-${sequence}`;
  h.state.orders.push({
    id,
    orderNumber: `ORD-${sequence}`,
    status: "pending",
    version: 1,
    source: "manual",
    sourceMetadata: trustedManualOrderSourceMetadata(),
    customerId: "customer-1",
    customer: { name: "Test customer" },
    phone: "0555000000",
    totalPrice: 2500 * quantity,
    wilaya: "Alger",
    items: [
      {
        id: `item-${sequence}`,
        productId,
        productVariantId: variantId ?? null,
        productVariantName: variantId ? "Variant" : null,
        quantity,
      },
    ],
  });
  return id;
}

/** A storefront hold: held against physical stock, never lowers it. */
function seedStorefrontHold(
  productId: string,
  quantity: number,
  kind: "provisional" | "delegation" = "provisional",
): void {
  sequence += 1;
  h.state.reservations.push({
    id: `storefront-hold-${sequence}`,
    reservationKey: `storefront-${kind}:release_abcdefgh:item-${sequence}`,
    orderId: `storefront-${kind}:storefront-1:release_abcdefgh`,
    productId,
    productVariantId: null,
    quantity,
    state: "active",
    createdByCommandId: "storefront-command",
  });
}

function confirm(orderId: string) {
  return executeManualOrderDecision(context, {
    orderId,
    decision: "confirm",
    expectedVersion: 1,
    idempotencyKey: `confirm-${orderId}-key`,
  });
}

function stockOf(productId: string): number {
  return required(
    h.state.products.find((p) => p.id === productId),
    "product",
  ).stock;
}

function variantStockOf(variantId: string): number {
  return required(
    h.state.variants.find((v) => v.id === variantId),
    "variant",
  ).stock;
}

function activeHeld(productId: string): number {
  return h.state.reservations
    .filter((r) => r.state === "active" && r.productId === productId)
    .reduce((sum, r) => sum + r.quantity, 0);
}

beforeEach(() => {
  h.seq = 0;
  h.state = {
    products: [],
    variants: [],
    orders: [],
    reservations: [],
    movements: [],
  };
});

describe("manual confirmation availability (audit S03a-02 / S03c-01)", () => {
  it("confirms single-unit orders until stock 5 is exhausted, then refuses the next without overselling", async () => {
    seedProduct(5);
    for (let confirmed = 1; confirmed <= 5; confirmed += 1) {
      await confirm(seedOrder("prod-1", 1));
      expect(stockOf("prod-1")).toBe(5 - confirmed);
    }
    expect(activeHeld("prod-1")).toBe(5);

    await expect(confirm(seedOrder("prod-1", 1))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(0);
    expect(activeHeld("prod-1")).toBe(5);
  });

  it("lets two orders of 5 take all 10 units on the shelf, then refuses one more", async () => {
    seedProduct(10);
    await confirm(seedOrder("prod-1", 5));
    expect(stockOf("prod-1")).toBe(5);
    // Old behaviour: stock 5 - held 5 = 0, so this second confirmation was
    // refused although five units were free.
    await confirm(seedOrder("prod-1", 5));
    expect(stockOf("prod-1")).toBe(0);

    await expect(confirm(seedOrder("prod-1", 1))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(0);
  });

  it("refuses an oversell attempt without moving stock or opening a hold", async () => {
    seedProduct(10);
    await confirm(seedOrder("prod-1", 4));
    const holdsBefore = h.state.reservations.length;

    await expect(confirm(seedOrder("prod-1", 7))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(6);
    expect(h.state.reservations).toHaveLength(holdsBefore);

    await confirm(seedOrder("prod-1", 6)); // the exact boundary is sellable
    expect(stockOf("prod-1")).toBe(0);
  });

  it("applies the same rule to an exact variant (and decrements the parent product once)", async () => {
    seedProduct(3);
    seedVariant("prod-1", 3);
    for (let confirmed = 1; confirmed <= 3; confirmed += 1) {
      await confirm(seedOrder("prod-1", 1, "var-1"));
    }
    expect(variantStockOf("var-1")).toBe(0);
    expect(stockOf("prod-1")).toBe(0);

    await expect(confirm(seedOrder("prod-1", 1, "var-1"))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(variantStockOf("var-1")).toBe(0);
  });

  it("still lets a storefront hold block: 7 of 10 delegated leaves room for 3 and no more", async () => {
    seedProduct(10);
    seedStorefrontHold("prod-1", 7, "delegation");

    await expect(confirm(seedOrder("prod-1", 4))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(10);

    await confirm(seedOrder("prod-1", 3));
    expect(stockOf("prod-1")).toBe(7);
    await expect(confirm(seedOrder("prod-1", 1))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(7);
  });

  it("counts a storefront hold but not the confirmed manual holds beside it", async () => {
    seedProduct(10);
    seedStorefrontHold("prod-1", 3, "provisional");
    await confirm(seedOrder("prod-1", 4)); // stock 6, manual hold 4, storefront 3
    expect(stockOf("prod-1")).toBe(6);

    // Free = stock 6 - storefront 3 = 3. The old rule subtracted 3 + 4 = 7.
    await confirm(seedOrder("prod-1", 3));
    expect(stockOf("prod-1")).toBe(3);

    await expect(confirm(seedOrder("prod-1", 1))).rejects.toThrow(
      /insufficient available stock/i,
    );
    expect(stockOf("prod-1")).toBe(3);
  });

  it("fails closed on a hold it cannot prove already lowered stock", async () => {
    seedProduct(10);
    // No storefront prefix and no `reserve` movement: legacy or unknown producer.
    h.state.reservations.push({
      id: "unknown-hold",
      reservationKey: "legacy-hold-1",
      orderId: "legacy-order",
      productId: "prod-1",
      productVariantId: null,
      quantity: 4,
      state: "active",
      createdByCommandId: "legacy-command",
    });

    await expect(confirm(seedOrder("prod-1", 7))).rejects.toThrow(
      /insufficient available stock/i,
    );
    await confirm(seedOrder("prod-1", 6));
    expect(stockOf("prod-1")).toBe(4);
  });

  it("ship (consume, stock untouched) leaves what can still be confirmed unchanged [simulated close]", async () => {
    seedProduct(10);
    await confirm(seedOrder("prod-1", 4));
    expect(stockOf("prod-1")).toBe(6);

    // canonical-fulfillment.ts consume: the hold leaves 'active', stock is not touched.
    for (const hold of h.state.reservations) hold.state = "consumed";
    expect(stockOf("prod-1")).toBe(6);

    await confirm(seedOrder("prod-1", 6));
    expect(stockOf("prod-1")).toBe(0);
  });

  it("cancel (release + stock restored) frees exactly the cancelled units [simulated close]", async () => {
    seedProduct(10);
    const first = await confirm(seedOrder("prod-1", 4));
    await confirm(seedOrder("prod-1", 4));
    expect(first.result.status).toBe("confirmed");
    expect(stockOf("prod-1")).toBe(2);
    await expect(confirm(seedOrder("prod-1", 3))).rejects.toThrow(
      /insufficient available stock/i,
    );

    // canonical-order-recovery.ts cancel: release the hold AND add the stock back.
    const cancelled = required(h.state.reservations[0], "first hold");
    cancelled.state = "released";
    required(h.state.products[0], "product").stock += cancelled.quantity;
    expect(stockOf("prod-1")).toBe(6);

    await confirm(seedOrder("prod-1", 6));
    expect(stockOf("prod-1")).toBe(0);
  });
});
