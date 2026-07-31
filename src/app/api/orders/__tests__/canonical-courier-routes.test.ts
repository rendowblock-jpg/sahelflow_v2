import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actorContext: {
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "shop-a",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 7,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "4".repeat(64),
    },
    actor: {
      kind: "compatibility_local_owner",
      sessionId: "courier-owner-session",
    },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:courier-owner-session",
    auditActor:
      "authenticated-owner:compatibility_local_owner:courier-owner-session",
  } as unknown,
  requireTrustedActor: vi.fn(),
  principalFromActor: vi.fn(),
  queue: vi.fn(),
  position: vi.fn(),
  reconcile: vi.fn(),
  drain: vi.fn(),
  synchronize: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireTrustedActor,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: harness.principalFromActor,
}));

vi.mock("@/lib/db", () => ({
  db: { marker: "exact-process-db" },
  shopContext: (harness.actorContext as { shop: unknown }).shop,
}));

vi.mock("@/lib/delivery/canonical-courier", () => ({
  queueCanonicalCourierBooking: harness.queue,
  getCanonicalCourierPosition: harness.position,
  reconcileCanonicalCourierBooking: harness.reconcile,
  drainDueCourierBookings: harness.drain,
  synchronizeCanonicalCourierTracking: harness.synchronize,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as {
          message?: string;
          code?: string;
          statusCode?: number;
        };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import {
  GET as getCourier,
  PATCH as patchCourier,
  POST as postCourier,
} from "@/app/api/orders/[id]/courier/route";
import { POST as syncCourier } from "@/app/api/orders/[id]/courier/sync/route";

function request(method: "GET" | "POST" | "PATCH", body?: string): NextRequest {
  return new NextRequest("http://localhost/api/orders/order-a/courier", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.actorContext);
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.queue.mockReset().mockResolvedValue({
    commandId: "booking-command",
    aggregateVersion: 1,
    replayed: false,
    result: { orderId: "order-a", deliveryId: "delivery-a" },
  });
  harness.position.mockReset().mockResolvedValue({
    orderId: "order-a",
    orderVersion: 4,
    delivery: { id: "delivery-a" },
  });
  harness.reconcile.mockReset().mockResolvedValue({
    commandId: "reconcile-command",
    aggregateVersion: 1,
    replayed: false,
    result: { deliveryId: "delivery-a" },
  });
  harness.drain.mockReset().mockResolvedValue(1);
  harness.synchronize.mockReset().mockResolvedValue({
    position: { orderId: "order-a" },
    events: [],
  });
});

describe("canonical courier trusted route boundaries", () => {
  it("rejects booking before parsing an untrusted request body", async () => {
    harness.requireTrustedActor.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request("POST", "{malformed-json");
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postCourier(incoming, {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.queue).not.toHaveBeenCalled();
  });

  it("overrides an untrusted body order ID and binds the exact principal", async () => {
    const response = await postCourier(
      request(
        "POST",
        JSON.stringify({
          orderId: "attacker-order",
          provider: "yalidine",
          expectedVersion: 3,
          idempotencyKey: "courier-route-booking",
        }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );

    expect(response.status).toBe(202);
    expect(harness.principalFromActor).toHaveBeenCalledWith(harness.actorContext);
    expect(harness.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
        businessPrincipal: harness.principal,
      }),
      expect.objectContaining({
        orderId: "order-a",
        provider: "yalidine",
        expectedVersion: 3,
      }),
    );
  });

  it("binds position, reconciliation and tracking reads to the exact order path", async () => {
    const getResponse = await getCourier(request("GET"), {
      params: Promise.resolve({ id: "order-a" }),
    });
    expect(getResponse.status).toBe(200);
    expect(harness.position).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
      }),
      "order-a",
    );

    const patchResponse = await patchCourier(
      request(
        "PATCH",
        JSON.stringify({
          deliveryId: "attacker-delivery",
          action: "confirm_not_created",
          expectedVersion: 4,
          reasonCode: "provider-checked",
          idempotencyKey: "courier-route-reconcile",
        }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );
    expect(patchResponse.status).toBe(200);
    expect(harness.reconcile).toHaveBeenCalledWith(
      expect.objectContaining({ businessPrincipal: harness.principal }),
      expect.objectContaining({
        deliveryId: "delivery-a",
        action: "confirm_not_created",
      }),
    );

    const syncResponse = await syncCourier(request("POST", "{}"), {
      params: Promise.resolve({ id: "order-a" }),
    });
    expect(syncResponse.status).toBe(200);
    expect(harness.synchronize).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
      }),
      "order-a",
    );
  });
});
