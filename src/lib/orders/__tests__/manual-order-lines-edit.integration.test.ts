process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { createCanonicalSourceOrder } from "../canonical-source-order";
import { submitCanonicalSourceDraft } from "../canonical-source-draft";
import {
  canonicalSourceOrderSourceMetadata,
  trustedManualOrderSourceMetadata,
} from "../manual-order-authority";
import { executeManualOrderDecision } from "../manual-confirmation";
import { executeManualOrderEdit } from "../manual-order-edit";
import { executeManualOrderLinesEdit } from "../manual-order-lines-edit";

/**
 * S03a-03B on real SQLite: the lines of a PENDING order the seller typed in can be
 * corrected; stock is not touched because a pending manual order holds none, and the
 * confirmation that follows reads the corrected lines.
 */

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

type ForeignKeyEdge = { child: string; parent: string };
let linkedTablesCache: { tables: string[]; edges: ForeignKeyEdge[] } | undefined;

/**
 * Every table that points at a business command, directly or through another
 * table, read from SQLite's own foreign-key list and ordered children first.
 * The keys are RESTRICT, so one row left in any of them by an EARLIER test file
 * (canonical-courier.integration leaves CanonicalDeliveryEvent rows) makes
 * DELETE FROM "BusinessCommand" fail, and with it every test of this file.
 */
async function commandLinkedTables(): Promise<{ tables: string[]; edges: ForeignKeyEdge[] }> {
  if (linkedTablesCache) return linkedTablesCache;
  const all = await db.$queryRawUnsafe<ForeignKeyEdge[]>(
    `SELECT m.name AS child, f."table" AS parent FROM sqlite_master AS m, pragma_foreign_key_list(m.name) AS f WHERE m.type = 'table'`,
  );
  const linked = new Set<string>(["BusinessCommand"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of all) {
      if (linked.has(edge.parent) && !linked.has(edge.child)) {
        linked.add(edge.child);
        grew = true;
      }
    }
  }
  linked.delete("BusinessCommand");
  const remaining = new Set(linked);
  const tables: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter(
      (table) => !all.some((edge) => edge.parent === table && edge.child !== table && remaining.has(edge.child)),
    );
    if (ready.length === 0) throw new Error(`foreign keys form a cycle among ${[...remaining].join(", ")}`);
    for (const table of ready) {
      if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`unexpected table name ${table}`);
      tables.push(table);
      remaining.delete(table);
    }
  }
  linkedTablesCache = {
    tables,
    edges: all.filter((edge) => linked.has(edge.child) && linked.has(edge.parent)),
  };
  return linkedTablesCache;
}

async function clean(): Promise<void> {
  for (const table of (await commandLinkedTables()).tables) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
  }
  await db.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await db.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');
  await db.auditLog.deleteMany();
  await db.orderChange.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.customer.deleteMany();
}

async function count(table: string): Promise<number> {
  const allowed = new Set([
    "AuditLog",
    "BusinessAggregateVersion",
    "BusinessCommand",
    "DomainEvent",
    "InventoryReservation",
    "InventoryMovement",
    "ProjectionInvalidation",
  ]);
  if (!allowed.has(table)) throw new Error(`unsupported table ${table}`);
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}"`,
  );
  return Number(rows[0]?.total ?? 0);
}

