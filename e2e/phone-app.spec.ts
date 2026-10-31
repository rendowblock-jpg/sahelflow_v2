import { expect, test, type Page } from "@playwright/test";

/**
 * W3b F6b: the phone app (control-plane/pwa) at 360 px, Arabic (RTL) and English.
 *
 * WRITTEN, NEVER RUN. No browser was available when this was written: every selector below comes from reading the source.
 * Expect to fix some of them on the first run.
 *
 * What it needs: the built phone app served as static files (SPA fallback to index.html) and its address in PWA_BASE_URL, e.g.
 *   cd control-plane/pwa && node build.mjs && <serve dist at http://localhost:4173>
 *   PWA_BASE_URL=http://localhost:4173 ONLY=e2e/phone-app.spec.ts bash audit/waves/tools/e2e_local.sh
 * Without PWA_BASE_URL every test is skipped on purpose. The two lazy-screen tests (devices, install) also need PWA_LAZY_SCREENS=1,
 * because in this build nothing renders a lazy screen module into the page yet (see audit/waves/W3B-F6B.md).
 */
const BASE = process.env.PWA_BASE_URL ?? "";
const LAZY = process.env.PWA_LAZY_SCREENS === "1";
const LOCALES = [{ id: "ar", dir: "rtl" }, { id: "en", dir: "ltr" }] as const;
const SCREENS = ["welcome", "pair", "today", "settings"] as const;
const PIN = "24681357";

test.skip(BASE === "", "NOT RUN: set PWA_BASE_URL to the built phone app");
test.use({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

// A clock the test can push forward: the lock counts the minutes the app was hidden with Date.now().
async function open(page: Page, locale: string, query: string): Promise<void> {
  await page.addInitScript((l: string) => {
    const w = window as Window & { __skew?: number };
    const real = Date.now.bind(Date); w.__skew = 0; Date.now = () => real() + (w.__skew ?? 0);
    try { if (!localStorage.getItem("sf.locale")) localStorage.setItem("sf.locale", l); } catch { /* private mode */ }
  }, locale);
  await page.goto(`${BASE}/${query}`);
  await page.locator("#main").waitFor();
}
const sideways = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const smallTargets = (page: Page): Promise<string[]> =>
  page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input,select,[role=button]")).flatMap((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44) ? [`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
  }));
const hide = (page: Page, hidden: boolean, skewMinutes = 0): Promise<void> =>
  page.evaluate(([h, m]) => {
    const w = window as Window & { __skew?: number }; w.__skew = (w.__skew ?? 0) + (m as number) * 60_000;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, [hidden, skewMinutes] as const);

for (const loc of LOCALES) {
  test.describe(`phone app, ${loc.id}`, () => {
    for (const screen of SCREENS) {
      test(`${screen}: ${loc.dir}, no sideways scroll, every target at least 44 px`, async ({ page }) => {
        await open(page, loc.id, `?screen=${screen}`);
        expect(await page.evaluate(() => document.documentElement.dir)).toBe(loc.dir);
        expect(await sideways(page)).toBeLessThanOrEqual(0);
        expect(await smallTargets(page)).toEqual([]);
      });
    }

    test("settings: language switch, remove this phone works offline and leaves no database", async ({ page, context }) => {
      await open(page, loc.id, "?screen=settings");
      await page.locator('[data-lang="fr"]').click();
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("fr");
      await page.locator(`[data-lang="${loc.id}"]`).click();
      await context.setOffline(true);
      await page.locator('[data-act="remove"]').click();
      await expect(page.locator('[role="alertdialog"]')).toBeVisible();
      await page.locator('[data-act="remove-yes"]').click();
      await expect(page.locator(".stamp-ok")).toBeVisible();
      expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain("sfapp");
    });

    test("lock: set a PIN, 5 minutes hidden asks for it, a wrong PIN stays locked, the right one opens", async ({ page }) => {
      await open(page, loc.id, "?screen=settings");
      await page.locator('[data-act="lock-set"]').click();
      await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter");
      await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter");
      await expect(page.locator('[data-screen],[data-nav="settings"]').first()).toBeVisible();
      await hide(page, true); await hide(page, false, 6);
      await expect(page.locator("#pin")).toBeVisible();
      await page.locator("#pin").fill("00000000"); await page.locator("#pin").press("Enter");
      await expect(page.locator("#pin")).toBeVisible();
      await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter");
      await expect(page.locator("#pin")).toHaveCount(0);
    });

    test("devices screen (needs PWA_LAZY_SCREENS=1): honest PIN line, no sideways scroll, targets, offline state", async ({ page, context }) => {
      test.skip(!LAZY, "NOT RUN: no code renders the lazy settings screen into the page yet");
      await open(page, loc.id, "?screen=devices");
      const root = page.locator('[data-screen="settings"]');
      await expect(root).toBeVisible();
      await expect(page.locator('[data-testid="pin-note"]')).toContainText(loc.id === "en" ? "does not encrypt" : "ولا يشفّر");
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      expect(await smallTargets(page)).toEqual([]);
      await context.setOffline(true);
      await expect(root).toHaveAttribute("data-state", /offline/);
      await expect(root.locator('[data-act="s-remove"]')).toBeEnabled();
    });

    test("install screen (needs PWA_LAZY_SCREENS=1): shows, no sideways scroll, targets", async ({ page }) => {
      test.skip(!LAZY, "NOT RUN: no code renders the lazy install screen into the page yet");
      await open(page, loc.id, "?screen=install");
      await expect(page.locator('[data-screen="install"]')).toBeVisible();
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      expect(await smallTargets(page)).toEqual([]);
    });
  });
}
