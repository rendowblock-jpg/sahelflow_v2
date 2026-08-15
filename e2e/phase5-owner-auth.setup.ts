import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { expect, test as setup } from "@playwright/test";

import { AUTH_COOKIE } from "@/lib/auth/config";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

setup("authenticate representative owner once", async ({ page, context, baseURL }) => {
  const authFile = process.env.SF_PHASE5_OWNER_STORAGE_STATE?.trim();
  if (!authFile) {
    throw new Error(
      "SF_PHASE5_OWNER_STORAGE_STATE is required for the representative auth setup project",
    );
  }

  await mkdir(dirname(authFile), { recursive: true });
  await page.setViewportSize(DESKTOP);
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: "fr",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
  if (page.url().includes("/setup")) {
    throw new Error(
      "Representative Phase 5 evidence requires the rich seeded owner authority",
    );
  }
  await expect(page).toHaveURL(/\/login/);

  const pin = page.locator("#pin");
  await pin.fill(OWNER_PIN);
  await expect(pin).toHaveValue(OWNER_PIN);
  const submit = page.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    waitUntil: "commit",
    timeout: 90_000,
  });

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
  expect(page.url()).toContain("/dashboard");

  const cookies = await context.cookies();
  expect(
    cookies.some(
      (cookie) => cookie.name === AUTH_COOKIE && cookie.value.length > 0,
    ),
    "representative auth setup must persist the canonical owner session cookie",
  ).toBe(true);

  await context.storageState({ path: authFile });
});