async function seedOrder(
  options: {
    status?: string;
    source?: string;
    sourceMetadata?: string | null;
    stock?: number;
    quantity?: number;
  } = {},
) {
  sequence += 1;
  const category = await db.category.create({ data: { name: `Lines category ${sequence}` } });
  const product = await db.product.create({
    data: {
      name: `Lines product ${sequence}`,
      price: 2500,
      stock: options.stock ?? 10,
      lowStockThreshold: 1,
      isActive: true,
      categoryId: category.id,
    },
  });
  const customer = await db.customer.create({
    data: {
      name: `Lines customer ${sequence}`,
      phone: `lines-customer-phone-${sequence}`,
      nameBlindIndex: `lines-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Customer address",
    },
  });
  const quantity = options.quantity ?? 2;
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-LINES-${sequence}`,
      status: options.status ?? "pending",
      version: 1,
      fulfillmentState: "unfulfilled",
      deliveryState: "not_created",
      inventoryState: "unreserved",
      codState: "not_expected",
      customerId: customer.id,
      totalPrice: 2500 * quantity + 600,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "12 rue Didouche Mourad",
      phone: "0550123456",
      source: options.source ?? "manual",
      sourceMetadata:
        options.sourceMetadata === undefined
          ? trustedManualOrderSourceMetadata()
          : options.sourceMetadata,
      items: {
        create: [
          {
            productId: product.id,
            productName: product.name,
            quantity,
            unitPrice: 2500,
            total: 2500 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
  const item = order.items[0] as (typeof order.items)[number];
  return { order, item, product, customer };
}

async function seedProduct(
  name: string,
  price: number,
  options: { active?: boolean; variants?: Array<{ name: string; price: number | null; isActive?: boolean }> } = {},
) {
  sequence += 1;
  const category = await db.category.create({ data: { name: `Lines extra category ${sequence}` } });
  const product = await db.product.create({
    data: {
      name,
      price,
      stock: 20,
      lowStockThreshold: 1,
      isActive: options.active ?? true,
      categoryId: category.id,
    },
  });
  const variants = [];
  for (const [index, variant] of (options.variants ?? []).entries()) {
    variants.push(
      await db.productVariant.create({
        data: {
          productId: product.id,
          name: variant.name,
          price: variant.price,
          stock: 20,
          isActive: variant.isActive ?? true,
          sortOrder: index,
        },
      }),
    );
  }
  return { product, variants };
}

function linesCommand(
  orderId: string,
  key: string,
  lines: Array<Record<string, unknown>>,
  expectedVersion = 1,
) {
  return { orderId, expectedVersion, idempotencyKey: key, correlationId: `${key}-correlation`, lines };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("editing the lines of a pending order the seller typed in (S03a-03B)", () => {
  it("clears every table that points at a business command, children first, so rows another test file left behind cannot block the cleanup", async () => {
    const { tables, edges } = await commandLinkedTables();
    expect(tables).toEqual(
      expect.arrayContaining(["CanonicalDeliveryEvent", "DomainEvent", "InventoryReservation", "OutboxIntent"]),
    );
    expect(tables).not.toContain("BusinessCommand");
    for (const edge of edges) {
      if (edge.child !== edge.parent) {
        expect(tables.indexOf(edge.child), `${edge.child} must be cleared before ${edge.parent}`).toBeLessThan(
          tables.indexOf(edge.parent),
        );
      }
    }
    // The command rows themselves are cleared after every table above.
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("changes a quantity, recomputes the total from the lines and writes every fact", async () => {
    const { order, item, product } = await seedOrder();

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-quantity-success", [{ id: item.id, quantity: 3 }]),
    );

    expect(result).toMatchObject({ replayed: false, aggregateVersion: 1 });
    expect(result.result).toMatchObject({
      orderId: order.id,
      status: "pending",
      version: 2,
      itemsTotal: 7500,
      deliveryCost: 600,
      totalPrice: 8100,
      added: 0,
      removed: 0,
      changed: 1,
    });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(after).toMatchObject({ status: "pending", version: 2, totalPrice: 8100, deliveryCost: 600 });
    expect(after.items).toHaveLength(1);
    expect(after.items[0]).toMatchObject({ id: item.id, quantity: 3, unitPrice: 2500, total: 7500 });
    // A pending manual order holds no stock, so nothing about stock moves.
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 10 });
    expect(await count("InventoryReservation")).toBe(0);
    expect(await count("InventoryMovement")).toBe(0);
    // The five facts of the golden write.
    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("AuditLog")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
    expect(await count("ProjectionInvalidation")).toBeGreaterThanOrEqual(2);
  });

  it("keeps the price the order was written with when the catalog price has moved", async () => {
    const { order, item, product } = await seedOrder();
    await db.product.update({ where: { id: product.id }, data: { price: 9999 } });

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-keep-price", [{ id: item.id, quantity: 4 }]),
    );

    expect(result.result).toMatchObject({ itemsTotal: 10_000, totalPrice: 10_600 });
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      unitPrice: 2500,
      total: 10_000,
    });
  });

  it("applies a price given for an existing line", async () => {
    const { order, item } = await seedOrder();

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-price-given", [{ id: item.id, quantity: 2, unitPrice: 2300 }]),
    );

    expect(result.result).toMatchObject({ itemsTotal: 4600, totalPrice: 5200, changed: 1 });
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      unitPrice: 2300,
      total: 4600,
    });
  });

  it("adds a product at its catalog price, with its name taken from the catalog", async () => {
    const { order, item } = await seedOrder();
    const { product: extra } = await seedProduct("Added product", 1800);

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-add-product", [
        { id: item.id, quantity: 2 },
        { productId: extra.id, quantity: 3 },
      ]),
    );

    expect(result.result).toMatchObject({ itemsTotal: 5000 + 5400, totalPrice: 11_000, added: 1, removed: 0, changed: 0 });
    const items = await db.orderItem.findMany({ where: { orderId: order.id }, orderBy: { total: "asc" } });
    expect(items).toHaveLength(2);
    expect(items.find((row) => row.productId === extra.id)).toMatchObject({
      productName: "Added product",
      productVariantId: null,
      quantity: 3,
      unitPrice: 1800,
      total: 5400,
    });
  });

  it("adds a product at the price given for it", async () => {
    const { order, item } = await seedOrder();
    const { product: extra } = await seedProduct("Negotiated product", 1800);

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-add-priced", [
        { id: item.id, quantity: 2 },
        { productId: extra.id, quantity: 2, unitPrice: 1500 },
      ]),
    );

    expect(result.result).toMatchObject({ itemsTotal: 5000 + 3000, totalPrice: 8600 });
  });

  it("a product with variants needs one exact active variant and takes that variant's price", async () => {
    const { order, item } = await seedOrder();
    const { product, variants } = await seedProduct("Shirt", 2000, {
      variants: [
        { name: "Red", price: 3000 },
        { name: "Blue", price: null },
        { name: "Old", price: 100, isActive: false },
      ],
    });
    const [red, blue, old] = variants as [(typeof variants)[number], (typeof variants)[number], (typeof variants)[number]];

    for (const bad of [undefined, null, old.id, "nonexistent-variant"]) {
      await expect(
        executeManualOrderLinesEdit(
          context,
          linesCommand(order.id, `lines-variant-bad-${String(bad)}`, [
            { id: item.id, quantity: 2 },
            { productId: product.id, productVariantId: bad, quantity: 1 },
          ]),
        ),
      ).rejects.toThrow(/exact active variant/i);
    }
    expect(await count("BusinessCommand")).toBe(0);

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-variant-ok", [
        { id: item.id, quantity: 2 },
        { productId: product.id, productVariantId: red.id, quantity: 1 },
        { productId: product.id, productVariantId: blue.id, quantity: 2 },
      ]),
    );
    expect(result.result).toMatchObject({ added: 2, itemsTotal: 5000 + 3000 + 4000 });
    const rows = await db.orderItem.findMany({ where: { orderId: order.id, productId: product.id } });
    expect(rows.find((row) => row.productVariantId === red.id)).toMatchObject({
      productVariantName: "Red",
      unitPrice: 3000,
    });
    // A variant with no price of its own sells at the product's price.
    expect(rows.find((row) => row.productVariantId === blue.id)).toMatchObject({
      productVariantName: "Blue",
      unitPrice: 2000,
    });
  });

  it("refuses a product whose variants are all switched off: it is not sold as a plain product", async () => {
    const { order, item } = await seedOrder();
    const { product } = await seedProduct("Switched off", 1000, {
      variants: [{ name: "Only", price: 400, isActive: false }],
    });
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-all-variants-off", [
          { id: item.id, quantity: 2 },
          { productId: product.id, quantity: 1 },
        ]),
      ),
    ).rejects.toThrow(/none are active/i);
    expect(await db.orderItem.count({ where: { orderId: order.id } })).toBe(1);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses a variant given to a product that has none", async () => {
    const { order, item } = await seedOrder();
    const { product } = await seedProduct("Plain", 1000);

    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-variant-on-plain", [
          { id: item.id, quantity: 2 },
          { productId: product.id, productVariantId: "some-variant", quantity: 1 },
        ]),
      ),
    ).rejects.toThrow(/has no variants/i);
  });

  it("removes a line that is left out of the new list", async () => {
    const { order, item } = await seedOrder();
    const { product: extra } = await seedProduct("Second line", 1800);
    const second = await db.orderItem.create({
      data: { orderId: order.id, productId: extra.id, productName: "Second line", quantity: 1, unitPrice: 1800, total: 1800 },
    });
    await db.order.update({ where: { id: order.id }, data: { totalPrice: 5000 + 1800 + 600 } });

    const result = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-remove", [{ id: item.id, quantity: 2 }]),
    );

    expect(result.result).toMatchObject({ removed: 1, added: 0, changed: 0, itemsTotal: 5000, totalPrice: 5600 });
    expect(await db.orderItem.findUnique({ where: { id: second.id } })).toBeNull();
    expect(await db.orderItem.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses an empty list: an order always keeps at least one line", async () => {
    const { order } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-empty", [])),
    ).rejects.toThrow(/too small|at least|>=1/i);
    expect(await db.orderItem.count({ where: { orderId: order.id } })).toBe(1);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses the same product and variant on two lines", async () => {
    const { order, item, product } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-duplicate", [
          { id: item.id, quantity: 2 },
          { productId: product.id, quantity: 1 },
        ]),
      ),
    ).rejects.toThrow(/more than once/i);
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-same-id-twice", [
          { id: item.id, quantity: 2 },
          { id: item.id, quantity: 3 },
        ]),
      ),
    ).rejects.toThrow(/more than once/i);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses a line id that belongs to another order", async () => {
    const { order } = await seedOrder();
    const other = await seedOrder();

    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-foreign-id", [{ id: other.item.id, quantity: 2 }]),
      ),
    ).rejects.toThrow(/does not belong/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: other.item.id } })).toMatchObject({ quantity: 2 });
  });

  it("refuses a line that names neither an existing line nor a product", async () => {
    const { order } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-no-target", [{ quantity: 2 }])),
    ).rejects.toThrow(/line id or a product/i);
  });

  it("refuses an unknown or inactive product", async () => {
    const { order, item } = await seedOrder();
    const { product: inactive } = await seedProduct("Retired", 1000, { active: false });

    for (const productId of ["no-such-product", inactive.id]) {
      await expect(
        executeManualOrderLinesEdit(
          context,
          linesCommand(order.id, `lines-bad-product-${productId}`, [
            { id: item.id, quantity: 2 },
            { productId, quantity: 1 },
          ]),
        ),
      ).rejects.toThrow(/not found/i);
    }
  });

  it("refuses a total that no longer fits the order total field", async () => {
    const { order, item } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-too-large", [{ id: item.id, quantity: 100_000, unitPrice: 30_000 }]),
      ),
    ).rejects.toThrow(/too large/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses when nothing differs from what is stored", async () => {
    const { order, item } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-nothing", [{ id: item.id, quantity: 2 }]),
      ),
    ).rejects.toThrow(/nothing to change/i);
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-nothing-price", [{ id: item.id, quantity: 2, unitPrice: 2500 }]),
      ),
    ).rejects.toThrow(/nothing to change/i);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("replays the exact command without a second write", async () => {
    const { order, item } = await seedOrder();
    const input = linesCommand(order.id, "lines-replay-key", [{ id: item.id, quantity: 5 }]);

    const first = await executeManualOrderLinesEdit(context, input);
    const replay = await executeManualOrderLinesEdit(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(2);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses a stale version and writes nothing", async () => {
    const { order, item } = await seedOrder();
    await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-first", [{ id: item.id, quantity: 3 }]),
    );

    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-stale", [{ id: item.id, quantity: 9 }], 1),
      ),
    ).rejects.toThrow(/version conflict/i);

    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 3 });
    expect(await count("BusinessCommand")).toBe(1);
  });

  it.each(["confirmed", "cancelled", "shipped", "delivered"])(
    "refuses to edit the lines of a %s order",
    async (status) => {
      const { order, item } = await seedOrder({ status });
      await expect(
        executeManualOrderLinesEdit(
          context,
          linesCommand(order.id, `lines-status-${status}`, [{ id: item.id, quantity: 9 }]),
        ),
      ).rejects.toThrow(/requires pending status/i);
      expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
      expect(await count("BusinessCommand")).toBe(0);
    },
  );

  it("refuses a hosted storefront order with a coded 409: its stock is held at the storefront", async () => {
    const { order, item } = await seedOrder({
      source: "storefront",
      sourceMetadata: canonicalSourceOrderSourceMetadata({
        source: "storefront",
        sourceIdentity: "shop-a",
        sourceOrderId: "receipt-1",
        sourceDetails: { hostedDelegationAuthority: "v1", hostedReleaseId: "release-00000001" },
      }),
    });

    const failure = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-storefront", [{ id: item.id, quantity: 9 }]),
    ).then(
      () => null,
      (error: unknown) => error as { code?: string; statusCode?: number },
    );
    expect(failure).toMatchObject({ code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE", statusCode: 409 });
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses a legacy order that no governed command adopted", async () => {
    const { order, item } = await seedOrder({ sourceMetadata: null });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-legacy", [{ id: item.id, quantity: 9 }])),
    ).rejects.toMatchObject({ code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE" });
  });

  it("refuses an order whose inventory state is missing: only a plainly unreserved order is edited", async () => {
    const { order, item } = await seedOrder();
    await db.order.update({ where: { id: order.id }, data: { inventoryState: null } });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-no-state", [{ id: item.id, quantity: 9 }])),
    ).rejects.toThrow(/holds stock or has no inventory state/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
  });

  it("refuses a line that names both an existing line and a product", async () => {
    const { order, item, product } = await seedOrder();
    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-both", [{ id: item.id, productId: product.id, quantity: 3 }]),
      ),
    ).rejects.toThrow(/not both/i);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("refuses when another command already moved the order to a newer version", async () => {
    // The contact edit takes the order from version 1 to 2 through its own aggregate, so the
    // lines command's own aggregate at version 1 is still free: only the order's version stops it.
    const { order, item } = await seedOrder();
    await executeManualOrderEdit(context, {
      orderId: order.id,
      expectedVersion: 1,
      idempotencyKey: "contact-edit-first",
      address: "Moved on address 1",
    });

    await expect(
      executeManualOrderLinesEdit(
        context,
        linesCommand(order.id, "lines-after-contact-edit", [{ id: item.id, quantity: 9 }], 1),
      ),
    ).rejects.toThrow(/Order .* version conflict: expected 1, current 2/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
  });

  it("refuses an order that already holds stock", async () => {
    const { order, item } = await seedOrder();
    await db.order.update({ where: { id: order.id }, data: { inventoryState: "reserved" } });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-reserved", [{ id: item.id, quantity: 9 }])),
    ).rejects.toThrow(/holds stock/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
  });

  it("answers not found for a deleted order", async () => {
    const { order, item } = await seedOrder();
    await db.order.update({ where: { id: order.id }, data: { deletedAt: new Date() } });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-deleted", [{ id: item.id, quantity: 9 }])),
    ).rejects.toThrow(/not found/i);
  });

  it("records a timeline entry and an audit row that carry counts and totals, never product names", async () => {
    const { order, item } = await seedOrder();
    const { product: extra } = await seedProduct("SECRET-PRODUCT-NAME", 1800);

    await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-ledger", [
        { id: item.id, quantity: 3 },
        { productId: extra.id, quantity: 1 },
      ]),
    );

    const changes = await db.orderChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ actionType: "edit", status: "confirmed" });
    const payload = changes[0]?.payload ?? "";
    expect(payload).not.toContain("SECRET-PRODUCT-NAME");
    expect(JSON.parse(payload)).toMatchObject({
      linesEdited: true,
      added: 1,
      removed: 0,
      changed: 1,
      itemCountFrom: 1,
      itemCountTo: 2,
      totalFrom: 5600,
      totalTo: 7500 + 1800 + 600,
      orderVersion: 2,
    });
    const audit = JSON.stringify(await db.auditLog.findFirstOrThrow());
    expect(audit).not.toContain("SECRET-PRODUCT-NAME");
    expect(audit).toContain("order.manual.lines.edited.v1");
  });

  it("the confirmation that follows reserves the corrected quantities", async () => {
    const { order, item, product } = await seedOrder({ stock: 10, quantity: 2 });
    await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-then-confirm", [{ id: item.id, quantity: 4 }]),
    );

    const confirmed = await executeManualOrderDecision(context, {
      orderId: order.id,
      decision: "confirm",
      expectedVersion: 2,
      idempotencyKey: "confirm-after-lines-edit",
    });

    expect(confirmed.result).toMatchObject({ status: "confirmed", version: 3 });
    const reservations = await db.$queryRawUnsafe<Array<{ quantity: number | bigint; productId: string }>>(
      'SELECT "productId", "quantity" FROM "InventoryReservation"',
    );
    expect(reservations.map((row) => [row.productId, Number(row.quantity)])).toEqual([[product.id, 4]]);
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({ stock: 6 });
  });

  it("a confirmation opened on the old version is refused after the lines changed", async () => {
    const { order, item } = await seedOrder();
    await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-before-old-confirm", [{ id: item.id, quantity: 4 }]),
    );
    await expect(
      executeManualOrderDecision(context, {
        orderId: order.id,
        decision: "confirm",
        expectedVersion: 1,
        idempotencyKey: "confirm-on-version-before-lines",
      }),
    ).rejects.toThrow(/version conflict/i);
  });
});

