import { expect, test, type Page, type TestInfo } from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const ROUTE_JOURNEY_TIMEOUT_MS = 180_000;

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

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
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
  await waitForHydration(page);
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

async function loginOwner(page: Page) {
  await waitForHydration(page);
  const pin = page.locator("#pin");
  await pin.fill(OWNER_PIN);
  await expect(pin).toHaveValue(OWNER_PIN);
  const submit = page.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

async function ensureOwnerSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) {
    await loginOwner(page);
  } else if (page.url().includes("/setup")) {
    throw new Error("Representative Phase 5 evidence requires the rich seeded owner authority");
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  expect(page.url()).toContain("/dashboard");
}

async function assertDesktopSidebarEdge(page: Page, direction: "ltr" | "rtl") {
  const sidebar = page.locator('aside[data-navigation-density]').first();
  await expect(sidebar).toBeVisible();
  const box = await sidebar.boundingBox();
  expect(box, "desktop sidebar should have measurable geometry").not.toBeNull();
  if (!box) return;

  if (direction === "ltr") {
    expect(
      Math.abs(box.x),
      "LTR sidebar should remain attached to the left application edge",
    ).toBeLessThanOrEqual(2);
  } else {
    expect(
      Math.abs(box.x + box.width - DESKTOP.width),
      "RTL sidebar should remain attached to the right application edge",
    ).toBeLessThanOrEqual(2);
  }
}

async function selectLocale(
  page: Page,
  currentLocaleLabel: string,
  nextLocaleText: string,
) {
  await page.getByRole("button", { name: currentLocaleLabel }).click();
  const option = page
    .getByRole("menuitem")
    .filter({ hasText: nextLocaleText })
    .first();
  await expect(option).toBeVisible();
  await option.click();
}

test.describe.serial("Phase 5 desktop experience evidence", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
  });

  test("LTR operational routes fit the desktop workbench with representative data", async ({
    page,
  }, testInfo) => {
    test.setTimeout(ROUTE_JOURNEY_TIMEOUT_MS);
    await ensureOwnerSession(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    for (const route of LTR_ROUTES) {
      await assertRenderedRoute(page, route, testInfo, "phase5-ltr");
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("owner login works from a fresh browser context", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await loginOwner(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    expect(page.url()).toContain("/dashboard");
  });

  test("live locale switching keeps copy, document direction and shell edge atomic", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ensureOwnerSession(page);

    const html = page.locator("html");
    const shell = page.locator('[data-sahelflow-shell="desktop"]');
    const desktopSidebar = page.locator('aside[data-navigation-density]').first();

    await expect(html).toHaveAttribute("lang", "fr");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("dir", "ltr");
    await expect(desktopSidebar).toContainText("Tableau de bord");
    await assertDesktopSidebarEdge(page, "ltr");

    await selectLocale(page, "Français", "العربية");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(shell).toHaveAttribute("dir", "rtl");
    await expect(desktopSidebar).toContainText("لوحة التحكم");
    await assertDesktopSidebarEdge(page, "rtl");

    await selectLocale(page, "العربية", "English");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("dir", "ltr");
    await expect(desktopSidebar).toContainText("Dashboard");
    await assertDesktopSidebarEdge(page, "ltr");

    // Repeat the direction flip once more. The installed Internal.14 failure could
    // leave the sidebar stuck on the previous edge only after switching back and
    // forth, so a single cold Arabic boot would not protect this regression.
    await selectLocale(page, "English", "العربية");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(shell).toHaveAttribute("dir", "rtl");
    await expect(desktopSidebar).toContainText("لوحة التحكم");
    await assertDesktopSidebarEdge(page, "rtl");
  });

  test("Arabic RTL operational routes preserve logical geometry", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(ROUTE_JOURNEY_TIMEOUT_MS);
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
