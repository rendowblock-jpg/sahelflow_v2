import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
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

async function setLocale(
  context: BrowserContext,
  baseURL: string | undefined,
  locale: "ar" | "fr",
) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: locale,
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

async function neutralStructure(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      background: root.getPropertyValue("--background").trim(),
      card: root.getPropertyValue("--card").trim(),
      popover: root.getPropertyValue("--popover").trim(),
      sidebar: root.getPropertyValue("--sidebar").trim(),
      border: root.getPropertyValue("--border").trim(),
    };
  });
}

test.describe.serial("Founder visual correction evidence", () => {
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

  test.beforeEach(async ({ context, page }) => {
    await context.addCookies(ownerSessionCookies);
    await page.setViewportSize(DESKTOP);
  });

  test("dark presets keep one neutral material system instead of tinting the application", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await setLocale(context, baseURL, "ar");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.locator("#settings-tab-appearance").click();
    await page.locator('[data-theme-mode="dark"]').click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    let structuralReference: Awaited<ReturnType<typeof neutralStructure>> | null = null;
    for (const preset of ["atlas", "oasis", "dune", "sahel"] as const) {
      await page.locator(`[data-theme-preset-option="${preset}"]`).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme-preset", preset);
      await expect(page.locator("html")).not.toHaveAttribute(
        "data-appearance-transition",
        "active",
        { timeout: 2_000 },
      );
      const structure = await neutralStructure(page);
      if (structuralReference === null) structuralReference = structure;
      else expect(structure).toEqual(structuralReference);
      await shot(page, testInfo, `founder-dark-${preset}`);
    }
  });

  test("Arabic flagship workbenches render their actual product surfaces before evidence is captured", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    await setLocale(context, baseURL, "ar");

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator('[data-inbox-workspace="v2"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-inbox-conversation]').first()).toBeVisible();
    await expect(page.locator('[data-inbox-thread="active"]')).toBeVisible();
    await shot(page, testInfo, "founder-rtl-inbox-loaded");

    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator('[data-ai-launchpad="operational"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-ai-workspace="v2"]')).toBeVisible();
    await shot(page, testInfo, "founder-rtl-ai-loaded");

    await page.goto("/storefronts/new", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator('[data-storefront-studio="bootstrap"]')).toBeVisible({ timeout: 60_000 });
    await shot(page, testInfo, "founder-rtl-storefront-studio");
  });

  test("Arabic analytics keeps the data plane stable and paints a real revenue curve", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await setLocale(context, baseURL, "ar");
    await page.goto("/analytics", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator('[data-analytics-workspace="v2"]')).toBeVisible({ timeout: 60_000 });

    const curve = page.locator("path.recharts-area-curve").first();
    await expect(curve).toBeVisible();
    const curveBox = await curve.boundingBox();
    expect(curveBox, "revenue curve should have measurable geometry").not.toBeNull();
    expect(
      curveBox?.height ?? 0,
      "representative revenue data must not collapse into a zero-height RTL curve",
    ).toBeGreaterThan(2);

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
    await shot(page, testInfo, "founder-rtl-analytics-data-plane");
  });
});
