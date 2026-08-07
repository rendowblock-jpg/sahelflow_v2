import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const REFLOW_200_EQUIVALENT = { width: 683, height: 384 };
const ROUTE_TIMEOUT_MS = 240_000;

const REQUIRED_ROUTES = [
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

const PERF_ROUTES = [
  "/dashboard",
  "/orders",
  "/customers",
  "/products",
  "/inbox",
  "/analytics",
] as const;

type Locale = "en" | "fr" | "ar";

const LOCALES: ReadonlyArray<{ locale: Locale; dir: "ltr" | "rtl" }> = [
  { locale: "en", dir: "ltr" },
  { locale: "fr", dir: "ltr" },
  { locale: "ar", dir: "rtl" },
];

const TRANSLATION_KEY_PATTERN = /\b(?:common|nav|topbar|dashboard|orders?|customers?|products?|deliveries?|returns?|accounting|analytics|risk|imports?|inbox|automations?|agents?|storefronts?|settings|profile|command|dataTable|error|updater|phase5)\.[A-Za-z0-9_.-]+\b/g;

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function setLocale(context: BrowserContext, locale: Locale) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: locale,
      url: "http://localhost:3000",
    },
  ]);
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
    throw new Error("Phase 6/7 representative evidence requires the rich seeded owner authority");
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
}

async function assertContained(page: Page, route: string) {
  const geometry = await page.evaluate(() => ({
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(
    geometry.documentWidth,
    `${route} document must not overflow the current CSS viewport`,
  ).toBeLessThanOrEqual(geometry.width + 1);
  expect(
    geometry.bodyWidth,
    `${route} body must not overflow the current CSS viewport`,
  ).toBeLessThanOrEqual(geometry.width + 1);
}

async function assertNoLeakedTranslationKeys(page: Page, route: string) {
  const leaks = await page.locator("body").evaluate((body, patternSource) => {
    const pattern = new RegExp(patternSource, "g");
    return [...new Set(body.innerText.match(pattern) ?? [])].slice(0, 20);
  }, TRANSLATION_KEY_PATTERN.source);
  expect(leaks, `${route} must not expose dotted translation identifiers`).toEqual([]);
}

async function assertRenderedRoute(
  page: Page,
  route: string,
  locale: Locale,
  dir: "ltr" | "rtl",
) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should return a document response`).not.toBeNull();
  expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
  await waitForHydration(page);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("html")).toHaveAttribute("dir", dir);
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText("Application error");
  await assertContained(page, route);
  await assertNoLeakedTranslationKeys(page, route);
}

async function assertTargetFloor(page: Page) {
  const failures = await page.evaluate(() => {
    const selectors = [
      '[data-slot="checkbox"]',
      '[data-slot="switch"]',
      '[data-slot="slider-thumb"]',
      'button[data-size="icon-xs"]',
      'button[data-size="icon-sm"]',
    ];
    const failed: Array<{ selector: string; width: number; height: number }> = [];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          continue;
        }
        if (rect.width < 23.5 || rect.height < 23.5) {
          failed.push({ selector, width: rect.width, height: rect.height });
        }
      }
    }
    return failed;
  });
  expect(failures, "compact standalone controls must keep a 24px target floor").toEqual([]);
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

test.describe.serial("Phase 6 and 7 integrated completion evidence", () => {
  for (const { locale, dir } of LOCALES) {
    test(`${locale} complete desktop route sweep`, async ({ page, context }, testInfo) => {
      test.setTimeout(ROUTE_TIMEOUT_MS);
      await page.setViewportSize(DESKTOP);
      await setLocale(context, locale);
      await ensureOwnerSession(page);

      for (const route of REQUIRED_ROUTES) {
        await assertRenderedRoute(page, route, locale, dir);
      }

      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await page.screenshot({
        path: testInfo.outputPath(`phase67-${locale}-desktop.png`),
        animations: "disabled",
      });
    });

    test(`${locale} 200-percent-equivalent reflow route sweep`, async ({ page, context }) => {
      test.setTimeout(ROUTE_TIMEOUT_MS);
      await page.setViewportSize(REFLOW_200_EQUIVALENT);
      await setLocale(context, locale);
      await ensureOwnerSession(page);

      for (const route of REQUIRED_ROUTES) {
        await assertRenderedRoute(page, route, locale, dir);
      }
    });
  }

  test("keyboard focus, dialog, reduced motion and target-size contracts", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(DESKTOP);
    await setLocale(context, "en");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ensureOwnerSession(page);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await page.keyboard.press("Tab");
    const skip = page.locator('a[href="#main-content"]');
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    const ordersLink = page.locator('a[href="/orders"]').first();
    await ordersLink.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/orders");
    await waitForHydration(page);
    await expect(page.locator("#main-content")).toBeFocused();

    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const motion = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(motion.animationDuration).toMatch(/(?:0s|0\.0*1?ms)/);
    expect(motion.transitionDuration).toMatch(/(?:0s|0\.0*1?ms)/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await assertTargetFloor(page);
  });

  test("Phase 7 browser performance trend stays bounded", async ({ page, context }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize(DESKTOP);
    await setLocale(context, "fr");
    await ensureOwnerSession(page);

    const routeDurations: Record<string, number> = {};
    for (const route of PERF_ROUTES) {
      const started = Date.now();
      await assertRenderedRoute(page, route, "fr", "ltr");
      routeDurations[route] = Date.now() - started;
    }

    const searchDurations: number[] = [];
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    for (let index = 0; index < 8; index += 1) {
      const duration = await page.evaluate(async () => {
        const started = performance.now();
        const response = await fetch("/api/orders/search?q=DZ&limit=5", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`search returned ${response.status}`);
        await response.json();
        return performance.now() - started;
      });
      searchDurations.push(duration);
    }

    const routeP95 = percentile95(Object.values(routeDurations));
    const searchP95 = percentile95(searchDurations);
    const evidence = {
      environment: "controlled Chromium CI trend only — not T470 certification",
      routeDurationsMs: routeDurations,
      routeP95Ms: routeP95,
      searchDurationsMs: searchDurations,
      searchP95Ms: searchP95,
    };
    await testInfo.attach("phase7-browser-performance.json", {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      contentType: "application/json",
    });

    // These are regression tripwires for clean CI, deliberately looser than the
    // Founder T470/floor acceptance budgets. Hardware targets are proven only on
    // the named installed devices.
    expect(routeP95).toBeLessThan(6_000);
    expect(searchP95).toBeLessThan(1_500);
  });
});
