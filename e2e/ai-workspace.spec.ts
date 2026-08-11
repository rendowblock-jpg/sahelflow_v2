import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const OWNER_PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

async function waitForHydration(page: Page) {
  await page.locator('html[data-sf-hydrated="true"]').waitFor({
    state: "attached",
    timeout: 30_000,
  });
}

async function ensureOwnerSession(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  if (page.url().includes("/login")) {
    const pin = page.locator("#pin");
    await pin.fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
      timeout: 90_000,
    });
  }
}

test.describe.serial("AI operational workspace evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: DESKTOP });
    const page = await context.newPage();
    try {
      await context.addCookies([
        {
          name: "sahelflow-locale",
          value: "fr",
          url: baseURL ?? "http://localhost:3000",
        },
      ]);
      await ensureOwnerSession(page);
      ownerSessionCookies = await context.cookies();
      expect(ownerSessionCookies.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async ({ context, page, baseURL }) => {
    await page.setViewportSize(DESKTOP);
    await context.addCookies(ownerSessionCookies);
    await context.addCookies([
      {
        name: "sahelflow-locale",
        value: "fr",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("desktop workspace exposes safe setup truth and durable session creation", async ({
    page,
  }) => {
    const workspace = page.locator('[data-ai-workspace="v2"]');
    await expect(workspace).toBeVisible();
    await expect(page.locator('[data-ai-sessions="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-thread="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-context="true"]')).toBeVisible();

    const status = await page.evaluate(async () => {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`AI status returned ${response.status}`);
      return (await response.json()) as Record<string, unknown>;
    });
    expect(Object.keys(status).sort()).toEqual(
      ["consentAccepted", "keyConfigured", "provider", "ready"].sort(),
    );
    expect(status).not.toHaveProperty("apiKey");
    expect(status).not.toHaveProperty("secret");

    await page.getByRole("button", { name: "Nouvelle session" }).first().click();
    await expect(page.locator("[data-ai-session]").first()).toBeVisible();
    await expect(page.locator('[data-ai-thread="true"]')).toContainText(
      "Nouvelle conversation",
    );

    const composer = page.getByRole("textbox", {
      name: "Posez une question sur vos opérations…",
    });
    if (status.ready === true) {
      await expect(composer).toBeEnabled();
    } else {
      await expect(composer).toBeDisabled();
      await expect(workspace).toContainText(
        "La configuration IA demande votre attention",
      );
    }
  });

  test("mobile drill-in stays single-pane and Arabic geometry remains RTL-safe", async ({
    page,
    context,
    baseURL,
  }) => {
    if ((await page.locator("[data-ai-session]").count()) === 0) {
      await page.getByRole("button", { name: "Nouvelle session" }).first().click();
      await expect(page.locator("[data-ai-session]").first()).toBeVisible();
    }

    await page.setViewportSize({ width: 640, height: 768 });
    await expect(page.locator('[data-ai-sessions="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-thread="true"]')).toHaveCount(0);

    await page.locator("[data-ai-session]").first().click();
    await expect(page.locator('[data-ai-thread="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-sessions="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Retour aux sessions" }).click();
    await expect(page.locator('[data-ai-sessions="true"]')).toBeVisible();

    await context.addCookies([
      {
        name: "sahelflow-locale",
        value: "ar",
        url: baseURL ?? "http://localhost:3000",
      },
    ]);
    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('[data-ai-workspace="v2"]')).toBeVisible();

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
  });
});
