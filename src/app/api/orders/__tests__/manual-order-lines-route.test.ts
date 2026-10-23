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
    actor: { kind: "compatibility_local_owner", sessionId: "lines-session" },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:lines-session",
    auditActor: "authenticated-owner:compatibility_local_owner:lines-session",
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

vi.mock("@/lib/orders/manual-order-lines-edit", () => ({
  executeManualOrderLinesEdit: harness.execute,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; code?: string; statusCode?: number };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { POST as postLines } from "@/app/api/orders/[id]/lines/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/orders/order-a/lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const params = { params: Promise.resolve({ id: "order-a" }) };
const goodBody = {
  expectedVersion: 2,
  idempotencyKey: "lines-key-0001",
  lines: [{ id: "item-1", quantity: 3 }],
};

beforeEach(() => {
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertTrustedAction.mockReset();
  harness.assertFieldAuthority.mockReset();
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.execute.mockReset().mockResolvedValue({
    commandId: "lines-command",
    aggregateVersion: 1,
    replayed: false,
    result: {
      orderId: "order-a",
      orderNumber: "ORD-1",
      status: "pending",
      version: 3,
      itemsTotal: 7500,
      deliveryCost: 600,
      totalPrice: 8100,
      added: 0,
      removed: 0,
      changed: 1,
    },
  });
});

describe("pending order lines edit trusted API boundary", () => {
  it("rejects before parsing an untrusted request body", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request("{malformed-json");
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postLines(incoming, params);

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("asks for orders.update first and orders.read for the shop", async () => {
    await postLines(request(JSON.stringify(goodBody)), params);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("orders.update");
    expect(harness.assertTrustedAction).toHaveBeenCalledWith(
      harness.actorContext,
      "orders.read",
      { shopId: "shop-a" },
    );
  });

  it("treats the lines as money: the financial field authority is checked before anything runs", async () => {
    await postLines(request(JSON.stringify(goodBody)), params);
    expect(harness.assertFieldAuthority).toHaveBeenCalledTimes(1);
    const [actor, sent] = harness.assertFieldAuthority.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(actor).toBe(harness.actorContext);
    // "items" is one of the financial fields of the order update authority.
    expect(Object.keys(sent)).toEqual(["items"]);

    harness.assertFieldAuthority.mockImplementationOnce(() => {
      throw Object.assign(new Error("Forbidden"), { code: "FORBIDDEN", statusCode: 403 });
    });
    harness.execute.mockClear();
    const refused = await postLines(request(JSON.stringify(goodBody)), params);
    expect(refused.status).toBe(403);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("binds the path order to the exact trusted shop and principal and ignores a body order id", async () => {
    const response = await postLines(
      request(JSON.stringify({ ...goodBody, orderId: "attacker-order" })),
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
        idempotencyKey: "lines-key-0001",
        lines: [{ id: "item-1", quantity: 3 }],
      }),
    );
  });

  it("answers with the new version and totals and what happened to the lines", async () => {
    const response = await postLines(request(JSON.stringify(goodBody)), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      order: {
        id: "order-a",
        orderNumber: "ORD-1",
        status: "pending",
        version: 3,
        itemsTotal: 7500,
        deliveryCost: 600,
        totalPrice: 8100,
      },
      lines: { added: 0, removed: 0, changed: 1 },
      command: { id: "lines-command", aggregateVersion: 1, replayed: false },
    });
  });

  it("passes a coded refusal of the command through with its status", async () => {
    harness.execute.mockRejectedValueOnce(
      Object.assign(new Error("not editable"), {
        code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE",
        statusCode: 409,
      }),
    );
    const response = await postLines(request(JSON.stringify(goodBody)), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "ORDER_LINES_NOT_EDITABLE_FOR_SOURCE" });
  });
});
