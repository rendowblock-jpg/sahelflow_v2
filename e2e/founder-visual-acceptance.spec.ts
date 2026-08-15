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

type Box = NonNullable<
  Awaited<ReturnType<ReturnType<Page["locator"]>["boundingBox"]>>
>;

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

async function visibleBox(page: Page, selector: string): Promise<Box> {
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  expect(box, `${selector} must have measurable geometry`).not.toBeNull();
  return box as Box;
}

function expectRightOf(right: Box, left: Box, label: string) {
  expect(
    right.x,
    `${label}: right-side region must start to the right of the left-side region`,
  ).toBeGreaterThanOrEqual(left.x + Math.min(left.width, 1));
}

function expectLeftOf(left: Box, right: Box, label: string) {
  expect(
    left.x + left.width,
    `${label}: left-side region must finish before the right-side region finishes`,
  ).toBeLessThanOrEqual(right.x + right.width);
  expect(left.x, `${label}: left-side region must begin further left`).toBeLessThan(
    right.x,
  );
}

function expectWidthBetween(
  box: Box,
  minimum: number,
  maximum: number,
  label: string,
) {
  expect(box.width, `${label}: width must not collapse below ${minimum}px`).toBeGreaterThanOrEqual(
    minimum,
  );
  expect(box.width, `${label}: width must not expand beyond ${maximum}px`).toBeLessThanOrEqual(
    maximum,
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function expectRtlShellGeometry(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const shell = page.locator('[data-sahelflow-shell="desktop"]');
  await expect(shell).toHaveAttribute("data-locale-dir", "rtl");
  await expect(shell).toHaveAttribute("data-shell-mode", "standard");
  const workspace = await visibleBox(page, '[data-shell-region="workspace"]');
  const navigation = await visibleBox(page, '[data-shell-region="navigation"]');
  expectRightOf(navigation, workspace, "RTL application shell");
  expectWidthBetween(navigation, 250, 270, "RTL application navigation");
}

async function expectRtlStorefrontFocusGeometry(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const shell = page.locator('[data-sahelflow-shell="desktop"]');
  await expect(shell).toHaveAttribute("data-locale-dir", "rtl");
  await expect(shell).toHaveAttribute("data-shell-mode", "storefront-focus");
  await expect(page.locator('[data-shell-region="navigation"]')).toHaveCount(0);
  await expect(page.locator("#main-content h1")).toHaveCount(1);
  const workspace = await visibleBox(page, '[data-shell-region="workspace"]');
  expect(workspace.x).toBeLessThanOrEqual(1);
  expect(workspace.width).toBeGreaterThanOrEqual(DESKTOP.width - 2);
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
      input: root.getPropertyValue("--input").trim(),
      sidebarBorder: root.getPropertyValue("--sidebar-border").trim(),
    };
  });
}