/**
 * NEW-ORDER-LINES-OTHER-SOURCES: a pending order from WhatsApp, a CSV/XLSX import, the AI chat (once submitted) or the local
 * storefront holds no stock either (createCanonicalSourceOrder writes inventoryState "unreserved" and nothing else), so the seller
 * may correct its lines. These orders are created through the real intake command, not seeded by hand.
 */
describe("editing the lines of a pending order that came from another source", () => {
  const sourceContext = (source: Parameters<typeof sourceBusinessPrincipal>[0]) => ({
    prisma: db as never,
    businessPrincipal: sourceBusinessPrincipal(source, "lines-test"),
  });

  async function intake(
    source: Parameters<typeof sourceBusinessPrincipal>[0],
    options: { sourceDetails?: Record<string, unknown>; initialStatus?: "pending" | "draft"; unitPrice?: number } = {},
  ) {
    const { product } = await seedProduct(`Source product ${source}`, 2500);
    const created = await createCanonicalSourceOrder(sourceContext(source), {
      idempotencyKey: `intake-${source}-${sequence}`,
      source,
      sourceIdentity: "lines-test",
      sourceOrderId: `order-${source}-${sequence}`,
      ...(options.sourceDetails ? { sourceDetails: options.sourceDetails } : {}),
      ...(options.initialStatus ? { initialStatus: options.initialStatus } : {}),
      newCustomer: { name: "Source customer", phone: "05 55 12 34 56", wilaya: "Alger", commune: "Alger Centre", address: "1 Source Street" },
      items: [{ productId: product.id, quantity: 2, ...(options.unitPrice !== undefined ? { unitPrice: options.unitPrice } : {}) }],
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "1 Source Street",
      phone: "05 55 12 34 56",
      deliveryCost: 600,
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: created.result.order.id }, include: { items: true } });
    return { order, item: order.items[0] as (typeof order.items)[number], product };
  }

  it.each(["whatsapp", "csv", "xlsx", "storefront"] as const)(
    "edits the lines of a pending %s order, holds no stock, and the confirmation reserves the new quantity",
    async (source) => {
      const { order, item, product } = await intake(source);
      expect(order).toMatchObject({ status: "pending", inventoryState: "unreserved", version: 1 });
      const commandsBefore = await count("BusinessCommand");

      const edited = await executeManualOrderLinesEdit(context, linesCommand(order.id, `lines-${source}`, [{ id: item.id, quantity: 5 }]));

      expect(edited.result).toMatchObject({ orderId: order.id, version: 2 });
      expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 5, total: 12_500 });
      expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ totalPrice: 12_500 + 600, version: 2 });
      expect(await count("BusinessCommand")).toBe(commandsBefore + 1);
      expect(await count("InventoryReservation")).toBe(0);
      expect(await count("InventoryMovement")).toBe(0);
      expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stock: 20 });

      const confirmed = await executeManualOrderDecision(context, {
        orderId: order.id,
        decision: "confirm",
        expectedVersion: 2,
        idempotencyKey: `confirm-after-lines-${source}`,
      });
      expect(confirmed.result).toMatchObject({ status: "confirmed", version: 3 });
      const reservations = await db.$queryRawUnsafe<Array<{ quantity: number | bigint }>>('SELECT "quantity" FROM "InventoryReservation"');
      expect(reservations.map((row) => Number(row.quantity))).toEqual([5]);
      expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stock: 15 });
    },
  );

  it("edits an AI-chat order only after the draft was submitted: a draft is refused as not pending", async () => {
    const { order, item } = await intake("ai_chat", { initialStatus: "draft" });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-ai-draft", [{ id: item.id, quantity: 5 }])),
    ).rejects.toThrow(/requires pending status/i);

    const submitted = await submitCanonicalSourceDraft(context, {
      orderId: order.id,
      expectedVersion: order.version,
      idempotencyKey: "submit-ai-draft-for-lines",
    });
    expect(submitted.result).toMatchObject({ status: "pending" });

    const edited = await executeManualOrderLinesEdit(
      context,
      linesCommand(order.id, "lines-ai-pending", [{ id: item.id, quantity: 5 }], submitted.result.version),
    );
    expect(edited.result).toMatchObject({ orderId: order.id, version: submitted.result.version + 1 });
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 5 });
    expect(await count("InventoryReservation")).toBe(0);
  });

  it.each([
    ["shopify", { unitPrice: 3000 }],
    ["woocommerce", { unitPrice: 3000 }],
    ["youcan", { unitPrice: 3000 }],
    ["google_sheets", {}],
    ["storefront", { sourceDetails: { hostedDelegationAuthority: "v1", hostedReleaseId: "release-00000001" } }],
    ["storefront", { sourceDetails: { hostedDelegationAuthority: "v1", hostedReleaseId: "x" } }],
  ] as const)("still refuses a pending %s order (%j) with the coded 409 and writes nothing", async (source, options) => {
    const { order, item } = await intake(source, options);
    const commandsBefore = await count("BusinessCommand");
    const failure = await executeManualOrderLinesEdit(context, linesCommand(order.id, `lines-refused-${source}`, [{ id: item.id, quantity: 9 }])).then(
      () => null,
      (error: unknown) => error as { code?: string; statusCode?: number },
    );
    expect(failure).toMatchObject({ code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE", statusCode: 409 });
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
    expect(await count("BusinessCommand")).toBe(commandsBefore);
  });

  it.each([["reserved"], [null]] as const)("keeps the stock guard for a WhatsApp order whose inventory state is %s", async (state) => {
    const { order, item } = await intake("whatsapp");
    await db.order.update({ where: { id: order.id }, data: { inventoryState: state } });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, `lines-wa-${state}`, [{ id: item.id, quantity: 9 }])),
    ).rejects.toThrow(/holds stock or has no inventory state/i);
    expect(await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ quantity: 2 });
  });

  it.each([
    ["no metadata", null],
    ["the manual authority on another source", trustedManualOrderSourceMetadata()],
    ["a metadata source that differs from the order source", canonicalSourceOrderSourceMetadata({ source: "csv", sourceIdentity: "x", sourceOrderId: "y" })],
    ["metadata that is not JSON", "not-json"],
  ] as const)("refuses a WhatsApp order with %s", async (_label, sourceMetadata) => {
    const { order, item } = await intake("whatsapp");
    await db.order.update({ where: { id: order.id }, data: { sourceMetadata } });
    await expect(
      executeManualOrderLinesEdit(context, linesCommand(order.id, "lines-wa-meta", [{ id: item.id, quantity: 9 }])),
    ).rejects.toMatchObject({ code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE" });
  });
});
