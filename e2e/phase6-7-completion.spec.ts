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

async function assertSemanticBasics(page: Page, route: string) {
  const findings = await page.evaluate(() => {
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const labelledByText = (element: HTMLElement) => {
      const ids = (element.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean);
      return ids.some((id) => document.getElementById(id)?.textContent?.trim());
    };

    const hasLabel = (element: HTMLElement) => {
      if (element.getAttribute("aria-label")?.trim()) return true;
      if (labelledByText(element)) return true;
      if (element.getAttribute("title")?.trim()) return true;
      if (element.textContent?.trim()) return true;
      if (element instanceof HTMLInputElement && element.value.trim()) return true;
      if (element.querySelector("img[alt]:not([alt=''])")) return true;

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) {
        if (element.id) {
          const explicit = document.querySelector<HTMLLabelElement>(
            `label[for="${CSS.escape(element.id)}"]`,
          );
          if (explicit?.textContent?.trim()) return true;
        }
        if (element.closest("label")?.textContent?.trim()) return true;
      }
      return false;
    };

    const selectors = [
      "button",
      "a[href]",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[role='button']",
      "[role='checkbox']",
      "[role='switch']",
      "[role='tab']",
    ];
    const elements = new Set<HTMLElement>();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        elements.add(element);
      }
    }

    const unnamed: string[] = [];
    for (const element of elements) {
      if (!visible(element) || element.getAttribute("aria-hidden") === "true") continue;
      if (!hasLabel(element)) {
        unnamed.push(
          `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.getAttribute("role") ? `[role=${element.getAttribute("role")}]` : ""}`,
        );
      }
    }

    const imagesMissingAlt = [...document.querySelectorAll<HTMLImageElement>("img")]
      .filter((image) => visible(image) && !image.hasAttribute("alt"))
      .map((image) => image.currentSrc || image.src || "img")
      .slice(0, 20);

    const main = document.querySelector("main");
    const levelOneHeadings = main?.querySelectorAll("h1, [role='heading'][aria-level='1']").length ?? 0;

    return {
      unnamed: unnamed.slice(0, 30),
      imagesMissingAlt,
      levelOneHeadings,
    };
  });

  expect(findings.unnamed, `${route} visible interactive controls need accessible names`).toEqual([]);
  expect(findings.imagesMissingAlt, `${route} visible images need explicit alt semantics`).toEqual([]);
  expect(findings.levelOneHeadings, `${route} needs one work-surface level-one heading`).toBeGreaterThanOrEqual(1);
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
  await assertSemanticBasics(page, route);
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

function selectMetrics(
  rows: ReadonlyArray<{ name: string; value: number }>,
  names: readonly string[],
) {
  const selected: Record<string, number> = {};
  for (const name of names) {
    const value = rows.find((entry) => entry.name === name)?.value;
    if (typeof value === "number") selected[name] = value;
  }
  return selected;
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

    const settingsTabs = page.locator('[role="tab"]');
    if ((await settingsTabs.count()) > 1) {
      await settingsTabs.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(settingsTabs.nth(1)).toBeFocused();
    }
  });

  test("Arabic settings keyboard direction follows RTL", async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(DESKTOP);
    await setLocale(context, "ar");
    await ensureOwnerSession(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const tabs = page.locator('[role="tab"]');
    if ((await tabs.count()) > 1) {
      await tabs.first().focus();
      await page.keyboard.press("ArrowLeft");
      await expect(tabs.nth(1)).toBeFocused();
    }
  });

  test("Phase 7 throttled browser performance trend stays bounded", async ({ page, context }, testInfo) => {
    test.setTimeout(210_000);
    await page.setViewportSize(DESKTOP);
    await setLocale(context, "fr");
    await ensureOwnerSession(page);

    // Warm the development-server route modules before measuring. These values
    // remain CI regression evidence only and are never presented as T470/floor
    // product certification.
    for (const route of PERF_ROUTES) {
      await assertRenderedRoute(page, route, "fr", "ltr");
    }

    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    const before = await session.send("Performance.getMetrics");
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const routeDurations: Record<string, number> = {};
    for (const route of PERF_ROUTES) {
      const started = Date.now();
      await assertRenderedRoute(page, route, "fr", "ltr");
      routeDurations[route] = Date.now() - started;
    }

    const searchDurations: number[] = [];
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.evaluate(async () => {
      const response = await fetch("/api/orders/search?q=DZ&limit=5", { cache: "no-store" });
      if (!response.ok) throw new Error(`search warmup returned ${response.status}`);
      await response.json();
    });
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

    const after = await session.send("Performance.getMetrics");
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    const metricNames = [
      "JSHeapUsedSize",
      "JSHeapTotalSize",
      "Nodes",
      "Documents",
      "JSEventListeners",
      "TaskDuration",
    ] as const;
    const routeP95 = percentile95(Object.values(routeDurations));
    const searchP95 = percentile95(searchDurations);
    const evidence = {
      environment: "controlled Chromium CI trend with 4x renderer CPU throttling — not T470 certification",
      routeDurationsMs: routeDurations,
      routeP95Ms: routeP95,
      searchDurationsMs: searchDurations,
      searchP95Ms: searchP95,
      rendererMetricsBefore: selectMetrics(before.metrics, metricNames),
      rendererMetricsAfter: selectMetrics(after.metrics, metricNames),
    };
    await testInfo.attach("phase7-browser-performance.json", {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      contentType: "application/json",
    });

    // Regression tripwires for clean CI, deliberately looser than the product's
    // named installed-hardware budgets.
    expect(routeP95).toBeLessThan(8_000);
    expect(searchP95).toBeLessThan(2_000);
  });
});
