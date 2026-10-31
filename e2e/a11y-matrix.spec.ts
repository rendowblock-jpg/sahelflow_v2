import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import {
  DEFAULT_RESULTS_PATH,
  ROUTES,
  VIEWPORTS,
  cells,
  classifyBuild,
  compareRuns,
  countByMode,
  formatSummary,
  isReportOnly,
  modeSetup,
  parseResultLines,
  passedCellIds,
  resolveRoutes,
  resultLine,
  routeAuth,
  summarize,
  themeStorage,
  cellId,
  type Build,
  type Cell,
  type ViolationSummary,
} from "./support/a11y-matrix-plan";
import {
  collectPageFacts,
  gateCell,
  judgeKeyboardTour,
  judgePageFacts,
  runKeyboardTour,
  waitForWorkSurface,
} from "./support/page-checks";

/**
 * W3-H2 accessibility matrix: axe (strict, no exclusions) plus layout and keyboard checks over every page x
 * ar/fr/en x light/dark x phone/desktop (and the extra modes), one result line per cell.
 *
 * Run it (the plan, the filters, the result format and how to read them are in audit/waves/W3-H2.md):
 *   ONLY=e2e/a11y-matrix.spec.ts bash audit/waves/tools/e2e_local.sh wt-w3h2 4450 p67
 * Filters: A11Y_LOCALES, A11Y_THEMES, A11Y_VIEWPORTS, A11Y_MODES (all = every mode), A11Y_ONLY=/orders,/inbox,
 * A11Y_SHARD=i/n, A11Y_REPORT_ONLY=1 (discovery: records everything, never fails), A11Y_RESULTS=<jsonl path>,
 * A11Y_RESUME=0 (do not skip cells that already passed), A11Y_BUILD=dev|prod, A11Y_BASELINE=<older jsonl> (prints what changed).
 * Needs the owner storage state (SF_PHASE5_OWNER_STORAGE_STATE) on a rich-seeded database for the owner pages.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PER_CELL_TIMEOUT_MS = 120_000;
const RESULTS_PATH = resolve(process.cwd(), process.env.A11Y_RESULTS?.trim() || DEFAULT_RESULTS_PATH);
const MAX_MESSAGES_SHOWN = 40;

// stdout, not console: the repo lint allows only console.warn / console.error
const say = (text: string): void => {
  process.stdout.write(`${text}\n`);
};

function readRecords(path: string) {
  return existsSync(path) ? parseResultLines(readFileSync(path, "utf8")) : [];
}

function ownerStorageState(): string {
  const file = process.env.SF_PHASE5_OWNER_STORAGE_STATE?.trim();
  if (!file) {
    throw new Error(
      "SF_PHASE5_OWNER_STORAGE_STATE is required for the owner pages of the a11y matrix (run it through audit/waves/tools/e2e_local.sh ... p67, which signs the owner in once)",
    );
  }
  return file;
}

async function newCellPage(browser: Browser, cell: Cell) {
  const setup = modeSetup(cell.mode, cell.locale);
  const storage = themeStorage(cell.theme, cell.locale);
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: VIEWPORTS[cell.viewport],
    locale: "fr-DZ",
    colorScheme: cell.theme,
    extraHTTPHeaders: { "x-requested-with": "sahelflow" },
    storageState: routeAuth(cell.route) === "owner" ? ownerStorageState() : { cookies: [], origins: [] },
  });
  await context.addCookies(Object.entries(storage).map(([name, value]) => ({ name, value, url: BASE })));
  await context.addInitScript((values: Record<string, string>) => {
    try {
      localStorage.setItem("theme", values["sahelflow-theme"] ?? "light");
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    } catch {
      /* storage not available on this document */
    }
  }, storage);
  const page = await context.newPage();
  await page.emulateMedia({ forcedColors: setup.forcedColors, reducedMotion: setup.reducedMotion, colorScheme: cell.theme });
  return { context, page, setup };
}

async function scriptSources(browser: Browser): Promise<{ hrefsByList: Record<string, string[]>; scripts: string[] }> {
  const { context, page } = await newCellPage(browser, {
    route: "/dashboard",
    locale: "fr",
    theme: "light",
    viewport: "desktop",
    mode: "normal",
  });
  try {
    const hrefsByList: Record<string, string[]> = {};
    let scripts: string[] = [];
    const lists = [...new Set(ROUTES.flatMap((route) => (route.discover ? [route.discover.list] : [])))];
    for (const list of lists) {
      await page.goto(list, { waitUntil: "domcontentloaded", timeout: PER_CELL_TIMEOUT_MS });
      await waitForWorkSurface(page);
      await page.waitForTimeout(1_500); // list rows arrive after the heading
      hrefsByList[list] = await page.$$eval("a[href]", (anchors) => anchors.map((a) => a.getAttribute("href") ?? ""));
      if (scripts.length === 0) {
        scripts = await page.$$eval("script[src]", (els) => els.map((el) => el.getAttribute("src") ?? ""));
      }
    }
    return { hrefsByList, scripts };
  } finally {
    await context.close();
  }
}

