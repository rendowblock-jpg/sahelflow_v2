import {
  expect,
  test,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type TestInfo,
} from "@playwright/test";

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

let ownerSessionCookies: Parameters<BrowserContext["addCookies"]>[0] = [];

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

function formatPageError(error: Error) {
  return `[pageerror] ${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
}

async function assertRenderedRoute(
  page: Page,
  route: string,
  testInfo: TestInfo,
  prefix: string,
) {
  const diagnostics: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      diagnostics.push(`[console.error] ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => diagnostics.push(formatPageError(error));
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `${route} should return a document response`).not.toBeNull();
    expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await page.locator("body").waitFor({ state: "visible" });
    await waitForHydration(page);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await expect(page.locator("body")).not.toContainText("Application error");

    const pageError = page.locator('[data-testid="page-error"]');
    if (await pageError.isVisible().catch(() => false)) {
      const body = diagnostics.length
        ? diagnostics.join("\n\n")
        : "The route rendered the page-error boundary without a captured browser error.";
      await testInfo.attach(`route-error-${route.replaceAll("/", "-") || "root"}`, {
        body,
        contentType: "text/plain",
      });
      throw new Error(`${route} rendered the SahelFlow page-error boundary.\n${body}`);
    }

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
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
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
    // Dev-mode route compilation can be slow on shared Actions runners; waiting
    // only for navigation commit proves auth transition without treating asset
    // load latency as a product login failure.
    waitUntil: "commit",
    timeout: 90_000,
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

async function assertTargetFloor(
  locator: ReturnType<Page["locator"]>,
  label: string,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have measurable target geometry`).not.toBeNull();
  if (!box) return;
  expect(box.height, `${label} height should meet the 44px touch floor`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${label} width should meet the 44px touch floor`).toBeGreaterThanOrEqual(44);
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
  // Representative experience evidence is not an authentication stress test. Log
  // in once against the rich seeded database and reuse the authenticated cookies
  // in each isolated browser context. The dedicated phase5-auth-entry job remains
  // the clean fresh-install proof of the actual owner-login ceremony.
  test.beforeAll(async ({ browser, baseURL }, testInfo) => {
    testInfo.setTimeout(60_000);
    const context = await browser.newContext({ baseURL, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  test.beforeEach(async ({ context, page }) => {
    await context.addCookies(ownerSessionCookies);
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

  test("persisted compact density hydrates through one server-safe snapshot", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (/hydration|hydrated|server rendered html|did not match/i.test(text)) {
        hydrationErrors.push(text);
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem(
        "sahelflow-ui",
        JSON.stringify({
          state: { sidebarCollapsed: false, density: "compact" },
          version: 0,
        }),
      );
    });

    await ensureOwnerSession(page);
    await page.goto("/orders", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const html = page.locator("html");
    const shell = page.locator('[data-sahelflow-shell="desktop"]');
    await expect(html).toHaveAttribute("data-density", "compact");
    await expect(shell).toHaveAttribute("data-density", "compact");
    await expect(page.locator('[data-table-density="compact"]').first()).toBeVisible();
    await expect
      .poll(() =>
        html.evaluate((node) =>
          getComputedStyle(node).getPropertyValue("--control-height").trim(),
        ),
      )
      .toBe("2.25rem");
    expect(hydrationErrors).toEqual([]);
  });

  test("server locale commit survives unwritable UI preference storage", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ baseURL, viewport: DESKTOP });
    await context.addCookies(ownerSessionCookies);
    await context.addInitScript(() => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key === "sahelflow-ui") {
          throw new DOMException("UI preference storage is read-only", "QuotaExceededError");
        }
        return nativeSetItem.call(this, key, value);
      };
    });
    const page = await context.newPage();

    try {
      const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await waitForHydration(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
      await expect(page.locator('aside[data-navigation-density]').first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    } finally {
      await context.close();
    }
  });

  test("live locale switching commits server copy, document direction and shell edge atomically without restarting the document", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ensureOwnerSession(page);
    await page.goto("/accounting", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const html = page.locator("html");
    const shell = page.locator('[data-sahelflow-shell="desktop"]');
    const desktopSidebar = page.locator('aside[data-navigation-density]').first();
    const pageHeading = page.getByRole("heading", { level: 1 });
    const originalTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    await expect(html).toHaveAttribute("lang", "fr");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("data-locale-dir", "ltr");
    await expect(pageHeading).toHaveText("Comptabilité");
    await assertDesktopSidebarEdge(page, "ltr");

    await selectLocale(page, "Français", "العربية");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(shell).toHaveAttribute("data-locale-dir", "rtl");
    await expect(pageHeading).toHaveText("المحاسبة");
    await assertDesktopSidebarEdge(page, "rtl");
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalTimeOrigin);

    await selectLocale(page, "العربية", "English");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("data-locale-dir", "ltr");
    await expect(pageHeading).toHaveText("Accounting");
    await assertDesktopSidebarEdge(page, "ltr");
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(originalTimeOrigin);
  });

  test("theme and dashboard chart motion honor reduced-motion preferences", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      reducedMotion: "reduce",
    });
    await context.addCookies(ownerSessionCookies);
    const page = await context.newPage();
    try {
      await page.goto("/settings", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(page.locator('aside[data-navigation-density]').first()).toBeVisible();
      await expect(page.locator("html")).not.toHaveAttribute(
        "data-appearance-transition",
        "active",
      );

      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const sparkline = page.locator('[data-slot="stat-card"] svg[aria-label="Trend chart"]');
      await expect(sparkline.first()).toBeVisible();
      const duration = await sparkline.first().evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--chart-animation-duration").trim(),
      );
      expect(duration).toBe("0ms");
    } finally {
      await context.close();
    }
  });

  test("sidebar labels remain stable and sidebar edge is correct in both directions", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ensureOwnerSession(page);
    const html = page.locator("html");

    const ltrLabels = await page
      .locator('aside[data-navigation-density] a[href="/dashboard"], aside[data-navigation-density] a[href="/orders"]')
      .allTextContents();
    expect(ltrLabels.length).toBeGreaterThanOrEqual(2);
    await assertDesktopSidebarEdge(page, "ltr");

    await selectLocale(page, "English", "العربية").catch(async () => {
      await selectLocale(page, "Français", "العربية");
    });
    await expect(html).toHaveAttribute("dir", "rtl");
    await assertDesktopSidebarEdge(page, "rtl");

    const rtlLabels = await page
      .locator('aside[data-navigation-density] a[href="/dashboard"], aside[data-navigation-density] a[href="/orders"]')
      .allTextContents();
    expect(rtlLabels.length).toBeGreaterThanOrEqual(2);
    expect(rtlLabels.join(" ")).toMatch(/لوحة|طلبات/);
  });

  test("critical controls preserve touch target floor", async ({ page }) => {
    test.setTimeout(90_000);
    await ensureOwnerSession(page);
    await assertTargetFloor(
      page.locator('aside[data-navigation-density] a[href="/orders"]').first(),
      "sidebar orders target",
    );
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await assertTargetFloor(
      page.getByRole("button", { name: /theme|thème|سمة/i }).first(),
      "settings theme target",
    );
  });
});
