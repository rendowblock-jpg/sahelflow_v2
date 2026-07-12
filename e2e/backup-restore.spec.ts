/**
 * E2E: Backup + restore — data safety round-trip.
 *
 * Tests the critical data-safety path: create a backup, simulate data loss
 * (delete a sentinel record), restore the backup, verify the data is back.
 *
 * Pattern: page.request fast-seeds a sentinel customer, creates a backup via
 * POST /api/backup/create, deletes the sentinel (soft-delete via
 * /api/customers/[id]), verifies the sentinel is gone from the customer list,
 * then restores the backup through the real UI on /settings (click the row's
 * Restore button, then click the confirm action in the AlertDialog). After
 * restore, the sentinel should reappear because the backup snapshot was
 * taken BEFORE the delete.
 *
 * The /settings page is visited before + after to verify the backup-restore
 * panel renders. The create goes through the API for reliability; the restore
 * goes through the UI to exercise the actual user path (the panel sends the
 * required `confirm: "RESTORE"` literal — see api/backup/restore/route.ts).
 *
 * DESTRUCTIVE: this test overwrites the active shop's SQLite file during
 * restore. It MUST run against a dev/test DB, never production.
 *
 * Auth: page.request is authenticated via the login cookie.
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

test.describe("Backup + restore round-trip", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("backup → delete sentinel → restore → sentinel back", async ({ page }) => {
    // ── 1. Fast-seed: a sentinel customer that's easy to find later ────────
    const sentinelSuffix = Date.now().toString();
    const sentinelName = `BACKUP_TEST_${sentinelSuffix}`;
    const sentinelPhone = `0555${sentinelSuffix.slice(-6)}`;

    const createRes = await page.request.post("/api/customers", {
      data: {
        name: sentinelName,
        phone: sentinelPhone,
        wilaya: "Alger",
        commune: "Hydra",
        address: "1 Sentinel Street",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const sentinel = (await createRes.json()).customer as { id: string };
    expect(sentinel.id).toBeTruthy();

    // ── 2. UI: visit /settings — backup-restore panel renders ──────────────
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // ── 3. Create a backup via API (includes the sentinel) ─────────────────
    const backupRes = await page.request.post("/api/backup/create");
    expect(backupRes.ok()).toBeTruthy();
    const backup = (await backupRes.json()) as { filename: string; size: number };
    expect(backup.filename).toBeTruthy();
    expect(backup.size).toBeGreaterThan(0);

    // ── 4. List backups via API — verify our new backup is present ────────
    const listRes = await page.request.get("/api/backup/list");
    expect(listRes.ok()).toBeTruthy();
    const list = (await listRes.json()) as {
      backups: Array<{ filename: string; size: number }>;
    };
    const found = list.backups.find((b) => b.filename === backup.filename);
    expect(found).toBeDefined();

    // ── 5. Simulate data loss: delete the sentinel (soft-delete via API) ───
    const deleteRes = await page.request.delete(`/api/customers/${sentinel.id}`);
    expect(deleteRes.ok()).toBeTruthy();

    // Verify the sentinel no longer appears in the customer list (filtered by deletedAt:null).
    const custListAfterDelete = (await (await page.request.get("/api/customers?pageSize=100")).json()) as {
      customers: Array<{ id: string; name: string }>;
    };
    const sentinelStillThere = custListAfterDelete.customers.find((c) => c.id === sentinel.id);
    expect(sentinelStillThere).toBeUndefined();

    // ── 6. Restore the backup via the UI (exercises the real user path) ────
    // The /settings page was loaded before the backup was created, so the
    // panel's list is stale. Reload to pick up the new backup row.
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    // Find the row for our backup file and click its Restore button.
    const backupRow = page.locator("tr", { hasText: backup.filename }).first();
    await expect(backupRow).toBeVisible({ timeout: 10_000 });
    await backupRow
      .getByRole("button", { name: /Restore|Restaurer|استعادة/ })
      .click();

    // The ConfirmDialog (AlertDialog) opens — its confirm action triggers
    // the restore API call. Race the click against waitForResponse so we
    // know the request landed and returned.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Mark the current page so we can detect the post-restore reload (the
    // panel calls window.location.reload() ~800ms after the success toast).
    await page.evaluate(() => {
      (window as unknown as { __preRestore?: boolean }).__preRestore = true;
    });

    const restoreResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/backup/restore") &&
        resp.request().method() === "POST",
      { timeout: 30_000 },
    );
    await dialog
      .getByRole("button", { name: /Restore|Restaurer|استعادة/ })
      .click();
    const restoreResponse = await restoreResponsePromise;
    expect(restoreResponse.ok()).toBeTruthy();

    // Wait for the panel's post-success window.location.reload() to fire +
    // settle, then give Prisma time to reconnect before querying the API.
    await page.waitForFunction(
      () => !(window as unknown as { __preRestore?: boolean }).__preRestore,
      { timeout: 15_000 },
    );
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await page.waitForTimeout(1500);

    // ── 7. Verify the sentinel is back (restore brought it back) ───────────
    // After restore, the DB is the snapshot taken at step 3 — before the delete.
    // The sentinel should be present + NOT soft-deleted.
    const custListAfterRestoreRes = await page.request.get("/api/customers?pageSize=100");
    // The first request after restore may 500 if Prisma is still reconnecting;
    // retry once after a short wait.
    let custListAfterRestore: {
      customers: Array<{ id: string; name: string }>;
    };
    if (custListAfterRestoreRes.ok()) {
      custListAfterRestore = await custListAfterRestoreRes.json();
    } else {
      await page.waitForTimeout(1500);
      custListAfterRestore = await (await page.request.get("/api/customers?pageSize=100")).json();
    }
    const sentinelRestored = custListAfterRestore.customers.find((c) => c.id === sentinel.id);
    expect(sentinelRestored).toBeDefined();
    if (!sentinelRestored) throw new Error("sentinel not restored — unreachable after expect");
    expect(sentinelRestored.name).toBe(sentinelName);

    // ── 8. Spot-check: products + orders also intact ───────────────────────
    // The seeded DB has products + orders; after restore they should still be there.
    const productsList = (await (await page.request.get("/api/products?pageSize=100")).json()) as {
      total: number;
    };
    expect(productsList.total).toBeGreaterThan(0);

    const ordersList = (await (await page.request.get("/api/orders?pageSize=100")).json()) as {
      total: number;
    };
    expect(ordersList.total).toBeGreaterThan(0);
  });
});
