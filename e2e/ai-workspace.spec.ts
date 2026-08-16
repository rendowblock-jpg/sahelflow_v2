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

test.describe.serial("AI Class-AAA decision workspace evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
    });
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

  test("1366 desktop is two-pane, safe, durable and progressively reviewable", async ({
    page,
  }) => {
    const workspace = page.locator('[data-ai-decision-workspace="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-ai-layout", "desktop");
    await expect(page.locator('[data-ai-work-history="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toHaveCount(0);

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

    await page.getByRole("button", { name: "Nouvelle analyse" }).click();
    await expect(page.locator("[data-ai-session]").first()).toBeVisible();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toContainText(
      "Nouvelle conversation",
    );
    await expect(page.locator('[data-ai-start-state="true"]')).toBeVisible();

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

    await page.getByRole("button", { name: "Revue & preuves" }).click();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toContainText(
      "Fournisseur & confidentialité",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-ai-review-evidence="true"]')).toHaveCount(0);
  });

  test("wide desktop promotes review evidence without shrinking the decision canvas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const workspace = page.locator('[data-ai-decision-workspace="true"]');
    await expect(workspace).toHaveAttribute("data-ai-layout", "wide");
    await expect(page.locator('[data-ai-work-history="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Revue & preuves" })).toHaveCount(0);
  });

  test("mobile drills history to decision canvas and Arabic remains semantically contained", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 640, height: 768 });
    await expect(page.locator('[data-ai-decision-workspace="true"]')).toHaveAttribute(
      "data-ai-layout",
      "mobile",
    );
    await expect(page.locator('[data-ai-work-history="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toHaveCount(0);

    await page.locator("[data-ai-session]").first().click();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-work-history="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Retour aux sessions" }).click();
    await expect(page.locator('[data-ai-work-history="true"]')).toBeVisible();

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
    await expect(page.locator('[data-ai-decision-workspace="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-work-history="true"]')).toBeVisible();

    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);

    await page.locator("[data-ai-session]").first().click();
    await expect(page.locator('[data-ai-decision-canvas="true"]')).toBeVisible();
    await page.getByRole("button", { name: "المراجعة والأدلة" }).click();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toBeVisible();
    await expect(page.locator('[data-ai-review-evidence="true"]')).toContainText(
      "المزود والخصوصية",
    );
  });
});
