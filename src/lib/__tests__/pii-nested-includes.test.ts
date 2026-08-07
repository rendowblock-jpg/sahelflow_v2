/**
 * Protected PII extension relation/decryption coverage.
 *
 * Hermetic: tracks created IDs and cleans up only those in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

describe("PII extension — nested includes", () => {
  let customerId: string;
  let orderId: string;
  let orderItemId: string;
  const customerName = `Test Customer ${Date.now()}`;
  const customerPhone = `05${Date.now().toString().slice(-8)}`;

  beforeAll(async () => {
    const customer = await db.customer.create({
      data: {
        name: customerName,
        phone: customerPhone,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Test Address",
      },
    });
    customerId = customer.id;

    const order = await db.order.create({
      data: {
        orderNumber: `TEST-${Date.now()}`,
        status: "draft",
        customer: { connect: { id: customer.id } },
        totalPrice: 1000,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Test Address",
        phone: customerPhone,
        source: "manual",
        items: {
          create: [
            {
              productName: "Test Product",
              quantity: 1,
              unitPrice: 1000,
              total: 1000,
            },
          ],
        },
      },
    });
    orderId = order.id;
    const item = await db.orderItem.findFirst({
      where: { orderId },
      select: { id: true },
    });
    if (!item) throw new Error("test order item was not created");
    orderItemId = item.id;
  });

  afterAll(async () => {
    if (orderId) {
      await db.orderItem.deleteMany({ where: { orderId } });
      await db.order.deleteMany({ where: { id: orderId } });
    }
    if (customerId) {
      await db.customer.deleteMany({ where: { id: customerId } });
    }
  });

  it("top-level customer query returns decrypted data", async () => {
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    expect(customer).not.toBeNull();
    expect(customer!.name).toBe(customerName);
    expect(customer!.phone).toBe(customerPhone);
  });

  it("nested include via order.findUnique returns decrypted customer", async () => {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    expect(order).not.toBeNull();
    expect(order!.customer).toBeDefined();
    expect(order!.customer!.name).toBe(customerName);
    expect(order!.customer!.phone).toBe(customerPhone);
  });

  it("nested include via order.findMany returns decrypted customer", async () => {
    const orders = await db.order.findMany({
      where: { id: orderId },
      include: { customer: { select: { name: true, phone: true } } },
    });
    expect(orders).toHaveLength(1);
    const order = orders[0]!;
    expect(order.customer).toBeDefined();
    expect(order.customer!.name).toBe(customerName);
    expect(order.customer!.phone).toBe(customerPhone);
    expect("id" in order.customer!).toBe(false);
    expect("phoneEnc" in order.customer!).toBe(false);
  });

  it("decrypts and preserves projection through an unprotected relation", async () => {
    const item = await db.orderItem.findUnique({
      where: { id: orderItemId },
      select: {
        productName: true,
        order: {
          select: {
            phone: true,
            customer: { select: { name: true, phone: true } },
          },
        },
      },
    });

    expect(item).toEqual({
      productName: "Test Product",
      order: {
        phone: customerPhone,
        customer: { name: customerName, phone: customerPhone },
      },
    });
    expect("id" in item!.order).toBe(false);
    expect("phoneEnc" in item!.order.customer).toBe(false);
  });

  it("does not expose hidden record identity in protected partial selects", async () => {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { name: true },
    });
    expect(customer).toEqual({ name: customerName });
  });
});
