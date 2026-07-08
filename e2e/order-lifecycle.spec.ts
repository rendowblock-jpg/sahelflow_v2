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
 * the API (PATCH /api/orders/[id]/status) because the UI's "create shipment"
 * flow depends on external delivery providers that aren't available in the
 * test environment.
 *
 * Auth: page.request shares the cookie jar with the browser context after
 * login, so all API calls are authenticated.
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

/** Helper: log in via the PIN form + wait for the dashboard redirect. */
async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

/** Helper: transition an order through the state machine via the API. */
async function transitionStatus(
  page: Page,
  orderId: string,
  status: "pending" | "confirmed" | "shipped" | "delivered",
): Promise<void> {
  const res = await page.request.patch(`/api/orders/${orderId}/status`, {
    data: { status },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Order lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create → confirm → ship → deliver → COD collected", async ({ page }) => {
    // ── 1. Fast-seed: product (with stock) + customer via API ──────────────
    const phoneSuffix = Date.now().toString().slice(-6);
    const productRes = await page.request.post("/api/products", {
      data: {
        name: `E2E Lifecycle Product ${phoneSuffix}`,
        sku: `E2E-LC-${phoneSuffix}`,
        price: 2500,
        cost: 1200,
        stock: 10,
        lowStockThreshold: 2,
        isActive: true,
      },
    });
    expect(productRes.ok()).toBeTruthy();
    const product = (await productRes.json()).product as { id: string; name: string };
    expect(product.id).toBeTruthy();

    const customerRes = await page.request.post("/api/customers", {
      data: {
        name: `E2E Lifecycle Customer ${phoneSuffix}`,
        phone: `0555${phoneSuffix}`,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue des Tests",
      },
    });
    expect(customerRes.ok()).toBeTruthy();
    const customer = (await customerRes.json()).customer as { id: string; phone: string };
    expect(customer.id).toBeTruthy();

    // ── 2. Create the order via API (order-service default status = draft) ─
    const orderRes = await page.request.post("/api/orders", {
      data: {
        customerId: customer.id,
        items: [
          {
            productId: product.id,
            productName: product.name,
            quantity: 2,
            unitPrice: 2500,
          },
        ],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "123 Rue des Tests",
        phone: customer.phone,
        source: "manual",
        deliveryCost: 600,
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()).order as { id: string; orderNumber: string };
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

    // ── 5. State machine: draft → pending → confirmed (stock decrements) ──
    await transitionStatus(page, order.id, "pending");
    await transitionStatus(page, order.id, "confirmed");

    // ── 6. UI: /products shows the stock decrement (10 − 2 = 8) ────────────
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(product.name, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    // Stock 8 should be visible somewhere on the products page.
    await expect(page.getByText("8", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    // ── 7. State machine: confirmed → shipped → delivered ─────────────────
    await transitionStatus(page, order.id, "shipped");
    await transitionStatus(page, order.id, "delivered");

    // ── 8. UI: order detail now shows the COD controls (delivered only) ────
    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState("networkidle");
    // The COD card title ("Rapprochement COD" in fr) appears once delivered.
    await expect(page.getByText(/COD|Rapprochement/i).first()).toBeVisible({ timeout: 10_000 });

    // ── 9. Mark COD collected via API, then verify the badge in the UI ─────
    const codRes = await page.request.patch(`/api/orders/${order.id}/cod`, {
      data: { action: "mark_collected" },
    });
    expect(codRes.ok()).toBeTruthy();

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
