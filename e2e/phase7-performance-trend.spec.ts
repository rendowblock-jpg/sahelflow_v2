import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };
const PERF_ROUTES = [
  "/dashboard",
  "/orders",
  "/customers",
  "/products",
  "/inbox",
  "/analytics",
] as const;
const ROUTE_SAMPLES = 3;
const ROUTE_MEDIAN_LIMIT_MS = 8_000;
const SEARCH_P95_LIMIT_MS = 2_000;

function phase67ClientIp(): string {
  const info = test.info();
  let hash = 0x811c9dc5;
  for (const char of info.testId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `198.18.${(hash >>> 8) & 0xff}.${hash & 0xff}`;
}

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function waitForWorkSurface(page: Page, route: string) {
  await waitForHydration(page);
  await page.waitForURL((url) => url.pathname === route, { timeout: 30_000 });
  await expect(
    page
      .locator(
        '#main-content h1, #main-content [role="heading"][aria-level="1"]',
      )
      .first(),
    `${route} should finish loading its work-surface heading`,
  ).toBeAttached({ timeout: 30_000 });
}

async function setLocale(context: BrowserContext, locale: "fr") {
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
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": phase67ClientIp(),
  });
  const pin = page.locator("#pin");
  await pin.fill(OWNER_PIN);
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
    throw new Error(
      "Phase 7 performance evidence requires the rich seeded owner authority",
    );
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await waitForWorkSurface(page, "/dashboard");
}

async function measureRoute(page: Page, route: string): Promise<number> {
  const started = performance.now();
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response, `${route} should return a document response`).not.toBeNull();
  expect(response!.status(), `${route} should not return an HTTP error`).toBeLessThan(
    400,
  );
  await waitForWorkSurface(page, route);
  return performance.now() - started;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function percentile95(values: readonly number[]): number {
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

test("Phase 7 controlled performance trend uses repeatable route medians", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await setLocale(context, "fr");
  await ensureOwnerSession(page);

  // Warm every measured route before throttling so the trend tracks rendered
  // application work rather than first-time Next dev module compilation.
  for (const route of PERF_ROUTES) {
    await measureRoute(page, route);
  }

  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  const metricNames = [
    "JSHeapUsedSize",
    "JSHeapTotalSize",
    "Nodes",
    "Documents",
    "JSEventListeners",
    "TaskDuration",
  ] as const;
  const before = await session.send("Performance.getMetrics");

  const routeSamplesMs = Object.fromEntries(
    PERF_ROUTES.map((route) => [route, [] as number[]]),
  ) as Record<(typeof PERF_ROUTES)[number], number[]>;
  const searchDurationsMs: number[] = [];
  let after = before;

  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    for (let round = 0; round < ROUTE_SAMPLES; round += 1) {
      for (const route of PERF_ROUTES) {
        routeSamplesMs[route].push(await measureRoute(page, route));
      }
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForWorkSurface(page, "/dashboard");
    await page.evaluate(async () => {
      const response = await fetch("/api/orders/search?q=DZ&limit=5", {
        cache: "no-store",
      });
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
      searchDurationsMs.push(duration);
    }
    after = await session.send("Performance.getMetrics");
  } finally {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }

  const routeMediansMs = Object.fromEntries(
    PERF_ROUTES.map((route) => [route, median(routeSamplesMs[route])]),
  ) as Record<(typeof PERF_ROUTES)[number], number>;
  const [worstRoute, worstRouteMedianMs] = Object.entries(routeMediansMs).sort(
    (left, right) => right[1] - left[1],
  )[0]!;
  const searchP95Ms = percentile95(searchDurationsMs);
  const evidence = {
    environment:
      "controlled Chromium CI trend on Next dev with 4x renderer CPU throttling — not installed T470 certification",
    routeSamplesPerRoute: ROUTE_SAMPLES,
    routeSamplesMs,
    routeMediansMs,
    worstRoute,
    worstRouteMedianMs,
    routeMedianLimitMs: ROUTE_MEDIAN_LIMIT_MS,
    searchDurationsMs,
    searchP95Ms,
    searchP95LimitMs: SEARCH_P95_LIMIT_MS,
    rendererMetricsBefore: selectMetrics(before.metrics, metricNames),
    rendererMetricsAfter: selectMetrics(after.metrics, metricNames),
  };

  const evidenceDir = resolve(process.cwd(), ".sf-inventory/phase7-performance");
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    resolve(evidenceDir, "browser-trend.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  await testInfo.attach("phase7-browser-performance.json", {
    body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
    contentType: "application/json",
  });

  // This remains a CI regression tripwire. Installed #226 certification keeps
  // the materially tighter T470 navigation/search/mutation and reliability budgets.
  expect(
    worstRouteMedianMs,
    `${worstRoute} median under controlled 4x CPU throttling`,
  ).toBeLessThan(ROUTE_MEDIAN_LIMIT_MS);
  expect(searchP95Ms).toBeLessThan(SEARCH_P95_LIMIT_MS);
});
