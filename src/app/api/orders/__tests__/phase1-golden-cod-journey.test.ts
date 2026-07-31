process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getCurrentSessionAuthority: vi.fn(),
  dispatchTrigger: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: harness.requireAuth,
  getCurrentSessionAuthority: harness.getCurrentSessionAuthority,
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: harness.dispatchTrigger,
}));

import { POST as submitStorefront } from "@/app/api/storefront/submit/route";
import { POST as decideOrder } from "@/app/api/orders/[id]/decision/route";
import { POST as fulfillOrder } from "@/app/api/orders/[id]/fulfillment/route";
import { POST as collectCod } from "@/app/api/orders/[id]/cod/collection/route";
import {
  GET as getCodWorkspace,
  POST as postSettlement,
} from "@/app/api/accounting/cod-settlements/route";
import {
  GET as getCustomerReturn,
  POST as requestCustomerReturn,
} from "@/app/api/orders/[id]/customer-return/route";
import { POST as transitionCustomerReturn } from "@/app/api/orders/[id]/customer-return/[returnId]/transition/route";
import { POST as issueRefund } from "@/app/api/orders/[id]/refunds/route";
import { POST as reverseRefund } from "@/app/api/orders/[id]/refunds/[refundId]/reverse/route";
import {
  cleanDb,
  mockGet,
  mockPost,
  rawDb,
  seedStorefront,
} from "@/app/api/__tests__/helpers";
import { getProfitabilityProjection } from "@/lib/accounting/profitability";
import { RETURN_COPY } from "@/components/orders/canonical-customer-return-ui";

