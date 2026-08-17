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
    await page.locator("#pin").fill(OWNER_PIN);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      waitUntil: "commit",
      timeout: 90_000,
    });
  }
}

async function setLocale(
  context: BrowserContext,
  baseURL: string | undefined,
  locale: "fr" | "ar",
) {
  await context.addCookies([
    {
      name: "sahelflow-locale",
      value: locale,
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(
    overflow.viewportWidth + 1,
  );
}

async function settingsGeometry(page: Page) {
  return {
    rail: await page
      .locator('[data-settings-control-center="true"] > div > aside')
      .boundingBox(),
    canvas: await page
      .locator('[data-settings-domain-canvas="true"]')
      .boundingBox(),
  };
}

async function expectFlatDataDomain(page: Page) {
  const topLevelCards = page.locator(
    '[data-settings-domain-stack="data"] > [data-slot="card"], ' +
      '[data-settings-domain-stack="data"] > * > [data-slot="card"]:first-child',
  );
  await expect(topLevelCards).toHaveCount(3);
  const styles = await topLevelCards.evaluateAll((cards) =>
    cards.map((card) => {
      const style = getComputedStyle(card);
      return {
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
      };
    }),
  );
  for (const style of styles) {
    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderRadius).toBe("0px");
    expect(style.boxShadow).toBe("none");
  }
}

test.describe.serial("Settings Class-AAA control center evidence", () => {
  let ownerSessionCookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      viewport: DESKTOP,
      storageState: process.env.SF_PHASE5_OWNER_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      await setLocale(context, baseURL, "fr");
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
    await setLocale(context, baseURL, "fr");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("1366 desktop is a full-height command rail plus dominant control canvas", async ({
    page,
  }) => {
    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-workspace", "v2");
    await expect(workspace).toHaveAttribute(
      "data-settings-generation",
      "class-aaa",
    );
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");

    const groups = page.locator("[data-settings-group]");
    await expect(groups).toHaveCount(6);
    await expect(page.locator('[data-settings-group="workspace"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const radius = await workspace.evaluate((element) =>
      getComputedStyle(element).borderRadius,
    );
    expect(radius).toBe("0px");

    const { rail, canvas } = await settingsGeometry(page);
    expect(rail).not.toBeNull();
    expect(canvas).not.toBeNull();
    if (rail && canvas) {
      expect(rail.width).toBeGreaterThanOrEqual(248);
      expect(rail.width).toBeLessThanOrEqual(252);
      expect(canvas.width).toBeGreaterThan(rail.width * 2.5);
    }

    for (const group of [
      "operations",
      "connections",
      "intelligence",
      "access",
      "data",
      "workspace",
    ] as const) {
      await page.locator(`[data-settings-group="${group}"]`).click();
      await expect(
        page.locator(`[data-settings-group-panel="${group}"]`),
      ).toBeVisible();
      await expect(page.locator(`[data-settings-group="${group}"]`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      if (group === "data") await expectFlatDataDomain(page);
    }

    await expectNoHorizontalOverflow(page);
  });

  test("mobile starts in the directory and manages keyboard focus through drill-in and Back", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 768 });
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute(
      "data-settings-mobile-pane",
      "directory",
    );
    await expect(page.locator('[data-settings-directory="true"]')).toBeVisible();
    await expect(page.locator('[data-settings-domain-canvas="true"]')).not.toBeVisible();

    const connectionsButton = page.locator(
      '[data-settings-group="connections"]',
    );
    await connectionsButton.focus();
    await page.keyboard.press("Enter");
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(page.locator('[data-settings-group-panel="connections"]')).toBeVisible();
    await expect(page.locator('[data-settings-directory="true"]')).not.toBeVisible();
    await expect(page.locator('[data-settings-detail-heading="true"]')).toBeFocused();

    const backButton = page.getByRole("button", {
      name: "Retour aux paramètres",
    });
    await backButton.focus();
    await page.keyboard.press("Enter");
    await expect(workspace).toHaveAttribute(
      "data-settings-mobile-pane",
      "directory",
    );
    await expect(page.locator('[data-settings-directory="true"]')).toBeVisible();
    await expect(connectionsButton).toBeFocused();

    await page.locator('[data-settings-group="data"]').click();
    await expect(page.locator('[data-settings-group-panel="data"]')).toBeVisible();
    await expectFlatDataDomain(page);
    await expectNoHorizontalOverflow(page);
  });

  test("live breakpoint and mobile-pane changes preserve draft state and transfer focus only when its control hides", async ({
    page,
  }) => {
    const workspace = page.locator('[data-settings-control-center="true"]');
    const dataButton = page.locator('[data-settings-group="data"]');
    const detailHeading = page.locator('[data-settings-detail-heading="true"]');

    await dataButton.click();
    const resetDraft = page.getByPlaceholder("RESET");
    await resetDraft.fill("RES");
    await resetDraft.focus();

    await page.setViewportSize({ width: 640, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(resetDraft).toHaveValue("RES");
    await expect(resetDraft).toBeFocused();

    await page.getByRole("button", { name: "Retour aux paramètres" }).click();
    await expect(workspace).toHaveAttribute(
      "data-settings-mobile-pane",
      "directory",
    );
    await dataButton.click();
    await expect(resetDraft).toHaveValue("RES");

    await resetDraft.focus();
    await page.setViewportSize({ width: 900, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");
    await expect(resetDraft).toHaveValue("RES");
    await expect(resetDraft).toBeFocused();

    await dataButton.focus();
    await page.setViewportSize({ width: 640, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(resetDraft).toHaveValue("RES");
    await expect(detailHeading).toBeFocused();

    const backButton = page.getByRole("button", {
      name: "Retour aux paramètres",
    });
    await backButton.focus();
    await page.setViewportSize({ width: 900, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");
    await expect(resetDraft).toHaveValue("RES");
    await expect(dataButton).toBeFocused();

    await dataButton.evaluate((element) => (element as HTMLElement).blur());
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await page.setViewportSize({ width: 640, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(detailHeading).not.toBeFocused();
    await expect(resetDraft).toHaveValue("RES");

    await page.setViewportSize({ width: 900, height: 768 });
    await page.evaluate(() => {
      const outside = document.createElement("button");
      outside.type = "button";
      outside.dataset.settingsTestOutsideFocus = "true";
      outside.textContent = "Outside Settings";
      document.body.append(outside);
    });
    const outsideFocus = page.locator(
      '[data-settings-test-outside-focus="true"]',
    );
    await dataButton.focus();
    await outsideFocus.focus();
    await page.setViewportSize({ width: 640, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "mobile");
    await expect(workspace).toHaveAttribute("data-settings-mobile-pane", "detail");
    await expect(outsideFocus).toBeFocused();
    await expect(resetDraft).toHaveValue("RES");

    await expectNoHorizontalOverflow(page);
  });

  test("Arabic RTL keeps the command rail on physical right from tablet through desktop", async ({
    context,
    page,
    baseURL,
  }) => {
    await setLocale(context, baseURL, "ar");
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const workspace = page.locator('[data-settings-control-center="true"]');
    await expect(workspace).toBeVisible();
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");

    await page.locator('[data-settings-group="access"]').click();
    await expect(page.locator('[data-settings-group-panel="access"]')).toBeVisible();

    let geometry = await settingsGeometry(page);
    expect(geometry.rail).not.toBeNull();
    expect(geometry.canvas).not.toBeNull();
    if (geometry.rail && geometry.canvas) {
      expect(geometry.rail.x).toBeGreaterThan(geometry.canvas.x);
      expect(geometry.rail.width).toBeGreaterThanOrEqual(248);
      expect(geometry.rail.width).toBeLessThanOrEqual(252);
      expect(geometry.canvas.width).toBeGreaterThan(geometry.rail.width * 2.5);
    }
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 900, height: 768 });
    await expect(workspace).toHaveAttribute("data-settings-layout", "desktop");
    geometry = await settingsGeometry(page);
    expect(geometry.rail).not.toBeNull();
    expect(geometry.canvas).not.toBeNull();
    if (geometry.rail && geometry.canvas) {
      expect(geometry.rail.x).toBeGreaterThan(geometry.canvas.x);
      expect(geometry.rail.width).toBeGreaterThanOrEqual(248);
      expect(geometry.rail.width).toBeLessThanOrEqual(252);
      expect(geometry.canvas.width).toBeGreaterThan(geometry.rail.width);
    }
    await expectNoHorizontalOverflow(page);
  });
});