test.describe.serial("Founder visual correction evidence", () => {
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

  test.beforeEach(async ({ context, page }) => {
    await context.addCookies(ownerSessionCookies);
    await page.setViewportSize(DESKTOP);
  });

  test("dark presets keep one neutral material system with usable RTL Settings proportions", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(120_000);
    await setLocale(context, baseURL, "ar");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expectRtlShellGeometry(page);

    const settingsNavigation = await visibleBox(
      page,
      '[data-settings-workspace="v2"] > div > aside',
    );
    const settingsPanel = await visibleBox(
      page,
      '[data-settings-workspace="v2"] > div > section',
    );
    expectRightOf(settingsNavigation, settingsPanel, "RTL Settings workspace");
    expectWidthBetween(settingsNavigation, 230, 250, "RTL Settings navigation");
    expect(
      settingsPanel.width,
      "RTL Settings content must remain the dominant work surface",
    ).toBeGreaterThan(settingsNavigation.width * 2);

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
      await expectNoHorizontalOverflow(page);
      await shot(page, testInfo, `founder-dark-${preset}`);
    }
  });

  test("Arabic flagship workbenches render with correct RTL sides and usable pane proportions", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    await setLocale(context, baseURL, "ar");

    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expectRtlShellGeometry(page);
    await expect(page.locator('[data-inbox-workspace="v2"]')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('[data-inbox-conversation]').first()).toBeVisible();
    await expect(page.locator('[data-inbox-thread="active"]')).toBeVisible();
    const inboxQueue = await visibleBox(page, '[data-inbox-queue="true"]');
    const inboxThread = await visibleBox(page, '[data-inbox-thread="active"]');
    expectRightOf(inboxQueue, inboxThread, "RTL Inbox queue");
    expectWidthBetween(inboxQueue, 310, 330, "RTL Inbox queue");
    const inboxContext = page.locator('aside:has(> [data-inbox-context="true"])');
    if (await inboxContext.isVisible()) {
      const contextBox = await inboxContext.boundingBox();
      expect(contextBox).not.toBeNull();
      expectLeftOf(contextBox as Box, inboxThread, "RTL Inbox context rail");
      expectWidthBetween(contextBox as Box, 260, 280, "RTL Inbox context rail");
    }
    await expectNoHorizontalOverflow(page);
    await shot(page, testInfo, "founder-rtl-inbox-loaded");

    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expectRtlShellGeometry(page);
    await expect(page.locator('[data-ai-workspace="v2"]')).toBeVisible({
      timeout: 60_000,
    });
    const aiSessions = await visibleBox(page, '[data-ai-sessions="true"]');
    const aiThread = await visibleBox(page, '[data-ai-thread="true"]');
    expectRightOf(aiSessions, aiThread, "RTL AI sessions rail");
    expectWidthBetween(aiSessions, 215, 235, "RTL AI sessions rail");
    const aiContext = page.locator(
      '[data-ai-workspace="v2"] > div:has(> [data-ai-context="true"])',
    );
    if (await aiContext.isVisible()) {
      const contextBox = await aiContext.boundingBox();
      expect(contextBox).not.toBeNull();
      expectLeftOf(contextBox as Box, aiThread, "RTL AI context rail");
      expectWidthBetween(contextBox as Box, 280, 300, "RTL AI context rail");
    }
    expect(aiThread.width, "AI thread must remain the dominant pane").toBeGreaterThan(430);
    await expectNoHorizontalOverflow(page);
    await shot(page, testInfo, "founder-rtl-ai-loaded");

    await page.goto("/storefronts/new", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expectRtlStorefrontFocusGeometry(page);
    await expect(page.locator('[data-storefront-studio="bootstrap"]')).toBeVisible({
      timeout: 60_000,
    });
    const storefrontSetup = await visibleBox(
      page,
      '[data-storefront-studio="bootstrap"] > div.grid > aside',
    );
    const storefrontPreview = await visibleBox(
      page,
      '[data-storefront-studio="bootstrap"] > div.grid > main',
    );
    expectRightOf(storefrontSetup, storefrontPreview, "RTL Storefront setup rail");
    expectWidthBetween(storefrontSetup, 325, 345, "RTL Storefront setup rail");
    expect(
      storefrontPreview.width,
      "Storefront live preview must dominate the focused authoring frame",
    ).toBeGreaterThan(storefrontSetup.width * 2);
    await expectNoHorizontalOverflow(page);
    await shot(page, testInfo, "founder-rtl-storefront-studio");

    // The rich seed owns a real storefront. Capture the actual saved Studio as
    // Founder evidence too; first-run bootstrap alone cannot prove the editor.
    await page.goto("/storefronts", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const editLink = page.locator('a[href^="/storefronts/"][href$="/studio"]').first();
    await expect(editLink).toBeVisible({ timeout: 30_000 });
    const studioHref = await editLink.getAttribute("href");
    expect(studioHref).toBeTruthy();
    await page.goto(studioHref!, { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expectRtlStorefrontFocusGeometry(page);
    await expect(page.locator('[data-storefront-studio="v2"]')).toBeVisible({
      timeout: 60_000,
    });
    const studioControls = await visibleBox(
      page,
      '[data-storefront-studio="v2"] > div.grid > aside:first-child',
    );
    const studioPreview = await visibleBox(
      page,
      '[data-storefront-studio="v2"] > div.grid > main',
    );
    const studioInspector = await visibleBox(
      page,
      '[data-storefront-studio="v2"] > div.grid > aside:last-child',
    );
    expectRightOf(studioControls, studioPreview, "RTL Storefront Studio controls");
    expectLeftOf(studioInspector, studioPreview, "RTL Storefront Studio inspector");
    expectWidthBetween(studioControls, 200, 216, "RTL Storefront Studio controls");
    expectWidthBetween(studioInspector, 255, 275, "RTL Storefront Studio inspector");
    expect(
      studioPreview.width,
      "Saved Studio preview must remain the dominant authoring surface",
    ).toBeGreaterThan(studioControls.width * 3);
    await expectNoHorizontalOverflow(page);
    await shot(page, testInfo, "founder-rtl-storefront-saved-studio");
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
    await expectRtlShellGeometry(page);
    await expect(page.locator('[data-analytics-workspace="v2"]')).toBeVisible({
      timeout: 60_000,
    });

    const curve = page.locator("path.recharts-area-curve").first();
    await expect(curve).toBeVisible();
    const curveBox = await curve.boundingBox();
    expect(curveBox, "revenue curve should have measurable geometry").not.toBeNull();
    expect(
      curveBox?.height ?? 0,
      "representative revenue data must not collapse into a zero-height RTL curve",
    ).toBeGreaterThan(2);

    await expectNoHorizontalOverflow(page);
    await shot(page, testInfo, "founder-rtl-analytics-data-plane");
  });
});
