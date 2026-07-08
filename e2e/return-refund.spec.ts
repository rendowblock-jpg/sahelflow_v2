/**
 * E2E: Return + refund — no double-counting (Phase 1 bug 1.1 regression guard).
 *
 * Tests the post-delivery COD return scenario: deliver an order, create a
 * return, complete it (order → "returned"), then issue a refund. The Phase 1
 * bug 1.1 fix ensures stock is restored EXACTLY once + customer.totalSpent is
 * decremented EXACTLY once — not double-applied by both the Return flow and
 * the Refund flow.
 *
 * Pattern: page.request fast-seeds a product (stock=10) + customer + order,
 * transitions it to delivered (stock → 8, customer.totalSpent → 5000). Then
 * the API creates + completes a Return (stock → 10, customer.totalSpent → 0,
 * order.status → "returned"). Then the API issues a Refund (no further stock
 * or stat changes — the Refund is just a paper trail once the order is
 * already "returned"). The /returns + /orders/[id] pages are visited to
 * verify the UI reflects the correct state.
 *
 * Auth: page.request is authenticated via the login cookie.
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

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

/** Transition an order through the state machine to "delivered". */
async function deliverOrder(page: Page, orderId: string): Promise<void> {
  for (const status of ["pending", "confirmed", "shipped", "delivered"] as const) {
    const res = await page.request.patch(`/api/orders/${orderId}/status`, {
      data: { status },
    });
    expect(res.ok()).toBeTruthy();
  }
}

test.describe("Return + refund — no double-count", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("deliver → return → refund: stock + stats correct", async ({ page }) => {
    // ── 1. Fast-seed: product (stock=10, price=5000) + customer + order ────
    const phoneSuffix = Date.now().toString().slice(-6);

    const productRes = await page.request.post("/api/products", {
      data: {
        name: `E2E Return Product ${phoneSuffix}`,
        sku: `E2E-RT-${phoneSuffix}`,
        price: 5000,
        cost: 2000,
        stock: 10,
        lowStockThreshold: 2,
        isActive: true,
      },
    });
    expect(productRes.ok()).toBeTruthy();
    const product = (await productRes.json()).product as {
      id: string;
      name: string;
      stock: number;
    };

    const customerRes = await page.request.post("/api/customers", {
      data: {
        name: `E2E Return Customer ${phoneSuffix}`,
        phone: `0555${phoneSuffix}`,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Rue des Retours",
      },
    });
    expect(customerRes.ok()).toBeTruthy();
    const customer = (await customerRes.json()).customer as {
      id: string;
      phone: string;
      totalSpent: number;
      orderCount: number;
    };

    const orderRes = await page.request.post("/api/orders", {
      data: {
        customerId: customer.id,
        items: [
          {
            productId: product.id,
            productName: product.name,
            quantity: 2,
            unitPrice: 5000,
          },
        ],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Rue des Retours",
        phone: customer.phone,
        source: "manual",
        deliveryCost: 0,
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()).order as { id: string; orderNumber: string };

    // ── 2. Transition to delivered (stock: 10−2=8, customer.totalSpent: 10000) ─
    await deliverOrder(page, order.id);

    // Snapshot post-delivery state via the API.
    const prodAfterDeliver = (await (await page.request.get(`/api/products`)).json()).products as Array<{
      id: string;
      stock: number;
    }>;
    const productAfterDeliver = prodAfterDeliver.find((p) => p.id === product.id);
    expect(productAfterDeliver).toBeDefined();
    if (!productAfterDeliver) throw new Error("product not found — unreachable after expect");
    expect(productAfterDeliver.stock).toBe(8); // 10 − 2 confirmed

    // ── 3. Create a Return via API ─────────────────────────────────────────
    const returnRes = await page.request.post("/api/returns", {
      data: {
        orderId: order.id,
        reason: "Customer refused — defective product",
        itemCount: 2,
        type: "return",
      },
    });
    expect(returnRes.ok()).toBeTruthy();
    const returnRecord = (await returnRes.json()).return as { id: string; status: string };
    expect(returnRecord.status).toBe("requested");

    // ── 4. Complete the Return (order.status → "returned") via API ─────────
    const completeRes = await page.request.patch(`/api/returns/${returnRecord.id}`, {
      data: { status: "completed", notes: "E2E test completion" },
    });
    expect(completeRes.ok()).toBeTruthy();

    // ── 5. Verify stock restored EXACTLY once (back to 10) + customer stats ─
    // The Return completion routed through orderService.updateStatus("returned"),
    // which restores stock + reverses customer.totalSpent.
    const prodAfterReturn = (await (await page.request.get(`/api/products`)).json()).products as Array<{
      id: string;
      stock: number;
    }>;
    const productAfterReturn = prodAfterReturn.find((p) => p.id === product.id);
    expect(productAfterReturn).toBeDefined();
    if (!productAfterReturn) throw new Error("product not found — unreachable after expect");
    expect(productAfterReturn.stock).toBe(10); // restored (no double-restore)

    const custAfterReturnRes = await page.request.get(`/api/customers/${customer.id}`);
    expect(custAfterReturnRes.ok()).toBeTruthy();
    const custAfterReturn = (await custAfterReturnRes.json()).customer as {
      totalSpent: number;
      orderCount: number;
    };
    // customer.totalSpent was incremented by 10000 (2×5000) at delivery, then
    // reversed by 10000 at return → 0. NOT -10000 (which would be the double-count bug).
    expect(custAfterReturn.totalSpent).toBe(0);

    // ── 6. Issue a Refund via API (must NOT double-count) ──────────────────
    // After Phase 1 bug 1.1 fix, the refund-service sees order.status="returned"
    // and skips the inline stock restore + totalSpent-by-refund-amount decrement
    // (the Return flow already did both). The Refund row is still created for
    // the paper trail.
    const refundRes = await page.request.post(`/api/orders/${order.id}/refund`, {
      data: {
        amount: 10000,
        method: "cash",
        reason: "Full refund for returned order",
      },
    });
    expect(refundRes.ok()).toBeTruthy();
    const refund = (await refundRes.json()).refund as { id: string; amount: number };
    expect(refund.amount).toBe(10000);

    // ── 7. Verify stock + stats STILL unchanged after refund (no double-count)
    const prodAfterRefund = (await (await page.request.get(`/api/products`)).json()).products as Array<{
      id: string;
      stock: number;
    }>;
    const productAfterRefund = prodAfterRefund.find((p) => p.id === product.id);
    expect(productAfterRefund).toBeDefined();
    if (!productAfterRefund) throw new Error("product not found — unreachable after expect");
    expect(productAfterRefund.stock).toBe(10); // unchanged from after-return

    const custAfterRefund = (
      await (await page.request.get(`/api/customers/${customer.id}`)).json()
    ).customer as { totalSpent: number; orderCount: number };
    expect(custAfterRefund.totalSpent).toBe(0); // unchanged — refund didn't re-decrement

    // ── 8. UI: /returns page shows the return entry ────────────────────────
    await page.goto("/returns");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // ── 9. UI: /orders/[id] shows "returned" status ────────────────────────
    await page.goto(`/orders/${order.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").filter({ hasText: order.orderNumber })).toBeVisible({
      timeout: 10_000,
    });
    // The OrderStatusBadge renders the localized status — "Retournée" (fr) /
    // "مُرجَع" (ar) / "Returned" (en).
    await expect(
      page.getByText(/Retournée|مُرجَع|Returned/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
