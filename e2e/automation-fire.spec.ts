/**
 * E2E: durable automation execution.
 *
 * Creates a real seller-safe `order.confirmed → add customer note` definition,
 * confirms an order through the public API, then waits for the background
 * automation worker to materialize and complete the definition-bound run.
 * No provider mock or fire-and-forget log projection is used as passing truth.
 */
import { test, expect } from "@playwright/test";

import {
  confirmOrder,
  createManualOrder,
  createProduct,
  uniquePhone,
} from "./helpers/core-loop";

test.describe("Automation durable execution", () => {
  test("order.confirmed runs a seller-safe database action to terminal completion", async ({
    page,
  }) => {
    const suffix = Date.now().toString().slice(-7);
    const automationName = `E2E Confirm Note ${suffix}`;
    const noteText = `E2E confirmed {{orderNumber}} / ${suffix}`;

    const autoRes = await page.request.post("/api/automations", {
      data: {
        name: automationName,
        trigger: "order.confirmed",
        action: "tag_customer",
        isActive: true,
        dryRun: false,
        config: { noteText },
        steps: [
          {
            action: "tag_customer",
            onFailure: "stop",
            config: { noteText },
          },
        ],
        conditions: null,
        maxRetries: 2,
        retryDelayMs: 500,
      },
    });
    expect(autoRes.ok()).toBeTruthy();
    const automation = (await autoRes.json()).automation as {
      id: string;
      name: string;
    };

    try {
      await page.goto("/automations?tab=my");
      await page.waitForLoadState("networkidle");
      await expect(
        page.locator(`[data-automation-card="${automation.id}"]`),
      ).toBeVisible({ timeout: 10_000 });

      const custRes = await page.request.post("/api/customers", {
        data: {
          name: `E2E Auto Customer ${suffix}`,
          phone: uniquePhone(),
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "1 Automation Street",
        },
      });
      expect(custRes.ok()).toBeTruthy();
      const customer = (await custRes.json()).customer as {
        id: string;
        phone: string;
      };

      const product = await createProduct(page.request, {
        name: `E2E Auto Product ${suffix}`,
        sku: `E2E-AUTO-${suffix}`,
        price: 2000,
        stock: 10,
      });
      const order = await createManualOrder(page.request, {
        customerId: customer.id,
        productId: product.id,
        quantity: 1,
        unitPrice: 2000,
        wilaya: "Alger",
        commune: "Bab Ezzouar",
        address: "1 Automation Street",
        phone: customer.phone,
        deliveryCost: 500,
      });
      // The decision route fires the order.confirmed trigger the automation waits for.
      await confirmOrder(page.request, order.id, order.version);

      await expect
        .poll(
          async () => {
            const response = await page.request.get("/api/automations");
            if (!response.ok()) return 0;
            const body = (await response.json()) as {
              automations: Array<{
                id: string;
                runCount: number;
                latestRun?: { status?: string } | null;
              }>;
            };
            const current = body.automations.find(
              (candidate) => candidate.id === automation.id,
            );
            return current?.runCount ?? 0;
          },
          { timeout: 15_000, intervals: [500, 1_000, 2_000] },
        )
        .toBeGreaterThanOrEqual(1);

      const finalState = await page.request.get("/api/automations");
      expect(finalState.ok()).toBeTruthy();
      const finalBody = (await finalState.json()) as {
        automations: Array<{
          id: string;
          latestRun?: { status?: string } | null;
        }>;
      };
      expect(
        finalBody.automations.find((candidate) => candidate.id === automation.id)
          ?.latestRun?.status,
      ).toBe("succeeded");
    } finally {
      await page.request.delete(`/api/automations/${automation.id}`);
    }
  });
});