const orderParams = (id: string) => ({ params: Promise.resolve({ id }) });
const returnParams = (id: string, returnId: string) => ({
  params: Promise.resolve({ id, returnId }),
});
const refundParams = (id: string, refundId: string) => ({
  params: Promise.resolve({ id, refundId }),
});

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(
      `Unexpected ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  return body;
}

function occurredAt(base: number, minute: number): string {
  return new Date(base + minute * 60_000).toISOString();
}

beforeEach(async () => {
  harness.requireAuth.mockReset().mockResolvedValue({ id: "phase1-owner" });
  harness.getCurrentSessionAuthority
    .mockReset()
    .mockResolvedValue({
      status: "authenticated",
      sessionId: "phase1-golden-cod-owner",
    });
  harness.dispatchTrigger.mockReset().mockResolvedValue(undefined);
  await cleanDb();
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("Phase 1 representative Golden COD journey", () => {
  it(
    "passes storefront UI/API/domain/database authority through delivery, COD, return, refund and reversal",
    async () => {
      const base = Date.now();
      const category = await rawDb.category.create({
        data: { name: "Golden COD" },
      });
      const product = await rawDb.product.create({
        data: {
          name: "Golden Product",
          price: 2500,
          cost: 900,
          stock: 10,
          lowStockThreshold: 2,
          categoryId: category.id,
          isActive: true,
        },
      });
      const storefront = await seedStorefront({
        slug: "golden-cod-store",
        productIds: [product.id],
      });
      const submissionId = "11111111-1111-4111-8111-111111111111";
      const storefrontPayload = {
        slug: storefront.slug,
        submissionId,
        customer: {
          name: "Golden COD Customer",
          phone: "0555000111",
          wilaya: "Alger",
          commune: "Bab Ezzouar",
          address: "1 Golden COD Street",
        },
        items: [{ productId: product.id, quantity: 2 }],
      };

      const createdResponse = await submitStorefront(
        mockPost(
          "http://localhost/api/storefront/submit",
          storefrontPayload,
        ),
      );
      const replayResponse = await submitStorefront(
        mockPost(
          "http://localhost/api/storefront/submit",
          storefrontPayload,
        ),
      );
      expect(createdResponse.status).toBe(201);
      expect(replayResponse.status).toBe(201);
      const created = await responseJson<{
        orderId: string;
        orderNumber: string;
        total: number;
        replayed: boolean;
      }>(createdResponse);
      const intakeReplay = await responseJson<{
        orderId: string;
        replayed: boolean;
      }>(replayResponse);
      expect(created).toMatchObject({ total: 5000, replayed: false });
      expect(intakeReplay).toMatchObject({
        orderId: created.orderId,
        replayed: true,
      });
      expect(await rawDb.order.count()).toBe(1);

      const decisionResponse = await decideOrder(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/decision`,
          {
            decision: "confirm",
            expectedVersion: 1,
            idempotencyKey: "golden-cod-confirm",
          },
        ),
        orderParams(created.orderId),
      );
      const decision = await responseJson<{
        order: { version: number; status: string };
        command: { replayed: boolean };
      }>(decisionResponse);
      expect(decision.order).toMatchObject({ version: 2, status: "confirmed" });
      expect(decision.command.replayed).toBe(false);

      async function fulfill(
        action: "pack" | "ship" | "deliver",
        expectedVersion: number,
      ): Promise<number> {
        const response = await fulfillOrder(
          mockPost(
            `http://localhost/api/orders/${created.orderId}/fulfillment`,
            {
              action,
              expectedVersion,
              idempotencyKey: `golden-cod-${action}`,
            },
          ),
          orderParams(created.orderId),
        );
        const body = await responseJson<{
          order: { version: number };
          command: { replayed: boolean };
        }>(response);
        expect(body.command.replayed).toBe(false);
        return body.order.version;
      }

      const packedVersion = await fulfill("pack", 2);
      expect(packedVersion).toBe(3);
      const stalePack = await fulfillOrder(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/fulfillment`,
          {
            action: "pack",
            expectedVersion: 2,
            idempotencyKey: "golden-cod-stale-pack",
          },
        ),
        orderParams(created.orderId),
      );
      expect(stalePack.status).toBe(409);

      const shippedVersion = await fulfill("ship", packedVersion);
      expect(shippedVersion).toBe(4);
      const deliveredVersion = await fulfill("deliver", shippedVersion);
      expect(deliveredVersion).toBe(5);

      const collectionResponse = await collectCod(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/cod/collection`,
          {
            expectedVersion: deliveredVersion,
            amount: 5000,
            provider: "manual-courier",
            reference: "COL-GOLDEN-1",
            collectedAt: occurredAt(base, 1),
            idempotencyKey: "golden-cod-collection",
          },
        ),
        orderParams(created.orderId),
      );
      const collection = await responseJson<{
        collection: { version: number; discrepancyAmount: number };
      }>(collectionResponse);
      expect(collection.collection).toMatchObject({
        version: 6,
        discrepancyAmount: 0,
      });

      const settlementResponse = await postSettlement(
        mockPost("http://localhost/api/accounting/cod-settlements", {
          provider: "manual-courier",
          externalReference: "REM-GOLDEN-1",
          receivedAt: occurredAt(base, 2),
          idempotencyKey: "golden-cod-settlement",
          lines: [
            {
              providerLineReference: "REM-GOLDEN-LINE-1",
              orderId: created.orderId,
              expectedVersion: collection.collection.version,
              grossRemittedAmount: 5000,
              feeAmount: 200,
              adjustmentAmount: 0,
              isFinal: true,
            },
          ],
        }),
      );
      const settlement = await responseJson<{
        settlement: {
          lines: Array<{
            orderVersion: number | null;
            discrepancyAmount: number;
          }>;
        };
      }>(settlementResponse);
      const settledVersion = settlement.settlement.lines[0]?.orderVersion;
      expect(settledVersion).toBe(7);
      expect(settlement.settlement.lines[0]?.discrepancyAmount).toBe(0);

      const returnPositionResponse = await getCustomerReturn(
        mockGet(
          `http://localhost/api/orders/${created.orderId}/customer-return`,
        ),
        orderParams(created.orderId),
      );
      const initialReturnPosition = await responseJson<{
        position: {
          orderVersion: number;
          availableActions: string[];
          orderItems: Array<{
            orderItemId: string;
            quantity: number;
            unitPrice: number;
          }>;
        };
      }>(returnPositionResponse);
      expect(initialReturnPosition.position.orderVersion).toBe(7);
      expect(initialReturnPosition.position.availableActions).toEqual([
        "request",
      ]);
      expect(initialReturnPosition.position.orderItems).toHaveLength(1);
      const orderItem = initialReturnPosition.position.orderItems[0]!;
      expect(orderItem).toMatchObject({ quantity: 2, unitPrice: 2500 });

      const requestReturnResponse = await requestCustomerReturn(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/customer-return`,
          {
            expectedVersion: settledVersion,
            caseType: "return",
            reasonCode: "customer-requested-return",
            items: [{ orderItemId: orderItem.orderItemId, quantity: 1 }],
            occurredAt: occurredAt(base, 3),
            idempotencyKey: "golden-cod-return-request",
          },
        ),
        orderParams(created.orderId),
      );
      const requestedReturn = await responseJson<{
        returnCase: { returnId: string; orderVersion: number };
      }>(requestReturnResponse);
      let returnVersion = requestedReturn.returnCase.orderVersion;
      expect(returnVersion).toBe(8);

      async function transition(
        action:
          | "approve"
          | "mark_in_transit"
          | "receive"
          | "inspect"
          | "complete",
        minute: number,
        items?: Array<{
          orderItemId: string;
          quantity: number;
          disposition: "available";
        }>,
      ): Promise<number> {
        const response = await transitionCustomerReturn(
          mockPost(
            `http://localhost/api/orders/${created.orderId}/customer-return/${requestedReturn.returnCase.returnId}/transition`,
            {
              action,
              expectedVersion: returnVersion,
              reasonCode: `golden-cod-return-${action.replaceAll("_", "-")}`,
              occurredAt: occurredAt(base, minute),
              idempotencyKey: `golden-cod-return-${action}`,
              ...(items ? { items } : {}),
            },
          ),
          returnParams(
            created.orderId,
            requestedReturn.returnCase.returnId,
          ),
        );
        const body = await responseJson<{
          returnCase: { orderVersion: number };
        }>(response);
        returnVersion = body.returnCase.orderVersion;
        return returnVersion;
      }

      await transition("approve", 4);
      await transition("mark_in_transit", 5);
      await transition("receive", 6);
      await transition("inspect", 7, [
        {
          orderItemId: orderItem.orderItemId,
          quantity: 1,
          disposition: "available",
        },
      ]);
      await transition("complete", 8);
      expect(returnVersion).toBe(13);

      const refundResponse = await issueRefund(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/refunds`,
          {
            returnId: requestedReturn.returnCase.returnId,
            expectedVersion: returnVersion,
            amount: 1000,
            method: "cash",
            reasonCode: "golden-cod-refund",
            occurredAt: occurredAt(base, 9),
            idempotencyKey: "golden-cod-refund-issue",
          },
        ),
        orderParams(created.orderId),
      );
      const refund = await responseJson<{
        refund: { refundId: string; orderVersion: number };
      }>(refundResponse);
      expect(refund.refund.orderVersion).toBe(14);

      const reversalResponse = await reverseRefund(
        mockPost(
          `http://localhost/api/orders/${created.orderId}/refunds/${refund.refund.refundId}/reverse`,
          {
            expectedVersion: refund.refund.orderVersion,
            amount: 400,
            reasonCode: "golden-cod-refund-reversal",
            occurredAt: occurredAt(base, 10),
            idempotencyKey: "golden-cod-refund-reversal",
          },
        ),
        refundParams(created.orderId, refund.refund.refundId),
      );
      const reversal = await responseJson<{
        refund: { orderVersion: number; effectiveRefundAmount: number };
      }>(reversalResponse);
      expect(reversal.refund).toMatchObject({
        orderVersion: 15,
        effectiveRefundAmount: 600,
      });

      const [codWorkspaceResponse, finalReturnResponse] = await Promise.all([
        getCodWorkspace(),
        getCustomerReturn(
          mockGet(
            `http://localhost/api/orders/${created.orderId}/customer-return`,
          ),
          orderParams(created.orderId),
        ),
      ]);
      const codWorkspace = await responseJson<{
        summary: {
          counts: { remitted: number };
          totals: {
            expectedReceivable: number;
            grossRemitted: number;
            fees: number;
          };
        };
      }>(codWorkspaceResponse);
      const finalReturn = await responseJson<{
        position: {
          orderVersion: number;
          status: string;
          inventoryState: string | null;
          codState: string | null;
          returnState: string;
          refundState: string;
          effectiveRefundAmount: number;
          returnCase: { currentState: string } | null;
          refunds: Array<{
            amount: number;
            reversedAmount: number;
            effectiveAmount: number;
          }>;
        };
      }>(finalReturnResponse);
      expect(codWorkspace.summary.counts.remitted).toBe(1);
      expect(codWorkspace.summary.totals).toMatchObject({
        expectedReceivable: 5000,
        grossRemitted: 5000,
        fees: 200,
      });
      expect(finalReturn.position).toMatchObject({
        orderVersion: 15,
        status: "delivered",
        inventoryState: "settled",
        returnState: "completed",
        refundState: "partially_reversed",
        effectiveRefundAmount: 600,
      });
      expect(finalReturn.position.returnCase?.currentState).toBe("completed");
      expect(finalReturn.position.refunds[0]).toMatchObject({
        amount: 1000,
        reversedAmount: 400,
        effectiveAmount: 600,
      });

      const profitability = await getProfitabilityProjection(rawDb as never, {
        from: new Date(base - 60_000),
        to: new Date(base + 24 * 60 * 60_000),
      });
      expect(profitability).toMatchObject({
        grossRevenue: 5000,
        refunds: 600,
        netRevenue: 4400,
        cogs: 900,
        courierFees: 200,
        netProfit: 3300,
        profitabilityComplete: true,
      });

      const order = await rawDb.order.findUniqueOrThrow({
        where: { id: created.orderId },
      });
      const projectedLifecycle = {
        status: finalReturn.position.status,
        version: finalReturn.position.orderVersion,
        inventoryState: finalReturn.position.inventoryState,
        codState: finalReturn.position.codState,
        returnState: finalReturn.position.returnState,
        refundState: finalReturn.position.refundState,
      };
      const persistedLifecycle = {
        status: order.status,
        version: order.version,
        inventoryState: order.inventoryState,
        codState: order.codState,
        returnState: order.returnState,
        refundState: order.refundState,
      };
      expect(persistedLifecycle).toEqual(projectedLifecycle);
      expect(await rawDb.businessCommand.count()).toBe(15);
      expect(await rawDb.profitabilityCostSnapshot.count()).toBe(1);
      expect(await rawDb.financialMovement.count()).toBeGreaterThanOrEqual(4);
      expect(await rawDb.inventoryMovement.count()).toBeGreaterThanOrEqual(3);
      expect(await rawDb.domainEvent.count()).toBe(15);
      expect(await rawDb.outboxIntent.count()).toBeGreaterThanOrEqual(15);
      expect(harness.dispatchTrigger).toHaveBeenCalledTimes(2);
    },
    180_000,
  );

  it("keeps the seller-visible Golden COD controls complete in English, French and Arabic", async () => {
    const locales = ["en", "fr", "ar"] as const;
    for (const locale of locales) {
      expect(RETURN_COPY[locale].heading).toBeTruthy();
      expect(RETURN_COPY[locale].request).toBeTruthy();
      expect(RETURN_COPY[locale].inspect).toBeTruthy();
      expect(RETURN_COPY[locale].refund).toBeTruthy();
      expect(RETURN_COPY[locale].reverse).toBeTruthy();
      expect(RETURN_COPY[locale].committed).toBeTruthy();
      expect(RETURN_COPY[locale].conflict).toBeTruthy();
    }
    expect(RETURN_COPY.ar.heading).toMatch(/[\u0600-\u06ff]/);
    expect(new Set(locales.map((locale) => RETURN_COPY[locale].heading)).size).toBe(3);

    const fulfillmentSource = await readFile(
      join(
        process.cwd(),
        "src/components/orders/canonical-fulfillment-actions.tsx",
      ),
      "utf8",
    );
    const codSource = await readFile(
      join(process.cwd(), "src/components/orders/canonical-cod-actions.tsx"),
      "utf8",
    );
    const returnSource = await readFile(
      join(
        process.cwd(),
        "src/components/orders/canonical-customer-return-actions.tsx",
      ),
      "utf8",
    );
    for (const source of [fulfillmentSource, codSource]) {
      expect(source).toMatch(/en:\s*\{/);
      expect(source).toMatch(/fr:\s*\{/);
      expect(source).toMatch(/ar:\s*\{/);
    }
    expect(fulfillmentSource).toContain("/fulfillment");
    expect(codSource).toContain("/cod/collection");
    expect(codSource).toContain("/api/accounting/cod-settlements");
    expect(returnSource).toContain("/customer-return");
    expect(returnSource).toContain("/refunds");
  });
});
