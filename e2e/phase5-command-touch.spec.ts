import { expect, test, type Page } from "@playwright/test";

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

async function assertTargetFloor(locator: ReturnType<Page["locator"]>, label: string) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have measurable target geometry`).not.toBeNull();
  if (!box) return;
  expect(box.height, `${label} height should meet the 44px touch floor`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${label} width should meet the 44px touch floor`).toBeGreaterThanOrEqual(44);
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
  });
  const page = await context.newPage();

  try {
    await ensureOwnerSession(page);
    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
      "touch evidence context should expose a coarse primary pointer",
    ).toBe(true);

    // At desktop width the command/search entry is the only direct button child
    // of the application header. Measure the actual control before opening it.
    const commandTrigger = page.locator("header > button").first();
    await assertTargetFloor(commandTrigger, "desktop command palette trigger");
    await commandTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await assertTargetFloor(
      dialog.locator('[data-slot="command-item"]').first(),
      "portaled command palette result",
    );
  } finally {
    await context.close();
  }
});
