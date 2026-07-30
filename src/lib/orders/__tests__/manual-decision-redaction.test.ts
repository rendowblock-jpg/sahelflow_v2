process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { TRUSTED_MANUAL_ORDER_AUTHORITY } from "../manual-order-authority";
import { executeManualOrderDecision } from "../manual-confirmation";

const db = new PrismaClient();
const context = { prisma: db as never } satisfies ServiceContext;

async function clean(): Promise<void> {
  await db.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await db.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
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
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.customer.deleteMany();
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe("manual decision ledger redaction", () => {
  it("does not store a free-form address from a rejection reason in plaintext", async () => {
    const category = await db.category.create({ data: { name: "Redaction" } });
    const product = await db.product.create({
      data: {
        name: "Redaction Product",
        price: 1000,
        stock: 10,
        categoryId: category.id,
        isActive: true,
      },
    });
    const customer = await db.customer.create({
      data: {
        name: "Redaction Customer",
        phone: "0555000999",
        nameBlindIndex: "redaction-customer",
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "12 Secret Street",
      },
    });
    const order = await db.order.create({
      data: {
        orderNumber: "ORD-REDACT-1",
        status: "pending",
        version: 1,
        customerId: customer.id,
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "12 Secret Street",
        phone: "0555000999",
        source: "manual",
        sourceMetadata: JSON.stringify({
          authority: TRUSTED_MANUAL_ORDER_AUTHORITY,
        }),
        items: {
          create: [{
            productId: product.id,
            productName: product.name,
            quantity: 1,
            unitPrice: 1000,
            total: 1000,
          }],
        },
      },
    });

    await executeManualOrderDecision(context, {
      orderId: order.id,
      decision: "reject",
      expectedVersion: 1,
      idempotencyKey: "manual-reject-redaction-0001",
      reason: "12 Secret Street",
    });

    const change = await db.orderChange.findFirst({
      where: { orderId: order.id, actionType: "status_change" },
      orderBy: { createdAt: "desc" },
    });
    expect(change?.payload).toBeTruthy();
    expect(change?.payload).not.toContain("12 Secret Street");
    expect(change?.payload).toContain("[REDACTED]");
  });
});
