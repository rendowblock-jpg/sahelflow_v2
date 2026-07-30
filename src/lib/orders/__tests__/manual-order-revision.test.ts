process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { ServiceContext } from "@/lib/data/service-base";
import { db, shopContext } from "@/lib/db";
import { trustedManualOrderSourceMetadata } from "../manual-order-authority";
import { reviseTrustedManualOrder } from "../manual-order-revision";

const context = { prisma: db, shop: shopContext } satisfies ServiceContext;

beforeEach(cleanDb);
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function seedPendingTrustedOrder() {
  const customer = await rawDb.customer.create({
    data: {
      name: "Revision Customer",
      phone: "0555000901",
      nameBlindIndex: "revision-customer",
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Original address",
    },
  });
  return rawDb.order.create({
    data: {
      orderNumber: "REVISION-001",
      status: "pending",
      version: 1,
      customerId: customer.id,
      totalPrice: 1000,
      deliveryCost: 0,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Original address",
      phone: "0555000901",
      source: "manual",
      sourceMetadata: trustedManualOrderSourceMetadata(),
      items: {
        create: [{
          productName: "Snapshot item",
          quantity: 1,
          unitPrice: 1000,
          total: 1000,
        }],
      },
    },
  });
}

describe("trusted manual revision", () => {
  it("commits one encrypted expected-version edit and rejects a stale second tab", async () => {
    const order = await seedPendingTrustedOrder();

    const first = await reviseTrustedManualOrder(context, order.id, {
      expectedVersion: 1,
      address: "Committed address",
      notes: "Committed note",
    });
    expect(first).toMatchObject({
      version: 2,
      address: "Committed address",
      notes: "Committed note",
    });

    const encrypted = await rawDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { address: true, notes: true },
    });
    expect(encrypted.address).not.toBe("Committed address");
    expect(encrypted.notes).not.toBe("Committed note");
    expect(encrypted.address).toContain("ciphertext");
    expect(encrypted.notes).toContain("ciphertext");

    await expect(
      reviseTrustedManualOrder(context, order.id, {
        expectedVersion: 1,
        address: "Stale overwrite",
      }),
    ).rejects.toThrow(/version conflict|changed while/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      version: 2,
      address: "Committed address",
      notes: "Committed note",
    });
  });

  it("normalizes and encrypts Algerian phones while rejecting invalid revisions", async () => {
    const order = await seedPendingTrustedOrder();

    const updated = await reviseTrustedManualOrder(context, order.id, {
      expectedVersion: 1,
      phone: "05 55 00 09 02",
    });
    expect(updated.phone).toBe("0555000902");

    const encrypted = await rawDb.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { phone: true },
    });
    expect(encrypted.phone).not.toBe("0555000902");
    expect(encrypted.phone).toContain("ciphertext");

    await expect(
      reviseTrustedManualOrder(context, order.id, {
        expectedVersion: 2,
        phone: "abc",
      }),
    ).rejects.toThrow(/invalid algerian phone/i);

    expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({
      version: 2,
      phone: "0555000902",
    });
  });

  it("rejects compatibility rows from the trusted revision command", async () => {
    const order = await seedPendingTrustedOrder();
    await rawDb.order.update({
      where: { id: order.id },
      data: { sourceMetadata: null },
    });

    await expect(
      reviseTrustedManualOrder(context, order.id, {
        expectedVersion: 1,
        notes: "Not governed",
      }),
    ).rejects.toThrow(/trusted manual orders/i);
  });
});
