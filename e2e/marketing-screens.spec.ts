/**
 * Scripted capture of the REAL app on demo data, for sahelflow.com.
 *
 * Not part of CI. The lead runs it on purpose (see audit notes W3-H1):
 *   SF_DEMO_REFERENCE_NOW=2026-10-28 MARKETING_SCREENS_REPORT=<abs path>.json \
 *   ONLY=e2e/marketing-screens.spec.ts bash audit/waves/tools/e2e_local.sh <wt> <port> p5-auth
 * Needs a sandbox with NO seller data (the demo loader refuses a shop that
 * holds anything outside `demo-`), so a fresh install: this spec creates the
 * owner PIN itself when it lands on /setup.
 *
 * Two clocks are frozen: the SERVER one by SF_DEMO_REFERENCE_NOW (set when the
 * server starts) and the BROWSER one by page.clock. Without the variable the
 * spec skips loudly: a moving clock must never produce pictures.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";

import {
  COOKIE_NAMES,
  FLAGSHIP_IDS,
  LOCALES,
  OUT_DIR,
  SCREENS,
  VIEWPORTS,
  VIEWPORT_NAMES,
  expectedFiles,
  fileName,
  fixedClock,
  forbiddenClaims,
  localStorageValues,
  originalWidth,
  preflight,
  referenceNowProblem,
  relativeTimeWords,
  screenCookies,
  type ScreenLocale,
  type ScreenSpec,
  type ShotRecord,
  type ViewportName,
} from "./support/marketing-screens-plan";

const OWNER_PIN = "12345678";
const REFERENCE_NOW = process.env.SF_DEMO_REFERENCE_NOW?.trim();
const REPORT_PATH = process.env.MARKETING_SCREENS_REPORT?.trim();
// Dev overlay and toasts must not sit on a picture.
const HIDE_OVERLAYS_CSS = "nextjs-portal, [data-nextjs-toast], [data-sonner-toaster], [data-radix-toast-viewport] { display: none !important; }";

async function hydrated(page: Page): Promise<void> {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({ state: "attached", timeout: 30_000 });
}

/** Owner session: the PIN flow of phase5-owner-auth.setup.ts, plus the fresh-install /setup step. */
async function signIn(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1366, height: 768 } });
  await context.addCookies([{ name: COOKIE_NAMES.locale, value: "fr", url: base }]);
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await hydrated(page);
  if (page.url().includes("/setup")) {
    const pin = page.locator('input[type="password"]').first();
    await pin.waitFor({ state: "visible" });
    await pin.fill(OWNER_PIN);
    const confirm = page.locator('input[type="password"]').nth(1);
    if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.fill(OWNER_PIN);
    await page.waitForTimeout(300);
    await page.locator('button[type="submit"]').click({ force: true });
    await page.waitForURL((url) => !url.pathname.includes("/setup"), { waitUntil: "commit", timeout: 90_000 });
  } else {
    await expect(page).toHaveURL(/\/login/);
    const pin = page.locator("#pin");
    await pin.fill(OWNER_PIN);
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { waitUntil: "commit", timeout: 90_000 });
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await hydrated(page);
  return { context, page };
}

interface ApiResult {
  status: number;
  body: unknown;
}

/** A fetch from inside the page, so cookies and the Origin header are the browser's own. */
async function api(page: Page, path: string, method = "GET"): Promise<ApiResult> {
  return page.evaluate(
    async ({ path: target, method: verb }) => {
      const response = await fetch(target, { method: verb, headers: { Accept: "application/json" }, cache: "no-store" });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { status: response.status, body };
    },
    { path, method },
  );
}

function idOf(row: unknown): string[] {
  if (row && typeof row === "object" && "id" in row) {
    const id = (row as { id: unknown }).id;
    return typeof id === "string" ? [id] : [];
  }
  return [];
}

/** The rows of a list response, whatever key the list sits under. */
function rowIds(body: unknown): string[] {
  if (Array.isArray(body)) return body.flatMap(idOf);
  if (body && typeof body === "object") {
    for (const value of Object.values(body)) {
      if (Array.isArray(value) && value.length > 0 && value.every((row) => idOf(row).length > 0)) return value.flatMap(idOf);
    }
  }
  return [];
}

/** Every id of a paged list, stopping when a page adds nothing new. */
async function collectIds(page: Page, path: string): Promise<string[]> {
  const seen = new Set<string>();
  for (let pageNo = 1; pageNo <= 300; pageNo += 1) {
    const result = await api(page, `${path}?page=${pageNo}&pageSize=100`);
    if (result.status !== 200) throw new Error(`GET ${path} answered ${result.status}`);
    const ids = rowIds(result.body);
    const before = seen.size;
    for (const id of ids) seen.add(id);
    const hasNext = result.body && typeof result.body === "object" ? (result.body as { hasNextPage?: unknown }).hasNextPage : undefined;
    if (ids.length === 0 || seen.size === before || hasNext === false) break;
  }
  return [...seen];
}

