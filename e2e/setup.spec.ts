/**
 * E2E: Setup flow — first-run PIN creation.
 *
 * Tests the initial setup: visit /setup, enter a PIN, verify redirect to
 * dashboard. This is the first golden path — without setup, nothing works.
 */
import { test, expect } from "@playwright/test";

test.describe("Setup flow", () => {
  test("user can set up a PIN and reach the dashboard", async ({ page }) => {
    await page.goto("/setup");

    // Enter PIN (min 8 chars)
    await page.fill('input[type="password"]', "12345678");
    
    // If there's a confirm field, fill it too
    const confirmInput = page.locator('input[type="password"]').nth(1);
    if (await confirmInput.isVisible()) {
      await confirmInput.fill("12345678");
    }

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard or onboarding
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });
});

test.describe("Login flow", () => {
  test("user can log in with the PIN", async ({ page }) => {
    // Assuming setup has already been done (previous test or seeded DB)
    await page.goto("/login");

    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });
});
