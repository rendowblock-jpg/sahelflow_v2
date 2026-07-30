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
      sessionId: "return-owner-session",
    },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:return-owner-session",
    auditActor:
      "authenticated-owner:compatibility_local_owner:return-owner-session",
  } as unknown,
  requireTrustedActor: vi.fn(),
  principalFromActor: vi.fn(),
  position: vi.fn(),
  requestReturn: vi.fn(),
  transitionReturn: vi.fn(),
  issueRefund: vi.fn(),
  reverseRefund: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireTrustedActor,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: harness.principalFromActor,
}));

vi.mock("@/lib/db", () => ({
  db: { marker: "exact-process-db" },
}));

vi.mock("@/lib/orders/canonical-customer-return", () => ({
  requestCanonicalCustomerReturn: harness.requestReturn,
  transitionCanonicalCustomerReturn: harness.transitionReturn,
}));

vi.mock("@/lib/orders/canonical-customer-return-projections", () => ({
  getCanonicalCustomerReturnPosition: harness.position,
}));

vi.mock("@/lib/accounting/canonical-refund", () => ({
  issueCanonicalRefund: harness.issueRefund,
  reverseCanonicalRefund: harness.reverseRefund,
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
  GET as getReturnPosition,
  POST as postReturnRequest,
} from "@/app/api/orders/[id]/customer-return/route";
import { POST as postReturnTransition } from "@/app/api/orders/[id]/customer-return/[returnId]/transition/route";
import { POST as postRefund } from "@/app/api/orders/[id]/refunds/route";
import { POST as postRefundReversal } from "@/app/api/orders/[id]/refunds/[refundId]/reverse/route";

function request(path: string, body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.actorContext);
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.position.mockReset().mockResolvedValue({
    orderId: "order-a",
    availableActions: ["request"],
  });
  const command = {
    commandId: "command-a",
    aggregateVersion: 1,
    replayed: false,
    result: { orderId: "order-a" },
  };
  harness.requestReturn.mockReset().mockResolvedValue(command);
  harness.transitionReturn.mockReset().mockResolvedValue(command);
  harness.issueRefund.mockReset().mockResolvedValue(command);
  harness.reverseRefund.mockReset().mockResolvedValue(command);
});

function expectTrustedContext(call: unknown): void {
  expect(call).toEqual(
    expect.objectContaining({
      prisma: { marker: "exact-process-db" },
      shop: (harness.actorContext as { shop: unknown }).shop,
      businessPrincipal: harness.principal,
    }),
  );
}

describe("canonical customer-return API authority", () => {
  it("rejects a return request before parsing without trusted authority", async () => {
    harness.requireTrustedActor.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request(
      "/api/orders/order-a/customer-return",
      "{malformed-json",
    );
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postReturnRequest(incoming, {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.requestReturn).not.toHaveBeenCalled();
  });

  it("binds return reads and requests to the exact path order and shop", async () => {
    const read = await getReturnPosition(
      request("/api/orders/order-a/customer-return"),
      { params: Promise.resolve({ id: "order-a" }) },
    );
    expect(read.status).toBe(200);
    expectTrustedContext(harness.position.mock.calls[0]?.[0]);
    expect(harness.position).toHaveBeenCalledWith(expect.anything(), "order-a");

    const response = await postReturnRequest(
      request(
        "/api/orders/order-a/customer-return",
        JSON.stringify({
          orderId: "attacker-order",
          caseType: "return",
          expectedVersion: 5,
        }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );
    expect(response.status).toBe(200);
    expectTrustedContext(harness.requestReturn.mock.calls[0]?.[0]);
    expect(harness.requestReturn.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ orderId: "order-a" }),
    );
  });

  it("binds return transitions to both path identities", async () => {
    const response = await postReturnTransition(
      request(
        "/api/orders/order-a/customer-return/return-a/transition",
        JSON.stringify({
          orderId: "attacker-order",
          returnId: "attacker-return",
          action: "approve",
        }),
      ),
      {
        params: Promise.resolve({ id: "order-a", returnId: "return-a" }),
      },
    );

    expect(response.status).toBe(200);
    expectTrustedContext(harness.transitionReturn.mock.calls[0]?.[0]);
    expect(harness.transitionReturn.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ orderId: "order-a", returnId: "return-a" }),
    );
  });

  it("binds refund issue and reversal to path identities", async () => {
    const issued = await postRefund(
      request(
        "/api/orders/order-a/refunds",
        JSON.stringify({ orderId: "attacker-order", amount: 1000 }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );
    expect(issued.status).toBe(200);
    expectTrustedContext(harness.issueRefund.mock.calls[0]?.[0]);
    expect(harness.issueRefund.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ orderId: "order-a" }),
    );

    const reversed = await postRefundReversal(
      request(
        "/api/orders/order-a/refunds/refund-a/reverse",
        JSON.stringify({
          orderId: "attacker-order",
          refundId: "attacker-refund",
          amount: 500,
        }),
      ),
      { params: Promise.resolve({ id: "order-a", refundId: "refund-a" }) },
    );
    expect(reversed.status).toBe(200);
    expectTrustedContext(harness.reverseRefund.mock.calls[0]?.[0]);
    expect(harness.reverseRefund.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ orderId: "order-a", refundId: "refund-a" }),
    );
  });
});
