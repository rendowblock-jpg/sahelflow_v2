process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  canonicalSourceOrderSourceMetadata,
  trustedManualOrderSourceMetadata,
} from "../manual-order-authority";
import { executeManualOrderDecision } from "../manual-confirmation";
import { executeManualOrderEdit } from "../manual-order-edit";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;
let sequence = 0;

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await db.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await db.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await db.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await db.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await db.$executeRawUnsafe('DELETE FROM "DomainEvent"');
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
    deliveryCost?: number;
    totalPrice?: number;
    sourceMetadata?: string | null;
    source?: string;
    stock?: number;
    quantity?: number;
  } = {},
) {
  sequence += 1;
  const category = await db.category.create({
    data: { name: `Edit category ${sequence}` },
  });
  const product = await db.product.create({
    data: {
      name: `Edit product ${sequence}`,
      price: 2500,
      stock: options.stock ?? 10,
      lowStockThreshold: 1,
      isActive: true,
      categoryId: category.id,
    },
  });
  const customer = await db.customer.create({
    data: {
      name: `Edit customer ${sequence}`,
      phone: `edit-customer-phone-${sequence}`,
      nameBlindIndex: `edit-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Customer address",
    },
  });
  const quantity = options.quantity ?? 2;
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-EDIT-${sequence}`,
      status: options.status ?? "pending",
      version: 1,
      customerId: customer.id,
      totalPrice: options.totalPrice ?? 2500 * quantity + (options.deliveryCost ?? 600),
      deliveryCost: options.deliveryCost ?? 600,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "12 rue Didouche Mourad",
      phone: "0550123456",
      notes: "first note",
      source: options.source ?? "manual",
      sourceMetadata:
        options.sourceMetadata === undefined
          ? trustedManualOrderSourceMetadata()
          : options.sourceMetadata,
      items: {
        create: [
          {
            productId: product.id,
            productName: "Edit product",
            quantity,
            unitPrice: 2500,
            total: 2500 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
  return { order, product, customer };
}

function edit(
  orderId: string,
  key: string,
  fields: Record<string, unknown>,
  expectedVersion = 1,
) {
  return {
    orderId,
    expectedVersion,
    idempotencyKey: key,
    correlationId: `${key}-correlation`,
    ...fields,
  };
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("canonical order edit before confirmation (S03a-03)", () => {
  it("changes the contact fields, bumps the version and writes every fact", async () => {
    const { order, product } = await seedOrder();

    const result = await executeManualOrderEdit(
      context,
      edit(order.id, "edit-contact-success", {
        address: "7 boulevard Zighoud Youcef",
        phone: "0661 22 33 44",
        commune: "Bab El Oued",
        notes: "call before 5pm",
      }),
    );

    expect(result).toMatchObject({ replayed: false, aggregateVersion: 1 });
    expect(result.result).toMatchObject({
      orderId: order.id,
      status: "pending",
      version: 2,
      changed: ["address", "commune", "notes", "phone"],
    });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({
      status: "pending",
      version: 2,
      address: "7 boulevard Zighoud Youcef",
      phone: "0661223344",
      commune: "Bab El Oued",
      notes: "call before 5pm",
      wilaya: "Alger",
      deliveryCost: 600,
      totalPrice: 5600,
    });
    // Nothing else moved: same lines, no stock, no reservation, same customer.
    expect(await db.orderItem.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 10,
    });
    expect(await count("InventoryReservation")).toBe(0);
    expect(await count("InventoryMovement")).toBe(0);
    expect(
      await db.customer.findUniqueOrThrow({ where: { id: order.customerId } }),
    ).toMatchObject({ address: "Customer address", commune: "Alger Centre" });
    // The five facts of the golden write.
    expect(await count("BusinessAggregateVersion")).toBe(1);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await count("AuditLog")).toBe(1);
    expect(await count("DomainEvent")).toBe(1);
    expect(await count("ProjectionInvalidation")).toBeGreaterThanOrEqual(2);
  });

  it("records an 'edit' timeline entry that carries no address, phone or note text", async () => {
    const { order } = await seedOrder();
    await executeManualOrderEdit(
      context,
      edit(order.id, "edit-timeline-entry", {
        address: "SECRET-ADDRESS-TEXT",
        phone: "0771234567",
        notes: "SECRET-NOTE-TEXT",
      }),
    );

    const changes = await db.orderChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ actionType: "edit", status: "confirmed" });
    const payload = changes[0]!.payload ?? "";
    expect(payload).not.toContain("SECRET-ADDRESS-TEXT");
    expect(payload).not.toContain("SECRET-NOTE-TEXT");
    expect(payload).not.toContain("0771234567");
    expect(JSON.parse(payload)).toMatchObject({
      addressChanged: true,
      phoneChanged: true,
      notesChanged: true,
      orderVersion: 2,
    });

    const audit = await db.auditLog.findFirstOrThrow();
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain("SECRET-ADDRESS-TEXT");
    expect(auditText).not.toContain("SECRET-NOTE-TEXT");
    expect(auditText).not.toContain("0771234567");
  });

  it("moves the total by exactly the delivery-cost difference", async () => {
    // The stored total carries 700 of legacy drift (items 5000 + delivery 600 = 5600).
    const { order } = await seedOrder({ totalPrice: 6300, deliveryCost: 600 });

    const result = await executeManualOrderEdit(
      context,
      edit(order.id, "edit-delivery-cost", { deliveryCost: 900 }),
    );

    expect(result.result).toMatchObject({
      version: 2,
      deliveryCost: 900,
      totalPrice: 6600,
      changed: ["deliveryCost"],
    });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({
      deliveryCost: 900,
      totalPrice: 6600,
    });
    expect(JSON.parse((await db.orderChange.findFirstOrThrow()).payload ?? "{}")).toMatchObject({
      deliveryCostFrom: 600,
      deliveryCostTo: 900,
    });
  });

  it("can clear the notes", async () => {
    const { order } = await seedOrder();
    const result = await executeManualOrderEdit(
      context,
      edit(order.id, "edit-clear-notes", { notes: null }),
    );
    expect(result.result.changed).toEqual(["notes"]);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).notes).toBeNull();
  });

  it("replays the exact command without a second write", async () => {
    const { order } = await seedOrder();
    const input = edit(order.id, "edit-replay-key", { address: "New address 1" });

    const first = await executeManualOrderEdit(context, input);
    const replay = await executeManualOrderEdit(context, input);

    expect(replay).toEqual({ ...first, replayed: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(2);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses a stale version and writes nothing", async () => {
    const { order } = await seedOrder();
    await executeManualOrderEdit(
      context,
      edit(order.id, "edit-first", { address: "First change" }),
    );

    await expect(
      executeManualOrderEdit(
        context,
        edit(order.id, "edit-stale", { address: "Second change" }, 1),
      ),
    ).rejects.toThrow(/version conflict/i);

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ address: "First change", version: 2 });
    expect(await count("BusinessCommand")).toBe(1);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("lets only one of two simultaneous edits at the same version win", async () => {
    const { order } = await seedOrder();
    const outcomes = await Promise.allSettled([
      executeManualOrderEdit(context, edit(order.id, "edit-race-a", { address: "Address A" })),
      executeManualOrderEdit(context, edit(order.id, "edit-race-b", { address: "Address B" })),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.version).toBe(2);
    expect(["Address A", "Address B"]).toContain(after.address);
    expect(await count("BusinessCommand")).toBe(1);
    expect(await db.orderChange.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("makes a confirmation that was opened on the old version fail, so nobody confirms what they did not see", async () => {
    const { order } = await seedOrder();
    await executeManualOrderEdit(
      context,
      edit(order.id, "edit-before-confirm", { address: "Corrected address" }),
    );

    await expect(
      executeManualOrderDecision(context, {
        orderId: order.id,
        decision: "confirm",
        expectedVersion: 1,
        idempotencyKey: "confirm-on-old-version",
      }),
    ).rejects.toThrow(/version conflict/i);

    const confirmed = await executeManualOrderDecision(context, {
      orderId: order.id,
      decision: "confirm",
      expectedVersion: 2,
      idempotencyKey: "confirm-on-new-version",
    });
    expect(confirmed.result).toMatchObject({ status: "confirmed", version: 3 });
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).address,
    ).toBe("Corrected address");
  });

  it.each(["confirmed", "cancelled", "shipped", "delivered"])(
    "refuses to edit a %s order",
    async (status) => {
      const { order } = await seedOrder({ status });

      await expect(
        executeManualOrderEdit(
          context,
          edit(order.id, `edit-status-${status}`, { address: "Too late" }),
        ),
      ).rejects.toThrow(/requires pending status/i);

      expect(
        (await db.order.findUniqueOrThrow({ where: { id: order.id } })).address,
      ).toBe("12 rue Didouche Mourad");
      expect(await count("BusinessCommand")).toBe(0);
    },
  );

  it("edits a hosted storefront order's contact without touching its lines", async () => {
    const { order } = await seedOrder({
      source: "storefront",
      sourceMetadata: canonicalSourceOrderSourceMetadata({
        source: "storefront",
        sourceIdentity: "shop-a",
        sourceOrderId: "receipt-1",
      }),
    });

    const result = await executeManualOrderEdit(
      context,
      edit(order.id, "edit-storefront-order", { wilaya: "Oran", commune: "Es Senia" }),
    );

    expect(result.result).toMatchObject({ version: 2, changed: ["commune", "wilaya"] });
    expect(await db.orderItem.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuses a legacy order: this command governs canonical orders only", async () => {
    const { order } = await seedOrder({ sourceMetadata: null });

    await expect(
      executeManualOrderEdit(context, edit(order.id, "edit-legacy", { address: "x y" })),
    ).rejects.toThrow(/only governs/i);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("answers not found for a deleted order", async () => {
    const { order } = await seedOrder();
    await db.order.update({ where: { id: order.id }, data: { deletedAt: new Date() } });

    await expect(
      executeManualOrderEdit(context, edit(order.id, "edit-deleted", { address: "x y" })),
    ).rejects.toThrow(/not found/i);
  });

  it("refuses an edit that changes nothing and keeps the version", async () => {
    const { order } = await seedOrder();

    await expect(
      executeManualOrderEdit(
        context,
        edit(order.id, "edit-nothing", { address: "12 rue Didouche Mourad", deliveryCost: 600 }),
      ),
    ).rejects.toThrow(/nothing to change/i);

    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(1);
    expect(await count("BusinessCommand")).toBe(0);
  });

  it("rejects fields it does not govern (lines, totals, status) instead of ignoring them", async () => {
    const { order } = await seedOrder();
    for (const extra of [
      { items: [] },
      { totalPrice: 1 },
      { status: "confirmed" },
    ]) {
      await expect(
        executeManualOrderEdit(
          context,
          edit(order.id, "edit-unknown-field", { address: "Some address", ...extra }),
        ),
      ).rejects.toThrow();
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(1);
  });

  it("rejects an empty edit and an invalid phone without writing", async () => {
    const { order } = await seedOrder();

    await expect(
      executeManualOrderEdit(context, edit(order.id, "edit-empty-body", {})),
    ).rejects.toThrow();
    await expect(
      executeManualOrderEdit(context, edit(order.id, "edit-bad-phone", { phone: "12345" })),
    ).rejects.toThrow(/invalid algerian phone/i);
    await expect(
      executeManualOrderEdit(context, edit(order.id, "edit-neg-cost", { deliveryCost: -5 })),
    ).rejects.toThrow();

    expect(await count("BusinessCommand")).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).version).toBe(1);
  });
});
