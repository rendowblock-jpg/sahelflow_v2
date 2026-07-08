/**
 * E2E: Language switch — FR → AR (RTL) → FR (LTR).
 *
 * Tests that the language dropdown in the topbar:
 *   - switches the locale cookie (sahelflow-locale)
 *   - flips <html dir> between "ltr" and "rtl"
 *   - flips <html lang> between "fr" and "ar"
 *   - re-renders all visible strings in the chosen locale
 *
 * Pattern: pure browser test — no API seeding needed. The dashboard is
 * visited in French (default), then the topbar Globe dropdown is opened and
 * "العربية" is clicked. After the locale flips, the page is reloaded to
 * assert the SSR-rendered <html> attributes match the new cookie. Then we
 * switch back to "Français" and assert LTR.
 *
 * Auth: the test logs in first so the topbar (with the language dropdown) is
 * rendered. The dashboard itself doesn't require API data for these assertions.
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

test.describe("Language switch", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("FR (LTR) → Arabic (RTL) → back to FR (LTR)", async ({ page }) => {
    // ── 1. Visit the dashboard in French (default locale) ──────────────────
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // The dashboard renders "Tableau de bord" (nav.dashboard in fr).
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // <html> should be LTR + lang="fr" (default).
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // ── 2. Open the language dropdown (Globe icon button) ──────────────────
    // The trigger button shows the current locale code uppercased ("FR").
    const langTrigger = page
      .getByRole("button", { name: /^FR$/i })
      .first();
    await langTrigger.waitFor({ state: "visible", timeout: 5_000 });
    await langTrigger.click();

    // ── 3. Click "العربية" ─────────────────────────────────────────────────
    const arabicOption = page.getByRole("menuitem", { name: /العربية/ }).first();
    await arabicOption.waitFor({ state: "visible", timeout: 5_000 });
    await arabicOption.click();

    // Wait for the router.refresh() to settle + the new locale to apply.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    // The locale cookie should now be "ar".
    const cookies = await page.context().cookies();
    const localeCookie = cookies.find((c) => c.name === "sahelflow-locale");
    expect(localeCookie?.value).toBe("ar");

    // Reload so the server-rendered <html> attributes reflect the new cookie
    // (router.refresh() re-renders the RSC tree, but the very first byte of
    // the document — <html lang/dir> — was sent before the cookie flip).
    await page.reload();
    await page.waitForLoadState("networkidle");

    // <html> should now be RTL + lang="ar".
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    // An Arabic string should now be visible. The dashboard's "nav.dashboard"
    // translation is "لوحة التحكم" — visible either in the sidebar or in the page header.
    await expect(page.getByText("لوحة التحكم", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 4. Switch back to French ───────────────────────────────────────────
    // The trigger now displays "AR" (the current locale code, uppercased).
    const langTriggerAfterAr = page
      .getByRole("button", { name: /^AR$/i })
      .first();
    await langTriggerAfterAr.waitFor({ state: "visible", timeout: 5_000 });
    await langTriggerAfterAr.click();

    const frenchOption = page.getByRole("menuitem", { name: /Français/ }).first();
    await frenchOption.waitFor({ state: "visible", timeout: 5_000 });
    await frenchOption.click();

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const cookiesAfter = await page.context().cookies();
    const localeCookieAfter = cookiesAfter.find((c) => c.name === "sahelflow-locale");
    expect(localeCookieAfter?.value).toBe("fr");

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Back to LTR + lang="fr".
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // The French dashboard title should be visible again.
    await expect(page.getByText("Tableau de bord", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
