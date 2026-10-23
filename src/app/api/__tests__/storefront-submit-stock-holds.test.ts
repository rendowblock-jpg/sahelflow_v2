/**
 * LEAD-02: the storefront's "is it still in stock" check at POST /api/storefront/submit.
 *
 * Product.stock is the AVAILABLE position. A manual confirmation lowers it by the ordered
 * quantity and opens an active hold for the same quantity, so that unit is already out of the
 * stock number. The check used to subtract every active hold from stock, which counted those
 * units twice: 10 on the shelf with 5 confirmed (stock 5, held 5) looked like 0 available, and
 * a customer's order for 1 unit was refused as sold out. A hold the storefront itself carved out
 * of physical stock (it does not lower stock) must still be subtracted, and anything the rule
 * cannot classify must still be counted in full.
 *
 * Real SQLite, the real route, the real command kernel; only the rows that stand in for the
 * confirmed and delegated holds are written directly.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../storefront/submit/route";
import {
  cleanDb,
  mockPost,
  rawDb,
  seedProduct,
  seedStorefront,
} from "./helpers";

let sequence = 0;

async function seedHold(options: {
  productId: string;
  productVariantId?: string | null;
  quantity: number;
  /** "manual": opened by a confirmation (reserve movement, command-scoped key). */
  kind: "manual" | "storefront-delegation" | "storefront-provisional" | "legacy";
  /** Write the 'reserve' movement even for a kind that normally has none. */
  withMovement?: boolean;
  /** Open this hold under an existing command instead of a new one (a command that opens several holds). */
  reuseCommandId?: string;
  /** Type of the movement that is written (default 'reserve'). */
  movementType?: string;
  /** Write the movement under a different command than the one that opened the hold. */
  movementByOtherCommand?: boolean;
  state?: "active" | "consumed" | "released";
}) {
  sequence += 1;
  const commandId = options.reuseCommandId ?? `cmd_hold_${sequence}`;
  if (!options.reuseCommandId) {
    await rawDb.businessCommand.create({
      data: {
        id: commandId,
        idempotencyKey: `hold-key-${sequence}-${commandId}`,
        commandType: "test.reservation",
        aggregateType: "product",
        aggregateId: options.productId,
        requestHash: "d".repeat(64),
        status: "committed",
        actor: "test",
        correlationId: `hold-corr-${sequence}`,
        expectedVersion: 0,
        committedVersion: 1,
      },
    });
  }
  const reservationKey =
    options.kind === "manual"
      ? `${commandId}:reserve:item_${sequence}`
      : options.kind === "legacy"
        ? `legacy-hold-${sequence}`
        : `${options.kind}:${sequence}`;
  const reservationId = `reservation_${sequence}`;
  await rawDb.inventoryReservation.create({
    data: {
      id: reservationId,
      reservationKey,
      orderId: `order_hold_${sequence}`,
      productId: options.productId,
      productVariantId: options.productVariantId ?? null,
      quantity: options.quantity,
      state: options.state ?? "active",
      createdByCommandId: commandId,
    },
  });
  if (options.kind === "manual" || options.withMovement) {
    let movementCommandId = commandId;
    if (options.movementByOtherCommand) {
      movementCommandId = `${commandId}_other`;
      await rawDb.businessCommand.create({
        data: {
          id: movementCommandId,
          idempotencyKey: `hold-key-other-${sequence}`,
          commandType: "test.movement",
          aggregateType: "product",
          aggregateId: options.productId,
          requestHash: "e".repeat(64),
          status: "committed",
          actor: "test",
          correlationId: `hold-corr-other-${sequence}`,
          expectedVersion: 0,
          committedVersion: 1,
        },
      });
    }
    await rawDb.inventoryMovement.create({
      data: {
        id: `movement_${sequence}`,
        movementKey: `${movementCommandId}:movement:item_${sequence}`,
        commandId: movementCommandId,
        orderId: `order_hold_${sequence}`,
        reservationId,
        productId: options.productId,
        productVariantId: options.productVariantId ?? null,
        movementType: options.movementType ?? "reserve",
        quantity: options.quantity,
        fromPosition: "available",
        toPosition: "reserved",
        reason: "test hold",
      },
    });
  }
  return { commandId, reservationId };
}

