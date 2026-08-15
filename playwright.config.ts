import { defineConfig, devices } from "@playwright/test";
import { assertTestSandbox } from "./scripts/test-sandbox";

assertTestSandbox("Playwright");

const phase5OwnerStorageState =
  process.env.SF_PHASE5_OWNER_STORAGE_STATE?.trim() || null;
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
const serverReadyURL =
  process.env.E2E_SERVER_READY_URL || `${baseURL}/icons/sahelflow-mark.png`;

/**
 * Playwright E2E configuration.
 *
 * Tests are in the e2e/ directory. Run with: bun run test:e2e
 *
 * CI starts its own Next server. Server readiness intentionally probes an
 * existing public static asset instead of `/`: root-route rendering exercises
 * auth/RSC/database work that belongs to the tests themselves and can make a
 * healthy server look unavailable during cold hosted-runner startup.
 *
 * The 90s value is CI bootstrap infrastructure tolerance, not a SahelFlow launch
 * performance budget. Installed launch/navigation/search/mutation budgets remain
 * governed separately by #226 and the installed T470/floor evidence contract.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // sequential — tests share the same DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // single worker — shared SQLite DB
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "x-requested-with": "sahelflow", // CSRF header
    },
  },
  projects: phase5OwnerStorageState
    ? [
        {
          name: "phase5-owner-auth",
          testMatch: /phase5-owner-auth\.setup\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            storageState: { cookies: [], origins: [] },
          },
        },
        {
          name: "chromium",
          testIgnore: /phase5-owner-auth\.setup\.ts/,
          use: {
            ...devices["Desktop Chrome"],
            storageState: phase5OwnerStorageState,
          },
          dependencies: ["phase5-owner-auth"],
        },
      ]
    : [
        {
          name: "chromium",
          testIgnore: /phase5-owner-auth\.setup\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
      ],
  webServer: process.env.CI
    ? {
        command: "bun run dev",
        url: serverReadyURL,
        reuseExistingServer: false,
        timeout: 90_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
