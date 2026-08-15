import { defineConfig, devices } from "@playwright/test";
import { assertTestSandbox } from "./scripts/test-sandbox";

assertTestSandbox("Playwright");

const phase5OwnerStorageState =
  process.env.SF_PHASE5_OWNER_STORAGE_STATE?.trim() || null;

/**
 * Playwright E2E configuration.
 *
 * Tests are in the e2e/ directory. Run with: bun run test:e2e
 * Prerequisites: bun run dev must be running on localhost:3000.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // sequential — tests share the same DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // single worker — shared SQLite DB
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
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
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