async function submit(
  items: Array<{
    productId: string;
    productVariantId?: string;
    quantity: number;
  }>,
) {
  sequence += 1;
  return POST(
    mockPost("http://localhost/api/storefront/submit", {
      slug: "test-store",
      submissionId: crypto.randomUUID(),
      customer: {
        name: "Stock Check",
        phone: "0555123456",
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Test",
      },
      items,
    }),
  );
}

async function setup(stock: number) {
  const product = await seedProduct({ stock });
  await seedStorefront({ productIds: [product.id] });
  return product;
}

async function code(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

beforeEach(cleanDb);
afterAll(async () => {
  await rawDb.$disconnect();
});

describe("storefront stock check and holds that already lowered stock (LEAD-02)", () => {
  it("sells the units that are really free when a confirmed order already took its share", async () => {
    // 10 on the shelf, 5 confirmed: stock is 5 and a hold of 5 exists.
    const product = await setup(5);
    await seedHold({ productId: product.id, quantity: 5, kind: "manual" });

    const response = await submit([{ productId: product.id, quantity: 5 }]);

    expect(response.status).toBe(201);
    expect(await rawDb.order.count()).toBe(1);
  });

  it("still refuses one unit more than is free", async () => {
    const product = await setup(5);
    await seedHold({ productId: product.id, quantity: 5, kind: "manual" });

    const response = await submit([{ productId: product.id, quantity: 6 }]);

    expect(response.status).toBe(409);
    expect(await code(response)).toBe("STOREFRONT_STOCK_UNAVAILABLE");
    expect(await rawDb.order.count()).toBe(0);
  });

  it("adds up several confirmed holds on the same product without counting any twice", async () => {
    const product = await setup(7);
    await seedHold({ productId: product.id, quantity: 2, kind: "manual" });
    await seedHold({ productId: product.id, quantity: 3, kind: "manual" });

    expect((await submit([{ productId: product.id, quantity: 7 }])).status).toBe(201);
  });

  it("still subtracts a hold the storefront carved out of physical stock", async () => {
    const product = await setup(10);
    await seedHold({
      productId: product.id,
      quantity: 3,
      kind: "storefront-delegation",
    });

    const tooMany = await submit([{ productId: product.id, quantity: 8 }]);
    expect(tooMany.status).toBe(409);
    expect(await code(tooMany)).toBe("STOREFRONT_STOCK_UNAVAILABLE");
    expect((await submit([{ productId: product.id, quantity: 7 }])).status).toBe(201);
  });

  it("subtracts a provisional storefront hold too", async () => {
    const product = await setup(10);
    await seedHold({
      productId: product.id,
      quantity: 4,
      kind: "storefront-provisional",
    });

    expect((await submit([{ productId: product.id, quantity: 7 }])).status).toBe(409);
    expect((await submit([{ productId: product.id, quantity: 6 }])).status).toBe(201);
  });

  it("counts a storefront-keyed hold in full even if a reserve movement exists for it", async () => {
    const product = await setup(10);
    await seedHold({
      productId: product.id,
      quantity: 3,
      kind: "storefront-delegation",
      withMovement: true,
    });

    expect((await submit([{ productId: product.id, quantity: 8 }])).status).toBe(409);
  });

  it("counts a hold it cannot classify in full, so the check can only get stricter", async () => {
    const product = await setup(4);
    await seedHold({ productId: product.id, quantity: 3, kind: "legacy" });

    expect((await submit([{ productId: product.id, quantity: 2 }])).status).toBe(409);
    expect((await submit([{ productId: product.id, quantity: 1 }])).status).toBe(201);
  });

  it("counts a hold in full when the only movement for it is not a 'reserve'", async () => {
    const product = await setup(4);
    await seedHold({
      productId: product.id,
      quantity: 3,
      kind: "legacy",
      withMovement: true,
      movementType: "release",
    });

    expect((await submit([{ productId: product.id, quantity: 2 }])).status).toBe(409);
  });

  it("counts a hold in full when its reserve movement was written by a different command", async () => {
    const product = await setup(4);
    await seedHold({
      productId: product.id,
      quantity: 3,
      kind: "legacy",
      withMovement: true,
      movementByOtherCommand: true,
    });

    expect((await submit([{ productId: product.id, quantity: 2 }])).status).toBe(409);
  });

  it("counts a hold in full when only a sibling hold of the same command has a reserve movement", async () => {
    // One command opened two holds but wrote a reserve movement for only the first.
    const product = await setup(4);
    const first = await seedHold({ productId: product.id, quantity: 1, kind: "manual" });
    await seedHold({
      productId: product.id,
      quantity: 3,
      kind: "legacy",
      reuseCommandId: first.commandId,
    });

    expect((await submit([{ productId: product.id, quantity: 2 }])).status).toBe(409);
    expect((await submit([{ productId: product.id, quantity: 1 }])).status).toBe(201);
  });

  it("adds up every hold that counts, not just one of them", async () => {
    const product = await setup(10);
    await seedHold({ productId: product.id, quantity: 3, kind: "storefront-delegation" });
    await seedHold({ productId: product.id, quantity: 2, kind: "storefront-provisional" });

    expect((await submit([{ productId: product.id, quantity: 6 }])).status).toBe(409);
    expect((await submit([{ productId: product.id, quantity: 5 }])).status).toBe(201);
  });

  it("mixes the two kinds: only the storefront hold comes off the stock", async () => {
    // Stock 6 after a confirmation took 4; the storefront also holds 2 of what is left.
    const product = await setup(6);
    await seedHold({ productId: product.id, quantity: 4, kind: "manual" });
    await seedHold({
      productId: product.id,
      quantity: 2,
      kind: "storefront-delegation",
    });

    expect((await submit([{ productId: product.id, quantity: 5 }])).status).toBe(409);
    expect((await submit([{ productId: product.id, quantity: 4 }])).status).toBe(201);
  });

  it("ignores holds that are no longer active", async () => {
    const product = await setup(5);
    await seedHold({
      productId: product.id,
      quantity: 5,
      kind: "storefront-delegation",
      state: "consumed",
    });
    await seedHold({
      productId: product.id,
      quantity: 5,
      kind: "legacy",
      state: "released",
    });

    expect((await submit([{ productId: product.id, quantity: 5 }])).status).toBe(201);
  });

  it("does not let a hold on another product change the answer", async () => {
    const product = await setup(5);
    const other = await seedProduct({ stock: 50 });
    await seedHold({
      productId: other.id,
      quantity: 40,
      kind: "storefront-delegation",
    });

    expect((await submit([{ productId: product.id, quantity: 5 }])).status).toBe(201);
  });

  it("adds the demand of two lines for the same product before comparing", async () => {
    const product = await setup(5);
    await seedHold({ productId: product.id, quantity: 5, kind: "manual" });

    expect(
      (
        await submit([
          { productId: product.id, quantity: 3 },
          { productId: product.id, quantity: 3 },
        ])
      ).status,
    ).toBe(409);
    expect(
      (
        await submit([
          { productId: product.id, quantity: 2 },
          { productId: product.id, quantity: 3 },
        ])
      ).status,
    ).toBe(201);
  });

  it("applies the same rule to one variant and leaves its sibling alone", async () => {
    const product = await seedProduct({ stock: 0 });
    await seedStorefront({ productIds: [product.id] });
    const red = await rawDb.productVariant.create({
      data: { productId: product.id, name: "Red", stock: 5, isActive: true },
    });
    const blue = await rawDb.productVariant.create({
      data: { productId: product.id, name: "Blue", stock: 5, isActive: true },
    });
    await seedHold({
      productId: product.id,
      productVariantId: red.id,
      quantity: 5,
      kind: "manual",
    });
    await seedHold({
      productId: product.id,
      productVariantId: blue.id,
      quantity: 4,
      kind: "storefront-delegation",
    });

    expect(
      (await submit([{ productId: product.id, productVariantId: red.id, quantity: 5 }])).status,
    ).toBe(201);
    expect(
      (await submit([{ productId: product.id, productVariantId: blue.id, quantity: 2 }])).status,
    ).toBe(409);
    expect(
      (await submit([{ productId: product.id, productVariantId: blue.id, quantity: 1 }])).status,
    ).toBe(201);
  });
});
