import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

const DESKTOP = { width: 1366, height: 768 };

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

function formatPageError(error: Error) {
  return `[pageerror] ${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
}

test("Risk route exposes the underlying runtime diagnostic", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize(DESKTOP);

  const diagnostics: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      diagnostics.push(`[console.error] ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => diagnostics.push(formatPageError(error));
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  const response = await page.goto("/risk?days=30&tab=overview", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBeLessThan(400);
  await waitForHydration(page);
  await page.waitForTimeout(1_000);

  const pageError = page.locator('[data-testid="page-error"]');
  const renderedError = await pageError.isVisible().catch(() => false);
  const diagnosticBody = diagnostics.length
    ? diagnostics.join("\n\n")
    : "No browser console/pageerror diagnostic was emitted.";

  await testInfo.attach("risk-browser-diagnostics", {
    body: diagnosticBody,
    contentType: "text/plain",
  });
  await page.screenshot({
    path: testInfo.outputPath("risk-route-diagnostic.png"),
    fullPage: false,
    animations: "disabled",
  });

  if (renderedError) {
    const boundaryText = await pageError.innerText().catch(() => "");
    throw new Error(
      `Risk rendered the SahelFlow page-error boundary.\nBoundary: ${boundaryText}\n\n${diagnosticBody}`,
    );
  }

  await expect(page.locator('[data-risk-analytics-generation="class-aaa"]')).toBeVisible({
    timeout: 30_000,
  });
});
