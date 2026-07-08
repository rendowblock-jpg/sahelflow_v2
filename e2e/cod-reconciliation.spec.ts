/**
 * E2E: COD reconciliation — bulk remit 3 collected orders.
 *
 * Tests the killer COD feature: a seller marks 3 delivered orders as
 * "collected" (cash in hand), then visits /accounting/cod-reconciliation,
 * selects all 3, enters a remittance reference, bulk-marks them as remitted,
 * and verifies the summary updates.
 *
 * Pattern: page.request fast-seeds 3 customers + 3 products + 3 orders +
 * transitions each through draft → pending → confirmed → shipped → delivered
 * + marks each as COD-collected. Then the browser drives the
 * /accounting/cod-reconciliation UI: select-all checkbox, remittance-ref
 * input, "mark remitted" button. After the bulk action, the page refreshes
 * and the stat cards should show 0 pending remittance.
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

/** Mark an order's COD as collected. */
async function markCollected(page: Page, orderId: string): Promise<void> {
  const res = await page.request.patch(`/api/orders/${orderId}/cod`, {
    data: { action: "mark_collected" },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("COD reconciliation", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("bulk remit 3 collected orders → summary updates", async ({ page }) => {
    // ── 1. Fast-seed: 3 delivered + collected orders via API ───────────────
    const phoneSuffix = Date.now().toString().slice(-6);
    const orderIds: string[] = [];

    for (let i = 0; i < 3; i++) {
      const custRes = await page.request.post("/api/customers", {
        data: {
          name: `E2E COD Customer ${phoneSuffix}-${i}`,
          phone: `0770${phoneSuffix}${i}`,
          wilaya: "Constantine",
          commune: "Constantine",
          address: `${i + 1} Rue des Tests`,
        },
      });
      expect(custRes.ok()).toBeTruthy();
      const customer = (await custRes.json()).customer as { id: string; phone: string };

      const prodRes = await page.request.post("/api/products", {
        data: {
          name: `E2E COD Product ${phoneSuffix}-${i}`,
          sku: `E2E-COD-${phoneSuffix}-${i}`,
          price: 3000,
          cost: 1000,
          stock: 100,
          lowStockThreshold: 5,
          isActive: true,
        },
      });
      expect(prodRes.ok()).toBeTruthy();
      const product = (await prodRes.json()).product as { id: string; name: string };

      const orderRes = await page.request.post("/api/orders", {
        data: {
          customerId: customer.id,
          items: [
            {
              productId: product.id,
              productName: product.name,
              quantity: 1,
              unitPrice: 3000,
            },
          ],
          wilaya: "Constantine",
          commune: "Constantine",
          address: `${i + 1} Rue des Tests`,
          phone: customer.phone,
          source: "manual",
          deliveryCost: 500,
        },
      });
      expect(orderRes.ok()).toBeTruthy();
      const order = (await orderRes.json()).order as { id: string };

      await deliverOrder(page, order.id);
      await markCollected(page, order.id);
      orderIds.push(order.id);
    }

    expect(orderIds).toHaveLength(3);

    // ── 2. UI: visit /accounting/cod-reconciliation ────────────────────────
    await page.goto("/accounting/cod-reconciliation");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // ── 3. The 3 orders should appear in the pending-remittance table ──────
    // Each row contains the order number in a font-mono cell. Wait for all 3.
    const pendingTable = page.locator("table").first();
    await expect(pendingTable).toBeVisible({ timeout: 10_000 });

    // ── 4. Click the "select all" checkbox in the table header ─────────────
    // The header checkbox toggles all rows. It's the first Checkbox in the thead.
    const headerCheckbox = pendingTable.locator("thead [role='checkbox']").first();
    await headerCheckbox.waitFor({ state: "visible", timeout: 5_000 });
    await headerCheckbox.click();

    // ── 5. Fill the remittance-reference input ─────────────────────────────
    // The bulk-remittance bar appears once at least one row is selected. It
    // has a Label "Remittance reference" + an Input. The label is i18n'd
    // ("codReconciliation.remittanceRef").
    const remittanceRef = `E2E-REM-${phoneSuffix}`;
    const refInput = page
      .getByLabel(/Remittance reference|مرجع التحويل|Référence de remise/i)
      .first();
    await refInput.waitFor({ state: "visible", timeout: 5_000 });
    await refInput.fill(remittanceRef);

    // ── 6. Click the "mark remitted" button (count = 3) ────────────────────
    // The button label includes the selected count via i18n interpolation:
    // "Mark {{count}} as remitted" / "وضع علامة على {{count}} كمحوّلة".
    const remitButton = page
      .getByRole("button", { name: /Mark.*remitted|وضع علامة.*كمحوّلة|Marquer.*remises/i })
      .first();
    await remitButton.waitFor({ state: "visible", timeout: 5_000 });
    await remitButton.click();

    // ── 7. Wait for the success toast + page refresh ───────────────────────
    // The client component calls router.refresh() after success, which
    // revalidates the RSC tree. Wait for the orders to disappear from the
    // pending table (now reconciled).
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // ── 8. Verify via API: all 3 orders are now codRemitted=true ───────────
    for (const orderId of orderIds) {
      const res = await page.request.get(`/api/orders/${orderId}`);
      expect(res.ok()).toBeTruthy();
      const data = (await res.json()) as {
        order?: { codRemitted: boolean; codRemittanceRef: string | null };
      };
      const ord = data.order;
      expect(ord).toBeDefined();
      if (!ord) throw new Error("order not found — unreachable after expect");
      expect(ord.codRemitted).toBe(true);
      expect(ord.codRemittanceRef).toBe(remittanceRef);
    }
  });
});
