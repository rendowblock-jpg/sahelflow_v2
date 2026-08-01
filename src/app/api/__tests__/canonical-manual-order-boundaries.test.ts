process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authority = vi.hoisted(() => ({
  requireTrustedActor: vi.fn(),
  requireTrustedAction: vi.fn(),
  ownerContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "canonical-boundary-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
}));

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/risk-engine", () => ({
  assessOrderRisk: vi.fn(async () => null),
}));

vi.mock("@/lib/automations/engine", () => ({
  dispatchTrigger: vi.fn(async () => {}),
  dispatchLowStock: vi.fn(async () => {}),
  detectLowStock: vi.fn(async () => null),
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return {
    ...actual,
    requireTrustedActor: authority.requireTrustedActor,
    isTrustedActorContext: vi.fn(() => true),
  };
});

vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/authorization")
  >();
  return {
    ...actual,
    requireTrustedAction: authority.requireTrustedAction,
  };
});

vi.mock("@/lib/business-truth/principal", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/business-truth/principal")
  >();
  return {
    ...actual,
    businessPrincipalFromTrustedActor: vi.fn(() =>
      actual.testAuthenticatedPersonBusinessPrincipal(
        authority.ownerContext.actor.personId,
        "canonical-boundary-test",
      ),
    ),
  };
});

import { PATCH as PATCHOrder } from "@/app/api/orders/[id]/route";
import { POST as POSTDecision } from "@/app/api/orders/[id]/decision/route";
import { POST as POSTFulfillment } from "@/app/api/orders/[id]/fulfillment/route";
import { PATCH as PATCHStatus } from "@/app/api/orders/[id]/status/route";
import { POST as POSTOrder } from "@/app/api/orders/route";
import { importPendingOrderSourceMetadata } from "@/lib/orders/manual-order-authority";
import { SahelFlowError } from "@/types/errors";

let sequence = 0;

async function cleanCanonical(): Promise<void> {
  await rawDb.$executeRawUnsafe('DELETE FROM "CompensationFact"');
  await rawDb.$executeRawUnsafe('DELETE FROM "ProjectionInvalidation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "FinancialMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryMovement"');
  await rawDb.$executeRawUnsafe('DELETE FROM "InventoryReservation"');
  await rawDb.$executeRawUnsafe('DELETE FROM "OutboxIntent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "DomainEvent"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessCommand"');
  await rawDb.$executeRawUnsafe('DELETE FROM "BusinessAggregateVersion"');
}

async function seedCustomer() {
  sequence += 1;
  return rawDb.customer.create({
    data: {
      name: `Boundary customer ${sequence}`,
      phone: `boundary-phone-${sequence}`,
      nameBlindIndex: `boundary-name-${sequence}`,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Boundary address",
    },
  });
}

function manualBody(customerId: string, productId: string) {
  return {
    idempotencyKey: `manual-boundary-${sequence}`,
    customerId,
    items: [{ productId, quantity: 1 }],
    wilaya: "Alger",
    commune: "Alger Centre",
    address: "Boundary address",
    phone: "0555000001",
    deliveryCost: 600,
  };
}

