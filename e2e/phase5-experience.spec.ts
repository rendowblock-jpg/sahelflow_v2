import {
  expect,
  test,
  type BrowserContext,
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
  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close();
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

  test("live locale switching commits server copy, document direction and shell edge atomically", async ({
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

    await expect(html).toHaveAttribute("lang", "fr");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("dir", "ltr");
    await expect(desktopSidebar).toContainText("Tableau de bord");
    await expect(pageHeading).toHaveText("Comptabilité");
    await assertDesktopSidebarEdge(page, "ltr");

    // Hold only the refresh triggered by this locale interaction. Visible copy and
    // geometry must remain on the committed French tree while the Arabic RSC tree
    // is delayed, then move together when that server tree arrives.
    let localeSwitchStarted = false;
    let delayedRefreshObserved = false;
    await page.route("**/accounting**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (
        localeSwitchStarted &&
        requestUrl.pathname === "/accounting" &&
        route.request().resourceType() === "fetch"
      ) {
        delayedRefreshObserved = true;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      await route.continue();
    });

    localeSwitchStarted = true;
    await selectLocale(page, "Français", "العربية");
    await expect.poll(() => delayedRefreshObserved).toBe(true);
    await expect(html).toHaveAttribute("lang", "fr");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("dir", "ltr");
    await expect(desktopSidebar).toContainText("Tableau de bord");
    await expect(pageHeading).toHaveText("Comptabilité");
    await assertDesktopSidebarEdge(page, "ltr");

    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(shell).toHaveAttribute("dir", "rtl");
    await expect(desktopSidebar).toContainText("لوحة التحكم");
    await expect(pageHeading).toHaveText("المحاسبة");
    await assertDesktopSidebarEdge(page, "rtl");
    await page.unroute("**/accounting**");

    await selectLocale(page, "العربية", "English");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(shell).toHaveAttribute("dir", "ltr");
    await expect(desktopSidebar).toContainText("Dashboard");
    await expect(pageHeading).toHaveText("Accounting");
    await assertDesktopSidebarEdge(page, "ltr");

    // Repeat the direction flip once more. The installed Internal.14 failure could
    // leave the sidebar stuck on the previous edge only after switching back and
    // forth, so a single cold Arabic boot would not protect this regression.
    await selectLocale(page, "English", "العربية");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(shell).toHaveAttribute("dir", "rtl");
    await expect(desktopSidebar).toContainText("لوحة التحكم");
    await expect(pageHeading).toHaveText("المحاسبة");
    await assertDesktopSidebarEdge(page, "rtl");
  });

  test("appearance mode, accent family and density share one live authority", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await ensureOwnerSession(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.locator("#settings-tab-appearance").click();

    const html = page.locator("html");
    const shell = page.locator('[data-sahelflow-shell="desktop"]');

    await expect(html).toHaveAttribute("data-density", "comfortable");

    await page.locator('[data-theme-mode="light"]').click();
    await expect(html).toHaveClass(/\blight\b/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("theme")))
      .toBe("light");

    await page.locator('[data-theme-preset-option="atlas"]').click();
    await expect(html).toHaveAttribute("data-theme-preset", "atlas");
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("sahelflow-theme-preset")),
      )
      .toBe("atlas");

    await page.locator('[data-density-option="compact"]').click();
    await expect(shell).toHaveAttribute("data-density", "compact");
    await expect(html).toHaveAttribute("data-density", "compact");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stored = localStorage.getItem("sahelflow-ui");
          if (!stored) return null;
          const parsed = JSON.parse(stored) as { state?: { density?: string } };
          return parsed.state?.density ?? null;
        }),
      )
      .toBe("compact");

    // The locale menu is Radix-portaled under <body>, outside the dashboard shell.
    // It must inherit the same root density variable rather than falling back to
    // the historical compact control height.
    await page.getByRole("button", { name: "Français" }).click();
    const portalMenu = page.getByRole("menu").last();
    await expect(portalMenu).toBeVisible();
    await expect
      .poll(() =>
        portalMenu.evaluate((node) =>
          getComputedStyle(node).getPropertyValue("--control-height").trim(),
        ),
      )
      .toBe("2.25rem");
    await page.keyboard.press("Escape");

    // Motion preference is part of the same appearance contract: reduced-motion
    // users still get the exact mode/preset state change, but never the bounded
    // interpolation marker used for the ordinary animated transition.
    await expect(html).not.toHaveAttribute("data-theme-switching", "true", {
      timeout: 2_000,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator('[data-theme-mode="dark"]').click();
    await expect(html).toHaveClass(/\bdark\b/);
    await expect(html).not.toHaveAttribute("data-theme-switching", "true");
  });

  test("coarse-pointer portaled controls preserve 44px interaction targets", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      hasTouch: true,
    });
    await context.addCookies(ownerSessionCookies);
    const page = await context.newPage();

    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      expect(page.url()).toContain("/dashboard");
      expect(
        await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
        "touch-enabled evidence context should expose a coarse primary pointer",
      ).toBe(true);

      await page.goto("/settings", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await page.locator("#settings-tab-appearance").click();
      await page.locator('[data-density-option="compact"]').click();

      const html = page.locator("html");
      await expect(html).toHaveAttribute("data-density", "compact");
      await expect
        .poll(() =>
          html.evaluate((node) =>
            getComputedStyle(node).getPropertyValue("--control-height").trim(),
          ),
        )
        .toBe("3rem");

      await page.getByRole("button", { name: "Français" }).click();
      await assertTargetFloor(
        page.getByRole("menuitem").filter({ hasText: "العربية" }).first(),
        "portaled locale menu item",
      );
      await page.keyboard.press("Escape");

      await page.goto("/accounting", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const expenseDialogTrigger = page.getByRole("button", {
        name: "Ajouter une dépense",
        exact: true,
      });
      await expect(expenseDialogTrigger).toBeVisible();
      await expenseDialogTrigger.click();

      const expenseDialog = page.getByRole("dialog", {
        name: "Ajouter une dépense",
      });
      await expect(expenseDialog).toBeVisible();
      const dialogClose = expenseDialog.getByRole("button", { name: "Fermer" });
      await assertTargetFloor(dialogClose, "portaled dialog close control");

      // FormControl composes the Radix trigger through a Slot, so user-facing
      // combobox semantics are the stable evidence boundary rather than data-slot.
      const categorySelect = expenseDialog.getByRole("combobox", {
        name: "Catégorie",
      });
      await assertTargetFloor(categorySelect, "expense category select trigger");
      await categorySelect.click();
      await assertTargetFloor(
        page.getByRole("option").first(),
        "portaled select option",
      );
      await page.keyboard.press("Escape");
      await dialogClose.click();

      await page.setViewportSize({ width: 640, height: 768 });
      const sheetTrigger = page.locator('[data-slot="sheet-trigger"]').first();
      await assertTargetFloor(sheetTrigger, "mobile navigation sheet trigger");
      await sheetTrigger.click();

      const navigationSheet = page.locator('[data-slot="sheet-content"]').first();
      await expect(navigationSheet).toBeVisible();
      await assertTargetFloor(
        navigationSheet.getByRole("link", {
          name: "Tableau de bord",
          exact: true,
        }),
        "portaled navigation primary link",
      );
      await assertTargetFloor(
        navigationSheet.locator('[data-slot="sheet-close"]').first(),
        "portaled navigation sheet close control",
      );
    } finally {
      await context.close();
    }
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
