/**
 * E2E: Notifications bell — Arabic locale + click → navigate.
 *
 * Tests that the topbar bell icon fetches notifications from /api/notifications,
 * renders them localized (Arabic), and that clicking a notification navigates
 * to its target page.
 *
 * Pattern: page.request fast-seeds a pending order (which triggers a "new
 * order" notification), then the locale cookie is set to "ar" and the
 * dashboard is loaded. The bell is opened, an Arabic notification is
 * asserted, then clicked.
 *
 * DEVIATION FROM PLAN: the plan specified seeding a "stale" order (>2h old)
 * so the stale-queue notification fires and clicking it navigates to
 * /orders/confirmation-queue. The order-create API does not accept a custom
 * `createdAt`, so backdating requires direct DB access (unavailable from
 * Playwright). Instead we seed a fresh pending order (triggers a "new order"
 * notification in /api/notifications), verify the bell shows Arabic text,
 * and click the notification — which navigates to /orders/[id]. The
 * localization + click-navigates assertions are still covered; only the
 * specific destination differs.
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

test.describe("Notifications bell", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Arabic notification appears + click navigates", async ({ page, baseURL }) => {
    // ── 1. Fast-seed: a customer + a pending order (triggers a notification) ─
    const phoneSuffix = Date.now().toString().slice(-6);
    const customerRes = await page.request.post("/api/customers", {
      data: {
        name: `E2E Notif Customer ${phoneSuffix}`,
        phone: `0555${phoneSuffix}`,
        wilaya: "Oran",
        commune: "Oran",
        address: "1 Rue des Notifications",
      },
    });
    expect(customerRes.ok()).toBeTruthy();
    const customer = (await customerRes.json()).customer as { id: string; phone: string };

    const orderRes = await page.request.post("/api/orders", {
      data: {
        customerId: customer.id,
        items: [
          {
            productId: null,
            productName: `E2E Notif Product ${phoneSuffix}`,
            quantity: 1,
            unitPrice: 1500,
          },
        ],
        wilaya: "Oran",
        commune: "Oran",
        address: "1 Rue des Notifications",
        phone: customer.phone,
        source: "manual",
        deliveryCost: 400,
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()).order as { id: string; orderNumber: string };

    // ── 2. Set locale cookie to "ar" so notifications render in Arabic ──────
    const target = baseURL ?? "http://localhost:3000";
    await page.context().addCookies([
      { name: "sahelflow-locale", value: "ar", url: target },
    ]);

    // ── 3. Visit the dashboard so the topbar bell loads ────────────────────
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Give the bell's useEffect fetch + 0ms setTimeout a chance to fire.
    await page.waitForTimeout(1500);

    // ── 4. Click the notifications bell ────────────────────────────────────
    // The bell is in the topbar with `sr-only` text "Notifications" (Arabic: "الإشعارات").
    const bellButton = page.getByRole("button", { name: /الإشعارات|Notifications/i }).first();
    await bellButton.waitFor({ state: "visible", timeout: 10_000 });
    await bellButton.click();

    // ── 5. Assert: a notification with Arabic text appears in the dropdown ─
    // The dropdown items render the notification title (translated server-side
    // via getI18n with locale=ar). Arabic notification titles start with the
    // order number or include Arabic words like "طلب" (order) or "تأكيد" (confirm).
    // We accept any Arabic-character notification in the dropdown.
    const dropdown = page.locator('[role="menu"]').first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // Wait for the API fetch to populate the dropdown (the bell fires its
    // fetch on mount, so by now the dropdown should have items).
    await expect
      .poll(
        async () => {
          const items = await dropdown.locator('[role="menuitem"]').count();
          return items;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);

    // Assert at least one menu item contains an Arabic glyph (U+0600–U+06FF).
    const itemTexts = await dropdown.locator('[role="menuitem"]').allTextContents();
    const hasArabic = itemTexts.some((t) => /[\u0600-\u06FF]/.test(t));
    expect(hasArabic).toBeTruthy();

    // ── 6. Click the notification matching our seeded order ────────────────
    // Notifications link to /orders/[id] for new-order notifications. Find the
    // menuitem whose link href ends with our order id.
    const orderLink = dropdown.locator(`a[href="/orders/${order.id}"]`).first();
    await orderLink.waitFor({ state: "visible", timeout: 5_000 });
    await orderLink.click();

    // ── 7. Assert: navigation to the order detail page ─────────────────────
    await page.waitForURL(new RegExp(`/orders/${order.id}$`), { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1").filter({ hasText: order.orderNumber })).toBeVisible({
      timeout: 10_000,
    });
  });
});