beforeEach(async () => {
  authority.requireTrustedActor
    .mockReset()
    .mockResolvedValue(authority.ownerContext);
  authority.requireTrustedAction
    .mockReset()
    .mockResolvedValue(authority.ownerContext);
  await cleanCanonical();
  await cleanDb();
});
afterAll(async () => {
  await cleanCanonical();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical manual order API boundary", () => {
  it("rejects fulfillment before parsing when no trusted actor is available", async () => {
    authority.requireTrustedAction.mockRejectedValueOnce(
      new SahelFlowError(
        "A trusted actor is unavailable before authentication setup completes",
        "TRUSTED_ACTOR_REQUIRED",
        401,
      ),
    );
    const request = mockPost(
      "http://localhost/api/orders/order-without-authority/fulfillment",
      { action: "pack" },
    );
    const jsonSpy = vi.spyOn(request, "json");

    const response = await POSTFulfillment(request, {
      params: Promise.resolve({ id: "order-without-authority" }),
    });

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(await rawDb.businessCommand.count()).toBe(0);
  });

  it("routes an omitted source through trusted intake and server pricing", async () => {
    const product = await seedProduct({ name: "Catalog truth", price: 4200 });
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        manualBody(customer.id, product.id),
      ),
    );

    expect(response.status).toBe(201);
    const body = await getJson(response);
    expect(body.authority).toBe("trusted-manual-v1");
    expect(body.order).toMatchObject({ status: "pending", totalPrice: 4800 });
    expect(await rawDb.orderItem.findFirst()).toMatchObject({
      productId: product.id,
      productName: "Catalog truth",
      unitPrice: 4200,
    });
  });

  it("requires the decision endpoint and blocks every tested legacy mutation after commit", async () => {
    const product = await seedProduct({ stock: 5 });
    const customer = await seedCustomer();
    const createdResponse = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        manualBody(customer.id, product.id),
      ),
    );
    const created = await getJson(createdResponse);
    const order = created.order as { id: string; version: number };

    const decisionResponse = await POSTDecision(
      mockPost(`http://localhost/api/orders/${order.id}/decision`, {
        decision: "confirm",
        expectedVersion: order.version,
        idempotencyKey: `manual-decision-${sequence}`,
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(decisionResponse.status).toBe(200);

    const statusResponse = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "cancelled",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(statusResponse.status).toBe(409);

    const editResponse = await PATCHOrder(
      mockPost(`http://localhost/api/orders/${order.id}`, {
        notes: "unsafe edit",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );
    expect(editResponse.status).toBe(409);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "confirmed",
      version: 2,
      notes: null,
    });
    expect(await rawDb.product.findUnique({ where: { id: product.id } })).toMatchObject({
      stock: 4,
    });
  });

  it("rejects direct confirmed creation on compatibility sources", async () => {
    const product = await seedProduct({ stock: 5 });
    const customer = await seedCustomer();

    const response = await POSTOrder(
      mockPost("http://localhost/api/orders", {
        source: "shopify",
        status: "confirmed",
        customerId: customer.id,
        items: [{
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.price,
        }],
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Boundary address",
        phone: "0555000001",
        deliveryCost: 600,
      }),
    );

    expect(response.status).toBe(400);
    expect(await rawDb.order.count()).toBe(0);
  });

  it("blocks imported rows until governed catalog mapping exists", async () => {
    const customer = await seedCustomer();
    const order = await rawDb.order.create({
      data: {
        orderNumber: `ORD-IMPORT-${sequence}`,
        status: "pending",
        customerId: customer.id,
        totalPrice: 2500,
        wilaya: "Alger",
        commune: "Alger Centre",
        address: "Boundary address",
        phone: "0555000001",
        source: "manual",
        sourceMetadata: JSON.stringify(importPendingOrderSourceMetadata()),
        items: {
          create: [{
            productName: "Unmapped import",
            quantity: 1,
            unitPrice: 2500,
            total: 2500,
          }],
        },
      },
    });

    const response = await PATCHStatus(
      mockPost(`http://localhost/api/orders/${order.id}/status`, {
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    expect(response.status).toBe(409);
    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "pending",
      version: 1,
    });
  });

  it("exposes only the governed pack, ship and deliver sequence", async () => {
    const product = await seedProduct({ stock: 5, price: 3000 });
    const customer = await seedCustomer();
    const createdResponse = await POSTOrder(
      mockPost(
        "http://localhost/api/orders",
        manualBody(customer.id, product.id),
      ),
    );
    const created = await getJson(createdResponse);
    const order = created.order as { id: string; version: number };
    await POSTDecision(
      mockPost(`http://localhost/api/orders/${order.id}/decision`, {
        decision: "confirm",
        expectedVersion: order.version,
        idempotencyKey: `manual-fulfillment-confirm-${sequence}`,
      }),
      { params: Promise.resolve({ id: order.id }) },
    );

    for (const [action, expectedVersion] of [
      ["pack", 2],
      ["ship", 3],
      ["deliver", 4],
    ] as const) {
      const response = await POSTFulfillment(
        mockPost(`http://localhost/api/orders/${order.id}/fulfillment`, {
          action,
          expectedVersion,
          idempotencyKey: `manual-fulfillment-${action}-${sequence}`,
        }),
        { params: Promise.resolve({ id: order.id }) },
      );
      expect(response.status).toBe(200);
    }

    expect(await rawDb.order.findUnique({ where: { id: order.id } })).toMatchObject({
      status: "delivered",
      version: 5,
      fulfillmentState: "closed",
      deliveryState: "delivered",
      inventoryState: "settled",
      codState: "receivable",
    });
  });
});
