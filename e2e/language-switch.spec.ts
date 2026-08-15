/**
 * E2E: Language switch — FR → AR (RTL) → FR (LTR).
 *
 * This gate proves both the live hydrated transition and the durable server
 * request authority. A reload is no longer allowed to hide a shell that only
 * converges after restart.
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

async function expectShellSide(page: Page, direction: "ltr" | "rtl") {
  await expect(page.locator('[data-sahelflow-shell="desktop"]')).toHaveAttribute(
    "data-locale-dir",
    direction,
    { timeout: 8_000 },
  );
  const navigation = await page
    .locator('[data-shell-region="navigation"]')
    .boundingBox();
  const workspace = await page
    .locator('[data-shell-region="workspace"]')
    .boundingBox();
  expect(navigation).not.toBeNull();
  expect(workspace).not.toBeNull();
  if (!navigation || !workspace) return;

  if (direction === "rtl") {
    expect(navigation.x).toBeGreaterThan(workspace.x);
  } else {
    expect(navigation.x).toBeLessThan(workspace.x);
  }
}

test.describe("Language switch", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("FR (LTR) → Arabic (RTL) → back to FR (LTR) without restart-only convergence", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expectShellSide(page, "ltr");

    const langTrigger = page
      .getByRole("button", { name: /^FR$/i })
      .first();
    await langTrigger.waitFor({ state: "visible", timeout: 5_000 });
    await langTrigger.click();

    const arabicOption = page.getByRole("menuitem", { name: /العربية/ }).first();
    await arabicOption.waitFor({ state: "visible", timeout: 5_000 });
    await arabicOption.click();

    const cookies = await page.context().cookies();
    const localeCookie = cookies.find((cookie) => cookie.name === "sahelflow-locale");
    expect(localeCookie?.value).toBe("ar");

    // Critical regression contract: the already-open application must converge
    // without a manual reload or process restart.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 8_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar", {
      timeout: 8_000,
    });
    await expectShellSide(page, "rtl");
    await expect(page.getByText("لوحة التحكم", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Reload only after live convergence has already been proven, to verify the
    // locale cookie also seeds the next server-rendered document correctly.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expectShellSide(page, "rtl");

    const langTriggerAfterAr = page
      .getByRole("button", { name: /^AR$/i })
      .first();
    await langTriggerAfterAr.waitFor({ state: "visible", timeout: 5_000 });
    await langTriggerAfterAr.click();

    const frenchOption = page.getByRole("menuitem", { name: /Français/ }).first();
    await frenchOption.waitFor({ state: "visible", timeout: 5_000 });
    await frenchOption.click();

    const cookiesAfter = await page.context().cookies();
    const localeCookieAfter = cookiesAfter.find(
      (cookie) => cookie.name === "sahelflow-locale",
    );
    expect(localeCookieAfter?.value).toBe("fr");

    await expect(page.locator("html")).toHaveAttribute("dir", "ltr", {
      timeout: 8_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "fr", {
      timeout: 8_000,
    });
    await expectShellSide(page, "ltr");
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
