/**
 * E2E: Setup + Login flows.
 *
 * The login test is the golden path — it assumes a seeded DB (PIN 12345678).
 * The setup test requires a FRESH DB (no PIN set) — run it against an unseeded
 * environment, or it will redirect to /login and fail.
 */
import { test, expect } from "@playwright/test";

test.describe("Login flow", () => {
  test("user can log in with the PIN", async ({ page }) => {
    // Seeded DB: setup is done, PIN is 12345678.
    await page.goto("/login");
    // Wait for React hydration + the /api/auth/status redirect check to settle.
    await page.waitForLoadState("networkidle");

    const pinInput = page.locator("#pin");
    await pinInput.waitFor({ state: "visible" });
    await pinInput.fill("12345678");

    // Wait for the submit button to be enabled (disabled while pin.length < 1).
    const submit = page.locator('button[type="submit"]');
    await submit.waitFor({ state: "visible" });
    // Brief pause for React to re-render and flip the disabled flag off.
    await page.waitForTimeout(300);
    await submit.click({ force: true });

    // Should redirect to dashboard or onboarding.
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });
});

test.describe("Setup flow", () => {
  // NOTE: this test requires a FRESH (unseeded) DB. On a seeded DB the app
  // redirects /setup → /login, so the setup form is never shown. Run with a
  // wiped DB: `rm data/shops/dev.db && bunx prisma db push` before this test.
  test("user can set up a PIN and reach the dashboard", async ({ page }) => {
    await page.goto("/setup");
    await page.waitForLoadState("networkidle");

    // If already set up, the page redirects to /login — skip gracefully.
    if (page.url().includes("/login")) {
      test.skip(true, "DB already set up — /setup redirected to /login");
    }

    const pinInput = page.locator('input[type="password"]').first();
    await pinInput.waitFor({ state: "visible" });
    await pinInput.fill("12345678");

    const confirmInput = page.locator('input[type="password"]').nth(1);
    if (await confirmInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmInput.fill("12345678");
    }

    const submit = page.locator('button[type="submit"]');
    await page.waitForTimeout(300);
    await submit.click({ force: true });

    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/(dashboard|onboarding)/);
  });
});
