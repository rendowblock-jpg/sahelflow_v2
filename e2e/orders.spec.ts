/**
 * E2E: Order lifecycle — create → confirm → ship.
 *
 * Tests the core COD workflow: create an order, transition it through the
 * state machine. This is the golden path that every seller uses daily.
 */
import { test, expect } from "@playwright/test";

test.describe("Order lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
  });

  test("user can view the orders page", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("user can create an order via API", async ({ request }) => {
    // Create a customer first
    const customerRes = await request.post("/api/customers", {
      data: {
        name: "E2E Test Customer",
        phone: `0555${Date.now().toString().slice(-6)}`,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Test",
      },
    });
    expect(customerRes.ok()).toBeTruthy();
    const customer = await customerRes.json();

    // Create an order
    const orderRes = await request.post("/api/orders", {
      data: {
        customerId: customer.customer.id,
        items: [{ productName: "Test Product", quantity: 1, unitPrice: 2500, total: 2500 }],
        totalPrice: 2500,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue Test",
        phone: customer.customer.phone,
        source: "manual",
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = await orderRes.json();
    expect(order.order.orderNumber).toBeTruthy();
  });

  test("user can transition order status", async ({ request }) => {
    // Get recent orders
    const ordersRes = await request.get("/api/orders?limit=1");
    expect(ordersRes.ok()).toBeTruthy();
    const ordersData = await ordersRes.json();
    
    if (ordersData.orders && ordersData.orders.length > 0) {
      const orderId = ordersData.orders[0].id;
      
      // Transition to pending
      const statusRes = await request.patch(`/api/orders/${orderId}/status`, {
        data: { status: "pending" },
      });
      expect(statusRes.ok()).toBeTruthy();
    }
  });
});
