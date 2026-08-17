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

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(
    overflow.viewportWidth + 1,
  );
}

test.describe.serial("Settings Class-AAA control center evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
    });
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

  test("1366 desktop is a full-height command rail plus dominant control canvas", async ({
    page,
  }) => {
    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-workspace", "v2");
    await expect(workspace).toHaveAttribute(
      "data-settings-generation",
      "class-aaa",
    );
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");

    const groups = page.locator("[data-settings-group]");
    await expect(groups).toHaveCount(6);
    await expect(page.locator('[data-settings-group="workspace"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const radius = await workspace.evaluate((element) =>
      getComputedStyle(element).borderRadius,
    );
    expect(radius).toBe("0px");

    const railBox = await page
      .locator('[data-settings-control-center="true"] > div > aside')
      .boundingBox();
    const canvasBox = await page
      .locator('[data-settings-domain-canvas="true"]')
      .boundingBox();
    expect(railBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (railBox && canvasBox) {
      expect(railBox.width).toBeGreaterThanOrEqual(248);
      expect(railBox.width).toBeLessThanOrEqual(252);
      expect(canvasBox.width).toBeGreaterThan(railBox.width * 2.5);
    }

    for (const group of [
      "operations",
      "connections",
      "intelligence",
      "access",
      "data",
      "workspace",
    ] as const) {
      await page.locator(`[data-settings-group="${group}"]`).click();
      await expect(
        page.locator(`[data-settings-group-panel="${group}"]`),
      ).toBeVisible();
      await expect(page.locator(`[data-settings-group="${group}"]`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }

    await expectNoHorizontalOverflow(page);
  });

  test("mobile is directory first and drills into one focused settings domain", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 768 });
    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute(
      "data-settings-mobile-pane",
      "directory",
    );
    await expect(page.locator('[data-settings-directory="true"]')).toBeVisible();
    await expect(page.locator('[data-settings-domain-canvas="true"]')).toHaveCount(0);

    await page.locator('[data-settings-group="connections"]').click();
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(page.locator('[data-settings-group-panel="connections"]')).toBeVisible();
    await expect(page.locator('[data-settings-directory="true"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Retour aux paramètres" }).click();
    await expect(workspace).toHaveAttribute(
      "data-settings-mobile-pane",
      "directory",
    );
    await expect(page.locator('[data-settings-directory="true"]')).toBeVisible();

    await page.locator('[data-settings-group="data"]').click();
    await expect(page.locator('[data-settings-group-panel="data"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Arabic RTL keeps the command rail on physical right and canvas dominant", async ({
    context,
    page,
    baseURL,
  }) => {
    await setLocale(context, baseURL, "ar");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");

    await page.locator('[data-settings-group="access"]').click();
    await expect(page.locator('[data-settings-group-panel="access"]')).toBeVisible();

    const navigationBox = await page
      .locator('[data-settings-control-center="true"] > div > aside')
      .boundingBox();
    const panelBox = await page
      .locator('[data-settings-domain-canvas="true"]')
      .boundingBox();
    expect(navigationBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    if (navigationBox && panelBox) {
      expect(navigationBox.x).toBeGreaterThan(panelBox.x);
      expect(navigationBox.width).toBeGreaterThanOrEqual(248);
      expect(navigationBox.width).toBeLessThanOrEqual(252);
      expect(panelBox.width).toBeGreaterThan(navigationBox.width * 2.5);
    }

    await expectNoHorizontalOverflow(page);
  });
});
