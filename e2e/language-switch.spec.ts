/**
 * E2E: Language switch — FR → AR (RTL) → FR (LTR).
 *
 * This gate proves both the live hydrated transition and the durable server
 * request authority. A reload is no longer allowed to hide a shell that only
 * converges after restart. It also deliberately slows the RSC refresh so stale
 * server-rendered route copy cannot leak under the newly selected locale.
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

async function waitForHydration(page: Page): Promise<void> {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function login(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  if (!page.url().includes("/login")) return;

  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
  await waitForHydration(page);
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

async function installSlowDashboardRefresh(page: Page, delayMs = 1_200) {
  await page.route("**/dashboard**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rsc = request.headers()["rsc"] === "1" || url.searchParams.has("_rsc");
    if (url.pathname === "/dashboard" && rsc) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.continue();
  });
}

async function expectPendingWorkspaceOccluded(page: Page) {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-locale-transition", "pending");
  await expect(page.locator("#main-content > *").first()).toBeHidden();
}

test.describe("Language switch", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("FR (LTR) → Arabic (RTL) → back to FR (LTR) without mixed server copy or restart-only convergence", async ({ page }) => {
    test.setTimeout(90_000);

    // App readiness is hydration + the actual work surface, not global network
    // idleness. SahelFlow intentionally owns long-lived/background browser work,
    // so networkidle can remain false while the application is fully usable.
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expectShellSide(page, "ltr");

    await installSlowDashboardRefresh(page);

    const langTrigger = page
      .getByRole("button", { name: /^Français$/i })
      .first();
    await langTrigger.waitFor({ state: "visible", timeout: 5_000 });
    await langTrigger.click();

    const arabicOption = page.getByRole("menuitem", { name: /العربية/ }).first();
    await arabicOption.waitFor({ state: "visible", timeout: 5_000 });
    await arabicOption.click();

    const cookies = await page.context().cookies();
    const localeCookie = cookies.find((cookie) => cookie.name === "sahelflow-locale");
    expect(localeCookie?.value).toBe("ar");

    // The shell/client authority changes immediately, while the deliberately
    // delayed server tree remains occluded rather than exposing mixed FR/AR copy.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 2_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar", {
      timeout: 2_000,
    });
    await expectShellSide(page, "rtl");
    await expectPendingWorkspaceOccluded(page);
    await expect(
      page.getByText("Tableau de bord", { exact: false }).first(),
    ).not.toBeVisible();

    await expect(page.locator("html")).not.toHaveAttribute(
      "data-locale-transition",
      "pending",
      { timeout: 12_000 },
    );
    await expect(page.getByText("لوحة التحكم", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.unroute("**/dashboard**");

    // Reload only after live convergence has already been proven, to verify the
    // locale cookie also seeds the next server-rendered document correctly.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expectShellSide(page, "rtl");

    await installSlowDashboardRefresh(page);
    const langTriggerAfterAr = page
      .getByRole("button", { name: /^العربية$/ })
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
      timeout: 2_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "fr", {
      timeout: 2_000,
    });
    await expectShellSide(page, "ltr");
    await expectPendingWorkspaceOccluded(page);
    await expect(page.getByText("لوحة التحكم", { exact: false }).first()).not.toBeVisible();

    await expect(page.locator("html")).not.toHaveAttribute(
      "data-locale-transition",
      "pending",
      { timeout: 12_000 },
    );
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.unroute("**/dashboard**");
  });
});
