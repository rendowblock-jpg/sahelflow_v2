import { expect, test, type Page } from "@playwright/test";

const PIN = "12345678";
const DESKTOP = { width: 1366, height: 768 };

async function login(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (!page.url().includes("/login")) return;

  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
}

async function useEnglish(page: Page) {
  await page.context().addCookies([
    {
      name: "sahelflow-locale",
      value: "en",
      url: new URL(page.url()).origin,
    },
  ]);
}

async function addSection(page: Page, name: RegExp) {
  const studio = page.locator('[data-storefront-studio="v2"]');
  await studio.getByRole("button", { name: /Add section/i }).click();
  await page.getByRole("menuitem", { name }).last().click();
}

async function inspector(page: Page) {
  const result = page.locator(
    '[data-storefront-studio="v2"] > div.grid > aside:last-child',
  );
  await expect(result).toBeVisible();
  return result;
}

test.describe("Storefront Studio authoring", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await login(page);
    await useEnglish(page);
  });

  test("rich sections edit live, reorder, autosave and survive reload", async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-8);

    await page.goto("/storefronts/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#main-content h1")).toHaveCount(1);
    await expect(page.locator('[data-storefront-studio="bootstrap"]')).toBeVisible({
      timeout: 30_000,
    });

    const productResponse = await page.request.post("/api/products", {
      data: {
        name: `Studio product ${suffix}`,
        sku: `STUDIO-${suffix}`,
        price: 2400,
        cost: 900,
        stock: 20,
        lowStockThreshold: 3,
        isActive: true,
      },
    });
    expect(productResponse.ok()).toBeTruthy();
    const product = (await productResponse.json()).product as { id: string };

    const createResponse = await page.request.post("/api/storefront/config", {
      data: {
        slug: `studio-e2e-${suffix}`,
        name: `Studio E2E ${suffix}`,
        description: "Internal.19 visual authoring evidence",
        theme: {
          template: "minimal",
          primaryColor: "#166534",
          showPrices: true,
          showStock: false,
        },
        productIds: [product.id],
        contact: { phone: "0555000000" },
        isActive: false,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()).config as { id: string };

    await page.goto(`/storefronts/${encodeURIComponent(created.id)}/studio`, {
      waitUntil: "domcontentloaded",
    });
    const studio = page.locator('[data-storefront-studio="v2"]');
    await expect(studio).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#main-content h1")).toHaveCount(1);

    // Add Section is a focus-managed menu, not a hand-rolled popup. Keyboard
    // opening focuses the menu and Escape returns focus to the trigger.
    const addSectionTrigger = studio.getByRole("button", { name: /Add section/i });
    await addSectionTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(addSectionTrigger).toBeFocused();

    // Media is a real authored section, not a placeholder.
    await addSection(page, /^Media$/i);
    let details = await inspector(page);
    await details.getByLabel("Eyebrow").fill("Why customers choose us");
    await details.getByLabel("Heading").fill("Built for cash on delivery");
    await details
      .getByLabel("Body")
      .fill("Fast confirmation, clear delivery choices and local seller support.");
    await expect(
      studio.getByText("Built for cash on delivery", { exact: true }),
    ).toBeVisible();

    // Testimonial blocks author directly into the same live renderer. Scope the
    // assertion to semantic rendered output so the editor textarea cannot satisfy
    // the same text query and hide a broken preview.
    await addSection(page, /Testimonials/i);
    details = await inspector(page);
    await details.getByRole("button", { name: /Add testimonial/i }).click();
    await details
      .getByLabel("Customer quote")
      .fill("The order arrived quickly and the confirmation was clear.");
    await details.getByLabel("Customer name").fill("Amine");
    await details.getByLabel("Context / role").fill("Algiers customer");
    await expect(
      studio.locator("blockquote", {
        hasText: "The order arrived quickly and the confirmation was clear.",
      }),
    ).toBeVisible();

    // FAQ blocks are authorable and render as accessible disclosure controls.
    await addSection(page, /^FAQ$/i);
    details = await inspector(page);
    await details.getByRole("button", { name: /Add FAQ item/i }).click();
    await details.getByLabel("Question").fill("Can I pay on delivery?");
    await details
      .getByLabel("Answer")
      .fill("Yes. This storefront supports cash on delivery.");
    await expect(
      studio.locator("summary", { hasText: "Can I pay on delivery?" }),
    ).toBeVisible();

    // Drag is supported, while the UI also retains buttons and Alt+Arrow
    // alternatives for WCAG 2.2 dragging accessibility.
    const faqRow = studio.locator('[data-storefront-section-type="faq"]').last();
    const mediaRow = studio.locator('[data-storefront-section-type="media"]').last();
    await faqRow.dragTo(mediaRow);
    const order = await studio.locator("[data-storefront-section-type]").evaluateAll(
      (rows) => rows.map((row) => (row as HTMLElement).dataset.storefrontSectionType),
    );
    expect(order.indexOf("faq")).toBeLessThan(order.indexOf("media"));

    // Autosave must settle before evidence is considered durable.
    await expect(
      studio.locator("header").getByText(/^Saved/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(studio).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#main-content h1")).toHaveCount(1);

    const restoredMedia = studio
      .locator('[data-storefront-section-type="media"]')
      .last();
    await restoredMedia.locator("button").first().click();
    details = await inspector(page);
    await expect(details.getByLabel("Heading")).toHaveValue(
      "Built for cash on delivery",
    );
    await expect(
      studio.getByText("Built for cash on delivery", { exact: true }),
    ).toBeVisible();

    const restoredFaq = studio.locator('[data-storefront-section-type="faq"]').last();
    await restoredFaq.locator("button").first().click();
    details = await inspector(page);
    await expect(details.getByLabel("Question")).toHaveValue(
      "Can I pay on delivery?",
    );
    await expect(details.getByLabel("Answer")).toHaveValue(
      "Yes. This storefront supports cash on delivery.",
    );
  });
});