test.describe("a11y matrix", () => {
  test("gate self-test: an injected violation fails, the repaired page passes", async ({ page }) => {
    // The check of the check, on a blank document (no app visit), the same pattern as phase6-7-completion.spec.ts.
    const cell: Cell = { route: "/self-test", locale: "en", theme: "light", viewport: "desktop", mode: "normal" };
    const doc = (button: string) =>
      `<!doctype html><html lang="en"><head><title>matrix self-test</title></head><body><main><h1>Self-test</h1>${button}</main></body></html>`;
    await page.setContent(doc("<button></button>"));
    const broken = await gateCell(page, cell, { reportOnly: false, failures: [] });
    expect(broken.status).toBe("fail");
    expect(broken.shouldThrow).toBe(true);
    expect(broken.message).toMatch(/button-name/);
    await page.setContent(doc('<button type="button">Save</button>'));
    const repaired = await gateCell(page, cell, { reportOnly: false, failures: [] });
    expect(repaired.status).toBe("pass");
  });

  test("matrix", async ({ browser }) => {
    test.setTimeout(30 * 60_000); // raised below once the cell count is known
    const reportOnly = isReportOnly(process.env);

    const discovered = await scriptSources(browser);
    const build: Build = classifyBuild(process.env, discovered.scripts);
    const { routes, missing } = resolveRoutes(ROUTES, discovered.hrefsByList);
    const selected = cells(process.env, routes);
    if (selected.length === 0) {
      throw new Error("the A11Y_* filters selected 0 cells (check A11Y_ONLY against the concrete routes: " + routes.join(", ") + ")");
    }
    test.setTimeout(Math.max(30 * 60_000, selected.length * PER_CELL_TIMEOUT_MS));

    mkdirSync(dirname(RESULTS_PATH), { recursive: true });
    const earlier = readRecords(RESULTS_PATH);
    const resume = process.env.A11Y_RESUME?.trim() !== "0";
    const alreadyPassed = resume ? passedCellIds(earlier, build) : new Set<string>();
    const todo = selected.filter((cell) => !alreadyPassed.has(cellId(cell)));
    say(
      `a11y matrix: build=${build} reportOnly=${reportOnly} routes=${routes.length} selected=${selected.length} (${JSON.stringify(countByMode(selected))}) resumedPassing=${selected.length - todo.length} toRun=${todo.length}`,
    );
    for (const pattern of missing) {
      say(`a11y matrix: no detail page found for ${pattern} (no row on its list page)`);
      appendFileSync(
        RESULTS_PATH,
        resultLine(
          { route: pattern, locale: "en", theme: "light", viewport: "desktop", mode: "normal" },
          { status: "skip", build, violations: [], failures: ["no detail page found on the list page"], at: new Date().toISOString() },
        ) + "\n",
      );
    }

    const messages: string[] = [];
    for (const cell of todo) {
      const started = Date.now();
      let status: "pass" | "fail" = "fail";
      let violations: ViolationSummary[] = [];
      let failures: string[] = [];
      let message = "";
      let shouldThrow = true;
      const { context, page, setup } = await newCellPage(browser, cell);
      try {
        const response = await page.goto(cell.route, { waitUntil: "domcontentloaded", timeout: PER_CELL_TIMEOUT_MS });
        const checks: string[] = [];
        if (response && response.status() >= 400) checks.push(`HTTP ${response.status()} for ${cell.route}`);
        checks.push(...(await waitForWorkSurface(page)));
        const finalPath = new URL(page.url()).pathname;
        if (finalPath !== cell.route) checks.push(`the page ended on ${finalPath}, expected ${cell.route}`);
        if (setup.css) {
          await page.addStyleTag({ content: setup.css });
          await page.waitForTimeout(400);
        }
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        checks.push(...judgePageFacts(await collectPageFacts(page, cell.mode), cell));
        if (cell.mode === "keyboard") checks.push(...judgeKeyboardTour(await runKeyboardTour(page)));
        const gate = await gateCell(page, cell, { reportOnly, failures: checks });
        ({ status, violations, failures, message, shouldThrow } = gate);
      } catch (error) {
        failures = [`error while measuring: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`];
        message = `a11y matrix cell ${cellId(cell)} could not be measured\n${failures.join("\n")}`;
        shouldThrow = !reportOnly;
      } finally {
        await context.close();
      }
      appendFileSync(
        RESULTS_PATH,
        resultLine(cell, { status, build, violations, failures, at: new Date().toISOString() }) + "\n",
      );
      say(`${status === "pass" ? "PASS" : "FAIL"} ${cellId(cell)} ${Date.now() - started} ms`);
      if (shouldThrow) {
        messages.push(message);
        expect.soft(false, message).toBe(true);
      }
    }

    const records = readRecords(RESULTS_PATH).filter((record) => record.build === build);
    say(formatSummary(summarize(records)));
    const baselinePath = process.env.A11Y_BASELINE?.trim();
    if (baselinePath) {
      const change = compareRuns(parseResultLines(readFileSync(resolve(process.cwd(), baselinePath), "utf8")), records);
      say(
        `against ${baselinePath}: new failures ${change.newFailures.length}, fixed ${change.fixed.length}, still failing ${change.stillFailing.length}, new violations ${change.newViolations.length}`,
      );
    }
    if (!reportOnly) {
      expect.soft(missing, "every detail page must be found on its list page").toEqual([]);
      if (messages.length > MAX_MESSAGES_SHOWN) {
        say(`${messages.length - MAX_MESSAGES_SHOWN} more failing cells: see ${RESULTS_PATH}`);
      }
    }
  });
});
