process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { orderService } from "@/lib/data/order-service";
import type { ServiceContext } from "@/lib/data/service-base";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import { trustedManualOrderSourceMetadata } from "@/lib/orders/manual-order-authority";

const context = { prisma: rawDb as never } satisfies ServiceContext;
let sequence = 0;

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function createCustomer(label: string) {
  sequence += 1;
  return rawDb.customer.create({
    data: {
      name: `${label} ${sequence}`,
      phone: `0557${String(sequence).padStart(6, "0")}`,
      nameBlindIndex: `${label.toLowerCase()}-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Permit test address",
    },
  });
}

describe("legacy stock restoration permit", () => {
  it("restores a compatibility order while another order keeps an active reservation", async () => {
    sequence += 1;
    const category = await rawDb.category.create({
      data: { name: `Permit Category ${sequence}` },
    });
    const product = await rawDb.product.create({
      data: {
        name: `Permit Product ${sequence}`,
        price: 1800,
        stock: 8,
        lowStockThreshold: 1,
        categoryId: category.id,
        isActive: true,
      },
    });

    const canonicalCustomer = await createCustomer("Canonical Customer");
    const canonicalOrder = await rawDb.order.create({
      data: {
        orderNumber: `PERMIT-CANONICAL-${sequence}`,
        status: "pending",
        version: 1,
        customerId: canonicalCustomer.id,
        totalPrice: 1800,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Canonical permit address",
        phone: canonicalCustomer.phone,
        source: "manual",
        sourceMetadata: trustedManualOrderSourceMetadata(),
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            productVariantName: null,
            quantity: 1,
            unitPrice: 1800,
            total: 1800,
          },
        },
      },
    });

    await executeManualOrderDecision(context, {
      orderId: canonicalOrder.id,
      decision: "confirm",
      expectedVersion: 1,
      idempotencyKey: `permit-confirm-${sequence}`,
    });

    const legacyCustomer = await createCustomer("Legacy Customer");
    const legacyOrder = await rawDb.order.create({
      data: {
        orderNumber: `PERMIT-LEGACY-${sequence}`,
        status: "confirmed",
        version: 1,
        customerId: legacyCustomer.id,
        totalPrice: 3600,
        deliveryCost: 0,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Legacy permit address",
        phone: legacyCustomer.phone,
        source: "import",
        sourceMetadata: JSON.stringify({
          authority: "legacy-import-compatibility",
        }),
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            productVariantName: null,
            quantity: 2,
            unitPrice: 1800,
            total: 3600,
          },
        },
      },
    });

    expect(
      await rawDb.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({ stock: 7 });

    const cancelled = await orderService.updateStatus(
      context,
      legacyOrder.id,
      "cancelled",
      { actor: "user" },
    );

    expect(cancelled.status).toBe("cancelled");
    expect(
      await rawDb.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({ stock: 9 });

    const reservations = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS "total"
      FROM "InventoryReservation"
      WHERE "orderId" = ${canonicalOrder.id}
        AND "state" = 'active'
    `;
    expect(Number(reservations[0]?.total ?? 0)).toBe(1);

    const permits = await rawDb.$queryRaw<Array<{ total: number | bigint }>>`
      SELECT COUNT(*) AS "total"
      FROM "StockAdjustmentPermit"
    `;
    expect(Number(permits[0]?.total ?? 0)).toBe(0);

    await expect(
      rawDb.product.update({
        where: { id: product.id },
        data: { stock: { increment: 1 } },
      }),
    ).rejects.toThrow();
    expect(
      await rawDb.product.findUnique({ where: { id: product.id } }),
    ).toMatchObject({ stock: 9 });
  });
});
