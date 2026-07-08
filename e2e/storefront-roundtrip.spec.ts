/**
 * E2E: Storefront round-trip — public customer order → seller sees it.
 *
 * Tests the highest-risk public API surface: a customer visits a storefront,
 * adds items to cart, submits the COD form, sees the confirmation. Then the
 * seller (already logged in) sees the order on /orders with source="storefront".
 *
 * Pattern: page.request fast-seeds the product + storefront config as the
 * seller (authenticated), then a fresh page visit simulates the customer
 * flow (public — no auth needed). After submission, the seller's /orders
 * page is visited (already-authenticated cookie) to verify the order appears.
 *
 * Auth: the storefront page + /api/storefront/submit are PUBLIC (no auth
 * required). The seller-side seeding + /orders verification use page.request
 * (authenticated via the login cookie).
 */
import { test, expect, type Page } from "@playwright/test";

const PIN = "12345678";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ state: "visible" });
  await pinInput.fill(PIN);
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]').click({ force: true });
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

test.describe("Storefront round-trip", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("customer submits COD form → seller sees storefront order", async ({ page }) => {
    // ── 1. Fast-seed: product + active storefront config ───────────────────
    const slug = `e2e-storefront-${Date.now().toString().slice(-8)}`;
    const productRes = await page.request.post("/api/products", {
      data: {
        name: `E2E Storefront Product ${slug.slice(-4)}`,
        sku: `E2E-SF-${slug.slice(-4)}`,
        price: 1800,
        cost: 700,
        stock: 50,
        lowStockThreshold: 5,
        isActive: true,
      },
    });
    expect(productRes.ok()).toBeTruthy();
    const product = (await productRes.json()).product as { id: string; name: string };
    expect(product.id).toBeTruthy();

    const storefrontRes = await page.request.post("/api/storefront/config", {
      data: {
        slug,
        name: `E2E Storefront ${slug.slice(-4)}`,
        description: "E2E test storefront — golden path",
        theme: {
          template: "minimal",
          primaryColor: "#0ea5e9",
          showPrices: true,
          showStock: false,
        },
        productIds: [product.id],
        contact: { phone: "0555000000" },
        isActive: true,
      },
    });
    expect(storefrontRes.ok()).toBeTruthy();
    const storefront = (await storefrontRes.json()).config as { id: string; slug: string };
    expect(storefront.slug).toBe(slug);

    // ── 2. UI: visit the public storefront page ────────────────────────────
    await page.goto(`/storefront/${slug}`);
    await page.waitForLoadState("networkidle");
    // The storefront header renders the storefront name in white on a colored background.
    await expect(page.getByText(product.name, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── 3. Add the product to cart ─────────────────────────────────────────
    // The "Add to cart" button label is i18n'd; click the first product card's
    // add button. The button is full-width inside the product card.
    const addToCartButton = page
      .getByRole("button", { name: /Add to cart|Ajouter au panier|أضف إلى السلة/i })
      .first();
    await addToCartButton.waitFor({ state: "visible" });
    await addToCartButton.click();

    // ── 4. Fill the COD checkout form ──────────────────────────────────────
    // The form uses #name, #phone, #address inputs (StorefrontView).
    const customerName = `E2E SF Customer ${slug.slice(-4)}`;
    const customerPhone = `0666${Date.now().toString().slice(-6)}`;

    await page.locator("#name").fill(customerName);
    await page.locator("#phone").fill(customerPhone);

    // Wilaya/commune are a custom component (WilayaCommuneSelect). Select the
    // first wilaya from the dropdown.
    await page
      .getByRole("combobox", { name: /Wilaya|ولاية/i })
      .first()
      .click();
    await page.waitForTimeout(300);
    // Click the first option in the opened listbox.
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(200);

    await page
      .getByRole("combobox", { name: /Commune|بلدية/i })
      .first()
      .click();
    await page.waitForTimeout(300);
    await page.locator('[role="option"]').first().click();
    await page.waitForTimeout(200);

    await page.locator("#address").fill("45 Rue de la Paix");

    // ── 5. Submit the order ────────────────────────────────────────────────
    const submitButton = page.getByRole("button", {
      name: /Confirm order|Confirmer la commande|تأكيد الطلب/i,
    });
    await submitButton.click();

    // ── 6. UI: confirmation screen appears with the order number ───────────
    // The success card shows a CheckCircle2 icon + the order number in mono.
    await expect(
      page.getByText(/Order confirmed|Commande confirmée|تم تأكيد الطلب/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Capture the order number from the success screen for follow-up assertions.
    const orderNumberText = await page
      .locator(".font-mono.text-lg")
      .first()
      .textContent();
    expect(orderNumberText).toBeTruthy();
    if (!orderNumberText) throw new Error("order number not rendered — unreachable after expect");
    const orderNumber = orderNumberText.trim();
    expect(orderNumber.length).toBeGreaterThan(0);

    // ── 7. Seller-side: navigate to /orders and find the storefront order ──
    await page.goto("/orders");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });

    // The new order should appear in the list. We may need to wait for SWR
    // to fetch fresh data, so retry the assertion up to 10s.
    await expect(
      page.getByText(orderNumber, { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ── 8. Verify via API that the order has source="storefront" ───────────
    // The /orders page filters/serializes "source" through i18n labels. The
    // authoritative source value comes from GET /api/orders (raw).
    const ordersListRes = await page.request.get("/api/orders?pageSize=100");
    expect(ordersListRes.ok()).toBeTruthy();
    const ordersData = (await ordersListRes.json()) as {
      orders: Array<{ orderNumber: string; source: string }>;
    };
    const matchingOrder = ordersData.orders.find((o) => o.orderNumber === orderNumber);
    expect(matchingOrder).toBeDefined();
    if (!matchingOrder) throw new Error("order not found in list — unreachable after expect");
    expect(matchingOrder.source).toBe("storefront");
  });
});
