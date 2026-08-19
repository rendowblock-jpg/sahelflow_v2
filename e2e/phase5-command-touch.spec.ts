import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const FOUNDER_DESKTOP = { width: 1600, height: 900 };

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
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  expect(page.url()).toContain("/dashboard");
}

async function setLocale(
  context: BrowserContext,
  baseURL: string | undefined,
  locale: "ar" | "fr" | "en",
) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: locale,
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function assertTargetFloor(
  locator: ReturnType<Page["locator"]>,
  label: string,
) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have measurable target geometry`).not.toBeNull();
  if (!box) return;
  expect(
    box.height,
    `${label} height should meet the 44px touch floor`,
  ).toBeGreaterThanOrEqual(44);
  expect(
    box.width,
    `${label} width should meet the 44px touch floor`,
  ).toBeGreaterThanOrEqual(44);
}

async function openSearch(page: Page) {
  await page.keyboard.press("Control+K");
  const dialog = page.locator('[data-universal-search="v2"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

test("coarse-pointer command entry and portaled results preserve 44px targets", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL,
    viewport: DESKTOP,
    hasTouch: true,
    storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
  });
  const page = await context.newPage();

  try {
    await ensureOwnerSession(page);
    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
      "touch evidence context should expose a coarse primary pointer",
    ).toBe(true);

    const commandTrigger = page.locator("header > button").first();
    await assertTargetFloor(commandTrigger, "desktop command center trigger");
    await commandTrigger.click();

    const dialog = page.locator('[data-universal-search="v2"]');
    await expect(dialog).toBeVisible();
    await assertTargetFloor(
      dialog.locator('[data-slot="command-item"]').first(),
      "portaled command center result",
    );
  } finally {
    await context.close();
  }
});

test("Founder Arabic command center is clean, relevant and finds protected records", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({
    baseURL,
    viewport: FOUNDER_DESKTOP,
    storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
  });
  const page = await context.newPage();

  try {
    await setLocale(context, baseURL, "ar");
    await ensureOwnerSession(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    const dialog = await openSearch(page);
    await expect(dialog).toContainText("اعثر على أي شيء في متجرك");
    await expect(dialog).toContainText("وصول سريع");
    await expect(dialog).not.toContainText("/dashboard");
    await expect(dialog).not.toContainText("/orders");

    const input = dialog.locator('[data-slot="command-input"]');
    await expect(input).toBeFocused();
    await input.fill("Ahmed B");

    const customer = dialog
      .locator('[data-slot="command-item"]')
      .filter({ hasText: "Ahmed Benali" })
      .filter({ hasText: "عميل" })
      .first();
    await expect(customer).toBeVisible({ timeout: 10_000 });
    await expect(customer).toContainText("0555123456");

    // Arabic-Indic digits must resolve the same protected customer. Related
    // orders may also match the phone, but the direct customer result remains
    // the primary contact result and carries the protected phone projection.
    await input.fill("٠٥٥٥١٢٣٤٥٦");
    const phoneMatch = dialog
      .locator('[data-slot="command-item"]')
      .filter({ hasText: "Ahmed Benali" })
      .filter({ hasText: "عميل" })
      .first();
    await expect(phoneMatch).toBeVisible({ timeout: 10_000 });
    await expect(phoneMatch).toContainText("0555123456");

    const geometry = await dialog.boundingBox();
    expect(geometry).not.toBeNull();
    expect(geometry!.width).toBeGreaterThanOrEqual(640);
    expect(geometry!.width).toBeLessThanOrEqual(720);
    expect(geometry!.height).toBeLessThan(FOUNDER_DESKTOP.height * 0.78);

    await shot(page, testInfo, "founder-universal-search-ar-1600");

    await phoneMatch.click();
    await page.waitForURL(/\/customers\//, { timeout: 30_000 });
  } finally {
    await context.close();
  }
});

test("newer search input wins over an older in-flight query", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL,
    viewport: DESKTOP,
    storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
  });
  const page = await context.newPage();

  try {
    await setLocale(context, baseURL, "en");
    await ensureOwnerSession(page);
    const dialog = await openSearch(page);
    const input = dialog.locator('[data-slot="command-input"]');

    await input.fill("Ahmed B");
    await input.fill("Karim H");

    const latest = dialog
      .locator('[data-slot="command-item"]')
      .filter({ hasText: "Karim Haddad" })
      .first();
    await expect(latest).toBeVisible({ timeout: 10_000 });
    await expect(
      dialog
        .locator('[data-slot="command-item"]')
        .filter({ hasText: "Ahmed Benali" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});