async function capture(
  browser: Browser,
  base: string,
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>,
  spec: ScreenSpec,
  locale: ScreenLocale,
  viewport: ViewportName,
  reference: string,
  outDir: string,
): Promise<ShotRecord> {
  const v = VIEWPORTS[viewport];
  const file = fileName(spec.name, locale, viewport);
  const record: ShotRecord = {
    file,
    screen: spec.name,
    locale,
    viewport,
    bytes: 0,
    sha256: "",
    width: 0,
    height: 0,
    relativeTimeWords: [],
    forbiddenClaims: [],
    consoleErrors: [],
  };
  const context = await browser.newContext({
    baseURL: base,
    storageState,
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.deviceScaleFactor,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  try {
    await context.addCookies(screenCookies(locale, base));
    const stored = localStorageValues(locale);
    await context.addInitScript((values: Record<string, string>) => {
      try {
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
      } catch {
        /* storage can be unavailable on an error page */
      }
    }, stored);
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") record.consoleErrors.push(message.text().slice(0, 300));
    });
    page.on("pageerror", (error) => record.consoleErrors.push(String(error.message).slice(0, 300)));
    await page.clock.setFixedTime(new Date(fixedClock(reference)));

    const route = spec.route(FLAGSHIP_IDS);
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    if (response && response.status() >= 400) throw new Error(`${route} answered ${response.status()}`);
    await hydrated(page);
    const wanted = new URL(route, base).pathname;
    const landed = new URL(page.url()).pathname;
    if (landed !== wanted) throw new Error(`${route} redirected to ${landed}: the screen is not reachable on this data`);
    await page.locator(spec.waitFor).first().waitFor({ state: "visible", timeout: 45_000 });
    if (spec.scrollTo) await page.locator(spec.scrollTo).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.addStyleTag({ content: HIDE_OVERLAYS_CSS });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(600);

    const text = await page.locator("body").innerText();
    record.relativeTimeWords = relativeTimeWords(text);
    record.forbiddenClaims = forbiddenClaims(text);

    const png = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", caret: "hide" });
    const webp = await sharp(png).webp({ quality: 82, effort: 5 }).toBuffer();
    const meta = await sharp(webp).metadata();
    record.width = meta.width ?? 0;
    record.height = meta.height ?? 0;
    if (record.width !== originalWidth(viewport)) throw new Error(`${file} came out ${record.width} px wide, expected ${originalWidth(viewport)}`);
    await writeFile(resolve(outDir, file), webp);
    record.bytes = webp.length;
    record.sha256 = createHash("sha256").update(webp).digest("hex");
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }
  return record;
}

test.describe("marketing screens: scripted capture of the real app on demo data", () => {
  test("takes 15 screens x 3 languages x 2 sizes", async ({ browser, baseURL }) => {
    if (!REFERENCE_NOW) {
      console.warn("\n*** marketing-screens SKIPPED: SF_DEMO_REFERENCE_NOW is not set. A moving clock must never produce pictures. ***\n");
    }
    test.skip(!REFERENCE_NOW, "SF_DEMO_REFERENCE_NOW is not set: a moving clock must never produce pictures");
    const reference = REFERENCE_NOW ?? "";
    const problem = referenceNowProblem(reference);
    if (problem) throw new Error(problem);
    test.setTimeout(3 * 60 * 60_000);

    const base = baseURL ?? "http://localhost:3000";
    const outDir = resolve(process.cwd(), OUT_DIR);
    await mkdir(outDir, { recursive: true });

    const admin = await signIn(browser, base);
    const loaded = await api(admin.page, "/api/demo-data", "POST");
    if (loaded.status !== 201) {
      // 409-style answers mean data is already there; the preflight below decides whether it is the demo.
      console.warn(`POST /api/demo-data answered ${loaded.status}: ${JSON.stringify(loaded.body).slice(0, 300)}`);
      if (loaded.status !== 409) throw new Error(`POST /api/demo-data answered ${loaded.status}`);
    }
    const customerIds = await collectIds(admin.page, "/api/customers");
    const orderIds = await collectIds(admin.page, "/api/orders");
    for (const path of [`/api/orders/${FLAGSHIP_IDS.orderId}`, `/api/customers/${FLAGSHIP_IDS.customerId}`]) {
      const found = await api(admin.page, path);
      if (found.status !== 200) throw new Error(`${path} answered ${found.status}: the flagship demo record is missing`);
    }
    const checked = preflight({ referenceNow: reference, customerIds, orderIds, ids: FLAGSHIP_IDS });
    if (!checked.ok) throw new Error(`Preflight refused to shoot:\n- ${checked.problems.join("\n- ")}`);
    const storageState = await admin.context.storageState();
    await admin.context.close();

    const records: ShotRecord[] = [];
    try {
      for (const locale of LOCALES) {
        for (const viewport of VIEWPORT_NAMES) {
          for (const spec of SCREENS) {
            records.push(await capture(browser, base, storageState, spec, locale, viewport, reference, outDir));
          }
        }
      }
    } finally {
      const report = { referenceNow: reference, expected: expectedFiles().length, taken: records.filter((r) => !r.error).length, shots: records };
      if (REPORT_PATH) {
        await mkdir(dirname(REPORT_PATH), { recursive: true });
        await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
      } else {
        console.warn("MARKETING_SCREENS_REPORT is not set: the report is only printed below");
        console.warn(JSON.stringify(report).slice(0, 4000));
      }
    }

    const timed = records.filter((r) => r.relativeTimeWords.length > 0);
    if (timed.length > 0) {
      const description = `${timed.length} shot(s) show relative times that follow the SERVER clock: ${timed.map((r) => `${r.file} [${r.relativeTimeWords.join(" | ")}]`).join("; ")}`;
      console.warn(description);
      test.info().annotations.push({ type: "relative-times", description });
    }
    const failures = records
      .filter((r) => r.error || r.forbiddenClaims.length > 0)
      .map((r) => `${r.file}: ${r.error ?? r.forbiddenClaims.map((claim) => claim.excerpt).join(" | ")}`);
    expect(failures).toEqual([]);
    expect(records).toHaveLength(expectedFiles().length);
  });
});
