/**
 * E2E: durable automation execution.
 *
 * Creates a real seller-safe `order.confirmed → add customer note` definition,
 * confirms an order through the public API, then waits for the background
 * automation worker to materialize and complete the definition-bound run.
 * No provider mock or fire-and-forget log projection is used as passing truth.
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

test.describe("Automation durable execution", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("order.confirmed runs a seller-safe database action to terminal completion", async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-7);
    const automationName = `E2E Confirm Note ${suffix}`;
    const noteText = `E2E confirmed {{orderNumber}} / ${suffix}`;

    const autoRes = await page.request.post("/api/automations", {
      data: {
        name: automationName,
        trigger: "order.confirmed",
        action: "tag_customer",
        isActive: true,
        dryRun: false,
        config: { noteText },
        steps: [
          {
            action: "tag_customer",
            onFailure: "stop",
            config: { noteText },
          },
        ],
        conditions: null,
        maxRetries: 2,
        retryDelayMs: 500,
      },
    });
    expect(autoRes.ok()).toBeTruthy();
    const automation = (await autoRes.json()).automation as {
      id: string;
      name: string;
    };

    try {
      await page.goto("/automations?tab=my");
      await page.waitForLoadState("networkidle");
      await expect(
        page.locator(`[data-automation-card="${automation.id}"]`),
      ).toBeVisible({ timeout: 10_000 });

      const custRes = await page.request.post("/api/customers", {
        data: {
          name: `E2E Auto Customer ${suffix}`,
          phone: `0555${suffix}`,
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "1 Automation Street",
        },
      });
      expect(custRes.ok()).toBeTruthy();
      const customer = (await custRes.json()).customer as {
        id: string;
        phone: string;
      };

      const orderRes = await page.request.post("/api/orders", {
        data: {
          customerId: customer.id,
          items: [
            {
              productId: null,
              productName: `E2E Auto Product ${suffix}`,
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
      const order = (await orderRes.json()).order as { id: string };

      const pendingRes = await page.request.patch(`/api/orders/${order.id}/status`, {
        data: { status: "pending" },
      });
      expect(pendingRes.ok()).toBeTruthy();

      const confirmedRes = await page.request.patch(`/api/orders/${order.id}/status`, {
        data: { status: "confirmed" },
      });
      expect(confirmedRes.ok()).toBeTruthy();

      await expect
        .poll(
          async () => {
            const response = await page.request.get("/api/automations");
            if (!response.ok()) return 0;
            const body = (await response.json()) as {
              automations: Array<{
                id: string;
                runCount: number;
                latestRun?: { status?: string } | null;
              }>;
            };
            const current = body.automations.find(
              (candidate) => candidate.id === automation.id,
            );
            return current?.runCount ?? 0;
          },
          { timeout: 15_000, intervals: [500, 1_000, 2_000] },
        )
        .toBeGreaterThanOrEqual(1);

      const finalState = await page.request.get("/api/automations");
      expect(finalState.ok()).toBeTruthy();
      const finalBody = (await finalState.json()) as {
        automations: Array<{
          id: string;
          latestRun?: { status?: string } | null;
        }>;
      };
      expect(
        finalBody.automations.find((candidate) => candidate.id === automation.id)
          ?.latestRun?.status,
      ).toBe("succeeded");
    } finally {
      await page.request.delete(`/api/automations/${automation.id}`);
    }
  });
});
