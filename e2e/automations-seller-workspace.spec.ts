import { expect, test, type Page } from "@playwright/test";

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

test.describe("Automations seller workspace", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("opens the seller-first When / If / Then builder", async ({ page }) => {
    await page.goto("/automations");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator('[data-automation-workspace="seller-v2"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-automation-builder="when-if-then"]'),
    ).toBeVisible();

    await page.locator('[data-automation-create="true"]').first().click();

    await expect(page.locator("#automation-name-v2")).toBeVisible();
    await expect(page.locator("#automation-trigger-v2")).toBeVisible();
    await expect(page.locator("#automation-retries-v2")).not.toBeVisible();

    const advanced = page.locator("details").filter({
      has: page.locator("#automation-retries-v2"),
    });
    await advanced.locator("summary").click();
    await expect(page.locator("#automation-retries-v2")).toBeVisible();
    await expect(page.locator("#automation-delay-v2")).toBeVisible();
  });

  test("editing preserves the complete durable definition instead of reopening defaults", async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-7);
    const name = `E2E Seller Automation ${suffix}`;
    const message = `E2E {{orderNumber}} / {{totalPrice}} / ${suffix}`;
    const response = await page.request.post("/api/automations", {
      data: {
        name,
        trigger: "order.confirmed",
        action: "send_whatsapp",
        config: { messageTemplate: message },
        steps: [
          {
            action: "send_whatsapp",
            onFailure: "continue",
            config: { messageTemplate: message },
          },
        ],
        conditions: {
          all: [
            {
              field: "totalPrice",
              operator: "greater_than",
              value: 7000,
            },
          ],
        },
        isActive: true,
        dryRun: true,
        maxRetries: 4,
        retryDelayMs: 1700,
      },
    });
    expect(response.ok()).toBeTruthy();
    const automation = (await response.json()).automation as { id: string };

    try {
      await page.goto("/automations?tab=my");
      await page.waitForLoadState("networkidle");

      const card = page.locator(
        `[data-automation-card="${automation.id}"]`,
      );
      await expect(card).toBeVisible();
      await expect(card).toContainText(name);

      await card.locator(`[data-automation-edit="${automation.id}"]`).click();

      await expect(page.locator("#automation-name-v2")).toHaveValue(name);
      await expect(page.locator("textarea").first()).toHaveValue(message);

      const advanced = page.locator("details").filter({
        has: page.locator("#automation-retries-v2"),
      });
      await advanced.locator("summary").click();
      await expect(page.locator("#automation-retries-v2")).toHaveValue("4");
      await expect(page.locator("#automation-delay-v2")).toHaveValue("1700");
    } finally {
      await page.request.delete(`/api/automations/${automation.id}`);
    }
  });
});
