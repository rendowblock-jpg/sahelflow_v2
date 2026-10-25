/**
 * E2E: Orders — view the list, create a manual order, confirm it.
 *
 * Auth: no login here. playwright.config.ts loads the owner session saved by
 * phase5-owner-auth.setup.ts (SF_PHASE5_OWNER_STORAGE_STATE) into every test
 * context, so the request fixture is already authenticated.
 *
 * A manual order is created already "pending" and is confirmed through the
 * governed decision command (PATCH /status refuses these orders).
 */
import { test, expect } from "@playwright/test";

import {
  confirmOrder,
  createCustomer,
  createManualOrder,
  createProduct,
  uniquePhone,
} from "./helpers/core-loop";

test.describe("Orders", () => {
  test("user can view the orders page", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("user can create an order via API", async ({ request }) => {
    const suffix = Date.now().toString().slice(-6);
    const product = await createProduct(request, {
      name: `E2E Orders Product ${suffix}`,
      sku: `E2E-ORD-${suffix}`,
      price: 2500,
      stock: 10,
    });
    const customer = await createCustomer(request, {
      name: "E2E Test Customer",
      phone: uniquePhone(),
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Test",
    });
    const order = await createManualOrder(request, {
      customerId: customer.id,
      productId: product.id,
      quantity: 1,
      unitPrice: 2500,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Test",
      phone: customer.phone,
      deliveryCost: 0,
    });
    expect(order.orderNumber).toBeTruthy();
  });

  test("user can transition order status", async ({ request }) => {
    const suffix = Date.now().toString().slice(-6);
    const product = await createProduct(request, {
      name: `E2E Transition Product ${suffix}`,
      sku: `E2E-TRN-${suffix}`,
      price: 2500,
      stock: 10,
    });
    const customer = await createCustomer(request, {
      name: "E2E Transition Customer",
      phone: uniquePhone(),
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Test",
    });
    const order = await createManualOrder(request, {
      customerId: customer.id,
      productId: product.id,
      quantity: 1,
      unitPrice: 2500,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Test",
      phone: customer.phone,
      deliveryCost: 0,
    });

    // pending -> confirmed through the governed decision command.
    const version = await confirmOrder(request, order.id, order.version);
    expect(version).toBe(order.version + 1);
  });
});
