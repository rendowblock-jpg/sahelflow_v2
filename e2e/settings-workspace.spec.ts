import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

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
    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
      timeout: 90_000,
    });
  }
}

async function setLocale(
  context: BrowserContext,
  baseURL: string | undefined,
  locale: "fr" | "ar",
) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: locale,
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

test.describe.serial("Settings operational workspace evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      await setLocale(context, baseURL, "fr");
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    await page.setViewportSize(DESKTOP);
    await context.addCookies(ownerSessionCookies);
    await setLocale(context, baseURL, "fr");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("desktop groups expose one task-shaped workspace without overflow", async ({
    page,
  }) => {
    const workspace = page.locator('[data-settings-workspace="v2"]');
    await expect(workspace).toBeVisible();

    const groups = page.locator("[data-settings-group]");
    await expect(groups).toHaveCount(4);
    await expect(page.locator('[data-settings-group="experience"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (const group of ["connections", "team", "data", "experience"] as const) {
      await page.locator(`[data-settings-group="${group}"]`).click();
      await expect(
        page.locator(`[data-settings-group-panel="${group}"]`),
      ).toBeVisible();
      await expect(page.locator(`[data-settings-group="${group}"]`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(
      overflow.viewportWidth + 1,
    );
  });

  test("mobile keeps group navigation usable without horizontal page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 768 });
    const workspace = page.locator('[data-settings-workspace="v2"]');
    await expect(workspace).toBeVisible();

    await page.locator('[data-settings-group="connections"]').click();
    await expect(
      page.locator('[data-settings-group-panel="connections"]'),
    ).toBeVisible();
    await page.locator('[data-settings-group="data"]').click();
    await expect(page.locator('[data-settings-group-panel="data"]')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(
      overflow.viewportWidth + 1,
    );
  });

  test("Arabic RTL keeps group direction and content coherent", async ({
    context,
    page,
    baseURL,
  }) => {
    await setLocale(context, baseURL, "ar");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const workspace = page.locator('[data-settings-workspace="v2"]');
    await expect(workspace).toBeVisible();

    await page.locator('[data-settings-group="team"]').click();
    await expect(page.locator('[data-settings-group-panel="team"]')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(
      overflow.viewportWidth + 1,
    );
  });
});
