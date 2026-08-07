import { expect, test } from "@playwright/test";

const OWNER_PIN = "24681357";
const DESKTOP = { width: 1366, height: 768 };

async function assertViewportContained(page: import("@playwright/test").Page) {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.width + 1);
}

test.describe.serial("Phase 5 fresh install and login evidence", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test("fresh install presents setup and establishes the owner session", async ({
    page,
  }, testInfo) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/setup");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await assertViewportContained(page);
    await page.screenshot({
      path: testInfo.outputPath("phase5-auth-setup.png"),
      animations: "disabled",
    });

    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator("#confirmPin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/" || url.pathname === "/dashboard",
      { timeout: 30_000 },
    );
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/dashboard");
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("the configured owner can authenticate from a fresh browser context", async ({
    page,
  }, testInfo) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => url.pathname === "/login");
    await assertViewportContained(page);
    await page.screenshot({
      path: testInfo.outputPath("phase5-auth-login.png"),
      animations: "disabled",
    });

    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(
      (url) => url.pathname === "/" || url.pathname === "/dashboard",
      { timeout: 30_000 },
    );
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/dashboard");
  });
});
