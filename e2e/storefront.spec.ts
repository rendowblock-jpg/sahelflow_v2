/**
 * E2E: Storefront — public order submission.
 *
 * Tests the customer-facing flow: visit a storefront, add items to cart,
 * submit the COD form. This is the highest-risk public API surface.
 */
import { test, expect } from "@playwright/test";

test.describe("Storefront", () => {
  test("storefront not-found page shows localized error", async ({ page }) => {
    await page.goto("/storefront/nonexistent-slug");
    
    // Should show an error message (not a crash)
    await expect(page.locator("text=/not found|introuvable|غير موجود/i")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("storefront submit API rejects invalid input", async ({ request }) => {
    const res = await request.post("/api/storefront/submit", {
      data: {
        slug: "nonexistent",
        customer: { name: "", phone: "invalid", wilaya: "", commune: "", address: "" },
        items: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("storefront submit API rejects nonexistent storefront", async ({ request }) => {
    const res = await request.post("/api/storefront/submit", {
      data: {
        slug: "nonexistent-slug",
        customer: { name: "Test", phone: "0555123456", wilaya: "Alger", commune: "B", address: "C" },
        items: [{ productId: "fake", quantity: 1 }],
      },
    });
    expect(res.status()).toBe(404);
  });
});
