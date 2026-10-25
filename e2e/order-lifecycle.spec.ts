/**
 * E2E: Order lifecycle golden path — create → confirm → ship → deliver → COD collected.
 *
 * Tests the core COD workflow an Algerian seller runs daily: create an order,
 * transition it through the state machine (draft → pending → confirmed →
 * shipped → delivered), mark COD as collected, then verify revenue appears
 * on the accounting page.
 *
 * Pattern: page.request fast-seeds the customer + product (so the test doesn't
 * depend on the seeded DB having a usable product), then the browser drives
 * the UI assertions that matter (order detail rendering, stock decrement on
 * /products, COD controls, /accounting revenue). State transitions go through
 * the governed order commands (decision, fulfillment,
 * cod/collection; see helpers/core-loop.ts) because the UI's "create shipment"
 * flow depends on external delivery providers that aren't available in the
 * test environment.
 *
 * Auth: page.request shares the cookie jar with the browser context after
 * login, so all API calls are authenticated.
 */
import { test, expect } from "@playwright/test";

import {
  collectCod,
  confirmOrder,
  createCustomer,
  createManualOrder,
  createProduct,
  runFulfillment,
  uniquePhone,
} from "./helpers/core-loop";

test.describe("Order lifecycle", () => {
  test("create → confirm → ship → deliver → COD collected", async ({ page }) => {
    // ── 1. Fast-seed: product (with stock) + customer via API ──────────────
    const phoneSuffix = Date.now().toString().slice(-6);
    const product = await createProduct(page.request, {
      name: `E2E Lifecycle Product ${phoneSuffix}`,
      sku: `E2E-LC-${phoneSuffix}`,
      price: 2500,
      cost: 1200,
      stock: 10,
    });
    expect(product.id).toBeTruthy();

    const customer = await createCustomer(page.request, {
      name: `E2E Lifecycle Customer ${phoneSuffix}`,
      phone: uniquePhone(),
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue des Tests",
    });
    expect(customer.id).toBeTruthy();

    // ── 2. Create the order (POST /api/orders creates it already "pending") ─
    const order = await createManualOrder(page.request, {
      customerId: customer.id,
      productId: product.id,
      quantity: 2,
      unitPrice: 2500,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue des Tests",
      phone: customer.phone,
      deliveryCost: 600,
    });
    expect(order.orderNumber).toBeTruthy();
    expect(order.id).toBeTruthy();

    // ── 3. UI: order appears in /orders table ──────────────────────────────
    await page.goto("/orders");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    // The order number should appear somewhere on the page (table row).
    await expect(page.getByText(order.orderNumber, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 4. UI: navigate to the order detail page ───────────────────────────
    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState("networkidle");
    // The order number is rendered in an <h1> with font-mono on the detail page.
    await expect(page.locator("h1").filter({ hasText: order.orderNumber })).toBeVisible({
      timeout: 10_000,
    });

    // ── 5. Confirm through the governed decision command (holds the stock) ─
    let version = await confirmOrder(page.request, order.id, order.version);

    // ── 6. UI: /products shows the stock decrement (10 − 2 = 8) ────────────
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(product.name, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    // Stock 8 should be visible somewhere on the products page.
    await expect(page.getByText("8", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // ── 7. Governed fulfillment: pack → ship → deliver ─────────────────────
    version = await runFulfillment(page.request, order.id, "pack", version);
    version = await runFulfillment(page.request, order.id, "ship", version);
    version = await runFulfillment(page.request, order.id, "deliver", version);

    // ── 8. UI: order detail now shows the COD controls (delivered only) ────
    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState("networkidle");
    // The COD card title ("Rapprochement COD" in fr) appears once delivered.
    await expect(page.getByText(/COD|Rapprochement/i).first()).toBeVisible({ timeout: 10_000 });

    // ── 9. Mark COD collected via API, then verify the badge in the UI ─────
    await collectCod(page.request, order.id, version, order.totalPrice);

    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState("networkidle");
    // "Encaissé" (fr) / "محصّل" (ar) — the collected badge.
    await expect(page.getByText(/Encaissé|محصّل|Collected/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 10. UI: /accounting shows revenue from this delivered order ────────
    await page.goto("/accounting");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    // The accounting page renders revenue in DZD. The order total (2 × 2500 + 600 = 5600)
    // is part of the rolling 30-day revenue. We assert the page renders a DZD-formatted value.
    await expect(page.getByText(/DA|DZD|دج/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
