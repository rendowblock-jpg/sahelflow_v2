/**
 * E2E: Return + refund — money fact + no double-counting (Phase 1 bug 1.1
 * regression guard + B7-3 return-completion gate).
 *
 * Tests the post-delivery COD return scenario: deliver an order, create a
 * return request, issue the full-settling refund (which pairs the compensation
 * money fact with the delivered→returned physical transition), then complete
 * the Return row (a no-op transition that records the physical fact).
 *
 * Stock is restored EXACTLY once + customer.totalSpent is decremented
 * EXACTLY once — never double-applied, and never reversed without a money
 * fact (INV-023, B7-3: refund-type return completion on a delivered order is
 * refused with RETURN_COMPLETION_REQUIRES_REFUND_FACT).
 *
 * Pattern: page.request fast-seeds a product (stock=10) + customer + order,
 * transitions it to delivered (stock → 8, customer.totalSpent → 5000). Then
 * the API creates + approves a Return, issues the full refund (stock → 10,
 * customer.totalSpent → 0, order.status → "returned"), and completes the
 * Return row (no-op). The /returns + /orders/[id] pages are visited to
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

  test("deliver → refund → return-completion: stock + stats correct", async ({ page }) => {
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

    // ── 3. Create + approve a Return via API ─────────────────────────────
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

    const approveRes = await page.request.patch(`/api/returns/${returnRecord.id}`, {
      data: { status: "approved" },
    });
    expect(approveRes.ok()).toBeTruthy();

    // ── 4. B7-3 gate: completing a refund-type return on a delivered order
    // is refused — the money fact must come first (INV-023) ─────────────
    const prematureCompleteRes = await page.request.patch(`/api/returns/${returnRecord.id}`, {
      data: { status: "completed" },
    });
    expect(prematureCompleteRes.status()).toBe(409);
    expect(((await prematureCompleteRes.json()) as { code: string }).code).toBe(
      "RETURN_COMPLETION_REQUIRES_REFUND_FACT",
    );

    // ── 5. Issue the full-settling refund via API — the governed
    // delivered→returned path with the compensation money fact ──────────
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

    // ── 6. Verify stock restored EXACTLY once (back to 10) + customer stats
    // The refund's physical-return transition restored stock + reversed
    // customer.totalSpent (identity-bound facts).
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
    // reversed by the full-settling refund → 0. NOT -10000.
    expect(custAfterReturn.totalSpent).toBe(0);

    // ── 7. Complete the Return row — order is already "returned", so the
    // transition is a no-op that records the physical fact ──────────────
    const completeRes = await page.request.patch(`/api/returns/${returnRecord.id}`, {
      data: { status: "completed", notes: "E2E test completion" },
    });
    expect(completeRes.ok()).toBeTruthy();

    // ── 8. Verify stock + stats STILL unchanged after completion (no double-count)
    const prodAfterRefund = (await (await page.request.get(`/api/products`)).json()).products as Array<{
      id: string;
      stock: number;
    }>;
    const productAfterRefund = prodAfterRefund.find((p) => p.id === product.id);
    expect(productAfterRefund).toBeDefined();
    if (!productAfterRefund) throw new Error("product not found — unreachable after expect");
    expect(productAfterRefund.stock).toBe(10); // unchanged from after-refund

    const custAfterRefund = (
      await (await page.request.get(`/api/customers/${customer.id}`)).json()
    ).customer as { totalSpent: number; orderCount: number };
    expect(custAfterRefund.totalSpent).toBe(0); // unchanged — completion didn't re-reverse

    // ── 9. UI: /returns page shows the return entry ────────────────────
    await page.goto("/returns");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // ── 10. UI: /orders/[id] shows "returned" status ───────────────────
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
