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
      sessionId: "recovery-owner-session",
    },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:recovery-owner-session",
    auditActor:
      "authenticated-owner:compatibility_local_owner:recovery-owner-session",
  } as unknown,
  requireTrustedActor: vi.fn(),
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  principalFromActor: vi.fn(),
  execute: vi.fn(),
  position: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireTrustedActor,
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  assertTrustedAction: harness.assertTrustedAction,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: harness.principalFromActor,
}));

vi.mock("@/lib/db", () => ({
  db: { marker: "exact-process-db" },
}));

vi.mock("@/lib/orders/canonical-order-recovery", () => ({
  executeCanonicalOrderRecovery: harness.execute,
  getCanonicalOrderRecoveryPosition: harness.position,
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
  GET as getRecovery,
  POST as postRecovery,
} from "@/app/api/orders/[id]/recovery/route";

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
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertTrustedAction.mockReset();
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.execute.mockReset().mockResolvedValue({
    commandId: "recovery-command",
    aggregateVersion: 1,
    replayed: false,
    result: { orderId: "order-a", action: "cancel" },
  });
  harness.position.mockReset().mockResolvedValue({
    orderId: "order-a",
    availableActions: ["cancel"],
  });
});

describe("canonical order recovery trusted API boundary", () => {
  it("rejects before parsing an untrusted request body", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request(
      "/api/orders/order-a/recovery",
      "{malformed-json",
    );
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postRecovery(incoming, {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("binds the path order to the exact trusted shop and principal", async () => {
    const response = await postRecovery(
      request(
        "/api/orders/order-a/recovery",
        JSON.stringify({
          orderId: "attacker-order",
          action: "cancel",
          expectedVersion: 2,
        }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
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
        action: "cancel",
        expectedVersion: 2,
      }),
    );
  });

  it("binds recovery position reads to the same exact authority", async () => {
    const response = await getRecovery(
      request("/api/orders/order-a/recovery"),
      { params: Promise.resolve({ id: "order-a" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.position).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
        businessPrincipal: harness.principal,
      }),
      "order-a",
    );
  });
});
