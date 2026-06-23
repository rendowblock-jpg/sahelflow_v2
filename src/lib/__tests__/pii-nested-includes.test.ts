/**
 * Verification test: does the PII encryption extension fire for nested includes?
 *
 * The AAA audit (D-001) claims it does NOT — that `db.order.findUnique({ include: { customer: true } })`
 * returns the nested customer with ciphertext `name` and blind-index `phone`. This test verifies
 * that claim. If the test PASSES (assertion holds), the audit is wrong. If it FAILS, the audit is
 * right and we need to fix the extension.
 *
 * Hermetic: tracks created IDs and cleans up only those in afterAll. Does NOT
 * wipe the dev DB (T-001 from tests-perf audit).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

describe("PII extension — nested includes (D-001 verification)", () => {
  let customerId: string;
  let orderId: string;
  const customerName = `Test Customer ${Date.now()}`;
  const customerPhone = `05${Date.now().toString().slice(-8)}`;

  beforeAll(async () => {
    // Create a customer (extension encrypts on write, decrypts on return)
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

    // Create an order for that customer
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
          create: [{ productName: "Test Product", quantity: 1, unitPrice: 1000, total: 1000 }],
        },
      },
    });
    orderId = order.id;
  });

  afterAll(async () => {
    // Clean up ONLY the records we created — do NOT wipe the dev DB (T-001).
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
    // The critical assertion: nested customer.name should be the PLAINTEXT, not ciphertext
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
  });
});
