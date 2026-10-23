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
    actor: { kind: "compatibility_local_owner", sessionId: "edit-session" },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:edit-session",
    auditActor: "authenticated-owner:compatibility_local_owner:edit-session",
  } as unknown,
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  assertFieldAuthority: vi.fn(),
  principalFromActor: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  assertTrustedAction: harness.assertTrustedAction,
}));

vi.mock("@/lib/identity/order-authorization", () => ({
  assertOrderUpdateFieldAuthority: harness.assertFieldAuthority,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: harness.principalFromActor,
}));

vi.mock("@/lib/db", () => ({ db: { marker: "exact-process-db" } }));

vi.mock("@/lib/orders/manual-order-edit", () => ({
  executeManualOrderEdit: harness.execute,
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

import { POST as postEdit } from "@/app/api/orders/[id]/edit/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/orders/order-a/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const params = { params: Promise.resolve({ id: "order-a" }) };

beforeEach(() => {
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertTrustedAction.mockReset();
  harness.assertFieldAuthority.mockReset();
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.execute.mockReset().mockResolvedValue({
    commandId: "edit-command",
    aggregateVersion: 1,
    replayed: false,
    result: {
      orderId: "order-a",
      orderNumber: "ORD-1",
      status: "pending",
      version: 3,
      deliveryCost: 700,
      totalPrice: 5700,
      changed: ["address"],
    },
  });
});

describe("canonical order edit trusted API boundary", () => {
  it("rejects before parsing an untrusted request body", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request("{malformed-json");
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postEdit(incoming, params);

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("asks for the orders.update action first", async () => {
    await postEdit(
      request(JSON.stringify({ expectedVersion: 2, idempotencyKey: "edit-key-1", address: "x y" })),
      params,
    );
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("orders.update");
  });

  it("binds the path order to the exact trusted shop and principal and ignores a body order id", async () => {
    const response = await postEdit(
      request(
        JSON.stringify({
          orderId: "attacker-order",
          expectedVersion: 2,
          idempotencyKey: "edit-key-2",
          address: "7 boulevard Zighoud Youcef",
        }),
      ),
      params,
    );

    expect(response.status).toBe(200);
    expect(harness.principalFromActor).toHaveBeenCalledWith(harness.actorContext);
    expect(harness.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
        businessPrincipal: harness.principal,
      }),
      expect.objectContaining({
        orderId: "order-a",
        expectedVersion: 2,
        address: "7 boulevard Zighoud Youcef",
      }),
    );
    const input = harness.execute.mock.calls[0]![1] as { orderId: string };
    expect(input.orderId).toBe("order-a");
  });

  it("checks contact and financial authority for exactly the fields that were sent", async () => {
    await postEdit(
      request(
        JSON.stringify({
          expectedVersion: 1,
          idempotencyKey: "edit-key-3",
          phone: "0550123456",
          deliveryCost: 800,
          totalPrice: 1,
        }),
      ),
      params,
    );

    expect(harness.assertFieldAuthority).toHaveBeenCalledTimes(1);
    const [actor, fields] = harness.assertFieldAuthority.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(actor).toBe(harness.actorContext);
    // The real check reads Object.keys, and toHaveBeenCalledWith treats a key
    // holding undefined as absent, so compare the keys themselves.
    expect(Object.keys(fields).sort()).toEqual(["deliveryCost", "phone"]);
    expect(fields).toEqual({ phone: "0550123456", deliveryCost: 800 });
  });

  it("asks for no field permission when only the address is sent", async () => {
    await postEdit(
      request(
        JSON.stringify({ expectedVersion: 1, idempotencyKey: "edit-key-3b", address: "a b" }),
      ),
      params,
    );
    const [, fields] = harness.assertFieldAuthority.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(Object.keys(fields)).toEqual(["address"]);
  });

  it("does not run the command when the seller lacks the field permission", async () => {
    harness.assertFieldAuthority.mockImplementationOnce(() => {
      throw Object.assign(new Error("Forbidden"), {
        code: "FORBIDDEN",
        statusCode: 403,
      });
    });

    const response = await postEdit(
      request(
        JSON.stringify({
          expectedVersion: 1,
          idempotencyKey: "edit-key-4",
          deliveryCost: 900,
        }),
      ),
      params,
    );

    expect(response.status).toBe(403);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("answers with the new version, the changed fields and the replay flag", async () => {
    const response = await postEdit(
      request(
        JSON.stringify({ expectedVersion: 2, idempotencyKey: "edit-key-5", address: "a b" }),
      ),
      params,
    );
    const json = await response.json();

    expect(json).toEqual({
      order: {
        id: "order-a",
        orderNumber: "ORD-1",
        status: "pending",
        version: 3,
        deliveryCost: 700,
        totalPrice: 5700,
      },
      changed: ["address"],
      command: { id: "edit-command", aggregateVersion: 1, replayed: false },
    });
  });
});
