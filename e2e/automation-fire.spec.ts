/**
 * E2E: Automation fire — create rule + trigger it → log entry.
 *
 * Tests the automation engine end-to-end: create a "order.confirmed →
 * send_notification" automation, create + confirm an order, verify the
 * automation fired (an AutomationLog row appears on the /automations page).
 *
 * Pattern: page.request fast-seeds the automation rule + the order's
 * customer. Then the API creates the order (status=draft), transitions it
 * to pending → confirmed — the `order.confirmed` trigger fires
 * fire-and-forget after orderService.updateStatus commits. The /automations
 * page is then visited to verify the "Recent activity" card shows a log
 * entry for our automation.
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

test.describe("Automation fire", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create order.confirmed → send_notification rule + confirm order → log entry", async ({
    page,
  }) => {
    // ── 1. Fast-seed: create the automation rule via API ───────────────────
    const automationName = `E2E Notify on Confirm ${Date.now().toString().slice(-6)}`;
    const autoRes = await page.request.post("/api/automations", {
      data: {
        name: automationName,
        trigger: "order.confirmed",
        action: "send_notification",
        isActive: true,
      },
    });
    expect(autoRes.ok()).toBeTruthy();
    const automation = (await autoRes.json()).automation as { id: string; name: string };
    expect(automation.id).toBeTruthy();

    // ── 2. UI: visit /automations — the new automation appears in the list ─
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(automationName, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 3. Fast-seed: a customer + an order (status=draft) ─────────────────
    const phoneSuffix = Date.now().toString().slice(-6);
    const custRes = await page.request.post("/api/customers", {
      data: {
        name: `E2E Auto Customer ${phoneSuffix}`,
        phone: `0555${phoneSuffix}`,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Automation Street",
      },
    });
    expect(custRes.ok()).toBeTruthy();
    const customer = (await custRes.json()).customer as { id: string; phone: string };

    const orderRes = await page.request.post("/api/orders", {
      data: {
        customerId: customer.id,
        items: [
          {
            productId: null,
            productName: `E2E Auto Product ${phoneSuffix}`,
            quantity: 1,
            unitPrice: 2000,
          },
        ],
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Automation Street",
        phone: customer.phone,
        source: "manual",
        deliveryCost: 500,
      },
    });
    expect(orderRes.ok()).toBeTruthy();
    const order = (await orderRes.json()).order as { id: string; orderNumber: string };

    // ── 4. Transition draft → pending → confirmed (fires order.confirmed) ──
    const pendingRes = await page.request.patch(`/api/orders/${order.id}/status`, {
      data: { status: "pending" },
    });
    expect(pendingRes.ok()).toBeTruthy();

    const confirmedRes = await page.request.patch(`/api/orders/${order.id}/status`, {
      data: { status: "confirmed" },
    });
    expect(confirmedRes.ok()).toBeTruthy();

    // ── 5. Wait for the fire-and-forget trigger to flush ───────────────────
    // The automation engine dispatches asynchronously after orderService commits.
    // A short wait + reload gives the AutomationLog row time to be written.
    await page.waitForTimeout(1500);

    // ── 6. UI: visit /automations — log entry should appear in Recent Activity ─
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // The "Recent activity" card lists the last 10 AutomationLog entries with
    // the automation name + status dot. Poll up to 10s for our automation name
    // to appear in the activity list (the trigger is async).
    await expect
      .poll(
        async () => {
          // The activity card renders automation names in font-medium spans.
          const activityNames = await page
            .locator(".divide-y .font-medium")
            .allTextContents();
          return activityNames.includes(automationName);
        },
        { timeout: 10_000, intervals: [1_000] },
      )
      .toBeTruthy();

    // ── 7. API spot-check: an AutomationLog row exists for our automation ──
    // (Sanity check that the UI rendering reflects real DB state.)
    const logsRes = await page.request.get("/api/automations");
    expect(logsRes.ok()).toBeTruthy();
    // The /api/automations GET returns the automations list; we already
    // verified the log entry via the UI above. The runCount on the automation
    // row should now be ≥ 1.
    const autosData = (await logsRes.json()) as {
      automations: Array<{ id: string; runCount: number }>;
    };
    const ourAuto = autosData.automations.find((a) => a.id === automation.id);
    expect(ourAuto).toBeDefined();
    if (!ourAuto) throw new Error("automation not found — unreachable after expect");
    expect(ourAuto.runCount).toBeGreaterThanOrEqual(1);
  });
});
