import { expect, test, type Page, type TestInfo } from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

const LTR_ROUTES = [
  "/dashboard",
  "/orders",
  "/orders/confirmation-queue",
  "/customers",
  "/products",
  "/deliveries",
  "/returns",
  "/accounting",
  "/accounting/cod-reconciliation",
  "/analytics",
  "/risk",
  "/imports",
  "/inbox",
  "/automations",
  "/agents",
  "/storefronts",
  "/settings",
  "/profile",
] as const;

const RTL_ROUTES = [
  "/dashboard",
  "/orders",
  "/customers",
  "/products",
  "/deliveries",
  "/returns",
  "/accounting",
  "/analytics",
  "/risk",
  "/inbox",
  "/settings",
] as const;

function screenshotName(prefix: string, route: string): string {
  const slug = route === "/" ? "root" : route.slice(1).replaceAll("/", "-");
  return `${prefix}-${slug}.png`;
}

async function assertRenderedRoute(
  page: Page,
  route: string,
  testInfo: TestInfo,
  prefix: string,
) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should return a document response`).not.toBeNull();
  expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
  await page.locator("body").waitFor({ state: "visible" });
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText("Application error");

  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    geometry.documentWidth,
    `${route} must not overflow the 1366px application viewport`,
  ).toBeLessThanOrEqual(geometry.width + 1);
  expect(
    geometry.bodyWidth,
    `${route} body must remain contained inside the application viewport`,
  ).toBeLessThanOrEqual(geometry.width + 1);

  await page.screenshot({
    path: testInfo.outputPath(screenshotName(prefix, route)),
    fullPage: false,
    animations: "disabled",
  });
}

async function ensureOwnerSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"));
  } else if (page.url().includes("/setup")) {
    throw new Error("Representative Phase 5 evidence requires the rich seeded owner authority");
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/dashboard");
}

test.describe.serial("Phase 5 desktop experience evidence", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test("LTR operational routes fit the desktop workbench with representative data", async ({
    page,
  }, testInfo) => {
    await ensureOwnerSession(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    for (const route of LTR_ROUTES) {
      await assertRenderedRoute(page, route, testInfo, "phase5-ltr");
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("owner login works from a fresh browser context", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/dashboard");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(page.url()).toContain("/dashboard");
  });

  test("Arabic RTL operational routes preserve logical geometry", async ({
    page,
    context,
  }, testInfo) => {
    await context.addCookies([
      {
        name: "sahelflow-locale",
        value: "ar",
        url: "http://localhost:3000",
      },
    ]);
    await ensureOwnerSession(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    for (const route of RTL_ROUTES) {
      await assertRenderedRoute(page, route, testInfo, "phase5-rtl");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
  });
});
