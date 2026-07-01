import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    extraHTTPHeaders: {
      "x-requested-with": "sahelflow", // CSRF header
    },
  },
  projects: [
    {
      name: "chromium",
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
