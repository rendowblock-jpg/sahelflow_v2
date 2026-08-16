import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const MOBILE = { width: 640, height: 768 };
let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function ensureOwnerSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  if (page.url().includes("/login")) {
    const pin = page.locator("#pin");
    await pin.fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
      timeout: 90_000,
    });
  }
}

async function setArabic(
  context: BrowserContext,
  baseURL: string | undefined,
) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: "ar",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function computedDirection(
  locator: ReturnType<Page["locator"]>,
): Promise<string> {
  await expect(locator).toBeVisible();
  return locator.evaluate((node) => getComputedStyle(node).direction);
}

test.describe.serial("Arabic shared primitive direction authority", () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    await context.addCookies(ownerSessionCookies);
    await setArabic(context, baseURL);
    await page.setViewportSize(DESKTOP);
  });

  test("sidebar content is truly RTL inside the right-side shell", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const sidebar = page.locator('aside[data-navigation-density]').first();
    await expect(sidebar).toBeVisible();
    const viewport = sidebar.locator('[data-slot="scroll-area-viewport"]').first();
    expect(await computedDirection(viewport)).toBe("rtl");

    const dashboardLink = sidebar.locator('a[href="/dashboard"]').first();
    await expect(dashboardLink).toBeVisible();
    const geometry = await dashboardLink.evaluate((node) => {
      const children = Array.from(node.children);
      const icon = children.find((child) => child.tagName.toLowerCase() === "svg");
      const label = children.find(
        (child) =>
          child.tagName.toLowerCase() === "span" &&
          Boolean(child.textContent?.trim()),
      );
      if (!(icon instanceof SVGElement) || !(label instanceof HTMLElement)) {
        return null;
      }
      const iconBox = icon.getBoundingClientRect();
      const labelBox = label.getBoundingClientRect();
      return {
        direction: getComputedStyle(node).direction,
        iconX: iconBox.x,
        labelX: labelBox.x,
      };
    });
    expect(geometry, "dashboard navigation row must expose icon + label geometry").not.toBeNull();
    expect(geometry?.direction).toBe("rtl");
    expect(
      geometry!.iconX,
      "in Arabic navigation the leading icon must sit physically to the right of its label",
    ).toBeGreaterThan(geometry!.labelX);
  });

  test("mobile navigation sheet resolves Arabic inline-start to the physical right edge", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const sheetTrigger = page.locator('[data-slot="sheet-trigger"]').first();
    await expect(sheetTrigger).toBeVisible();
    await sheetTrigger.click();

    const sheet = page.locator('[data-slot="sheet-content"]:visible').first();
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("data-sheet-side", "start");
    await expect(sheet).toHaveAttribute("data-sheet-physical-side", "right");
    expect(await computedDirection(sheet)).toBe("rtl");

    // Visibility is true while the 500ms sheet entrance animation is still
    // translating the panel. Assert the settled physical edge instead of
    // sampling an intermediate animation frame.
    await expect
      .poll(
        async () => {
          const box = await sheet.boundingBox();
          if (!box) return Number.POSITIVE_INFINITY;
          return Math.abs(box.x + box.width - MOBILE.width);
        },
        {
          message: "Arabic inline-start sheet must settle on the physical right viewport edge",
          timeout: 2_000,
        },
      )
      .toBeLessThanOrEqual(2);

    const geometry = await sheet.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        viewportWidth: window.innerWidth,
      };
    });
    expect(geometry.width, "mobile navigation sheet should have measurable width").toBeGreaterThan(0);
    expect(
      Math.abs(geometry.right - geometry.viewportWidth),
      "Arabic inline-start sheet must attach to the physical right viewport edge",
    ).toBeLessThanOrEqual(2);
    expect(
      geometry.left,
      "Arabic mobile navigation sheet should not occupy the whole viewport",
    ).toBeGreaterThan(0);

    const dashboardLink = sheet.locator('a[href="/dashboard"]').first();
    await expect(dashboardLink).toBeVisible();
    expect(await computedDirection(dashboardLink)).toBe("rtl");

    await sheet.locator('[data-slot="sheet-close"]').first().click();
    await expect(sheet).toBeHidden();
  });

  test("notification popup inherits Arabic direction through its portal", async ({
    page,
  }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const notificationTrigger = page
      .locator('header button:has(svg.lucide-bell)')
      .first();
    await expect(notificationTrigger).toBeVisible();
    await notificationTrigger.click();

    const popup = page.locator('[data-slot="dropdown-menu-content"]:visible').last();
    await expect(popup).toBeVisible();
    expect(await computedDirection(popup)).toBe("rtl");

    const firstNotification = popup
      .locator('[data-slot="dropdown-menu-item"]')
      .first();
    if ((await firstNotification.count()) > 0) {
      expect(await computedDirection(firstNotification)).toBe("rtl");
    }
  });

  test("Arabic analytical chrome is RTL while the coordinate plane stays isolated", async ({
    page,
  }) => {
    await page.goto("/risk", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const chartCard = page
      .locator(
        '[data-chart-card="true"]:has([data-chart-header-icon="true"]):has([data-slot="chart"])',
      )
      .first();
    await expect(chartCard).toBeVisible();
    expect(await computedDirection(chartCard)).toBe("rtl");

    const headerRow = chartCard.locator('[data-chart-header-row="true"]').first();
    await expect(headerRow).toBeVisible();
    const headerGeometry = await headerRow.evaluate((node) => {
      const icon = node.querySelector('[data-chart-header-icon="true"]');
      const copy = node.querySelector('[data-chart-header-copy="true"]');
      if (!(icon instanceof HTMLElement) || !(copy instanceof HTMLElement)) {
        return null;
      }
      const iconBox = icon.getBoundingClientRect();
      const copyBox = copy.getBoundingClientRect();
      return {
        direction: getComputedStyle(node).direction,
        iconX: iconBox.x,
        copyX: copyBox.x,
      };
    });
    expect(headerGeometry, "chart header must expose exact icon + copy geometry").not.toBeNull();
    expect(headerGeometry?.direction).toBe("rtl");
    expect(
      headerGeometry!.iconX,
      "Arabic chart card leading icon must sit to the right of the title block",
    ).toBeGreaterThan(headerGeometry!.copyX);

    const coordinatePlane = chartCard.locator('[data-slot="chart"]').first();
    await expect(coordinatePlane).toBeVisible();
    expect(await computedDirection(coordinatePlane)).toBe("ltr");
  });
});
