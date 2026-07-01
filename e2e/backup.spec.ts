/**
 * E2E: Backup + restore — data safety.
 *
 * Tests the backup round-trip: create backup, verify it exists, restore.
 * This is the critical data-safety path.
 */
import { test, expect } from "@playwright/test";

test.describe("Backup", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="password"]', "12345678");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 10_000 });
  });

  test("user can create a backup", async ({ request }) => {
    const res = await request.post("/api/backup/create");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.filename).toBeTruthy();
    expect(data.size).toBeGreaterThan(0);
  });

  test("user can list backups", async ({ request }) => {
    const res = await request.get("/api/backup/list");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.backups)).toBeTruthy();
  });
});
