import { defineConfig } from "@playwright/test";

// W3b PWA lab: no webServer, no next dev. The lab (control-plane/pwa/tests/phone-lab.test.ts, PHONE_LAB=1) serves the phone app on 4580.
// Run: PLAYWRIGHT_BROWSERS_PATH=/opt/agent-sandbox/tools/playwright-browsers bunx playwright test -c e2e/playwright.phone-lab.config.ts
export default defineConfig({
  testDir: ".", testMatch: "phone-lab.spec.ts", timeout: 480_000, workers: 1, fullyParallel: false, retries: 0,
  reporter: [["list"], ["json", { outputFile: "/tmp/w190-pw.json" }]], outputDir: "/tmp/w190-pw-out",
  expect: { timeout: 10_000 },
  use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, actionTimeout: 10_000, browserName: "chromium" },
});
