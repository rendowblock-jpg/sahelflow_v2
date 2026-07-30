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
      sessionId: "cod-owner-session",
    },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:cod-owner-session",
    auditActor:
      "authenticated-owner:compatibility_local_owner:cod-owner-session",
  } as unknown,
  requireTrustedActor: vi.fn(),
  principalFromActor: vi.fn(),
  collect: vi.fn(),
  postSettlement: vi.fn(),
  correctCollection: vi.fn(),
  correctLine: vi.fn(),
  matchLine: vi.fn(),
  summary: vi.fn(),
  position: vi.fn(),
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

vi.mock("@/lib/accounting/canonical-cod", () => ({
  recordCanonicalCodCollection: harness.collect,
  postCanonicalCodSettlement: harness.postSettlement,
  correctCanonicalCodCollection: harness.correctCollection,
  correctCanonicalCodSettlementLine: harness.correctLine,
  matchCanonicalCodSettlementLine: harness.matchLine,
}));

vi.mock("@/lib/accounting/canonical-cod-projections", () => ({
  getCanonicalCodWorkspaceSummary: harness.summary,
  getCanonicalCodOrderPosition: harness.position,
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

import { POST as postCollection } from "@/app/api/orders/[id]/cod/collection/route";
import { POST as correctCollection } from "@/app/api/orders/[id]/cod/collection/correction/route";
import { GET as getPosition } from "@/app/api/orders/[id]/cod/position/route";
import {
  GET as getWorkspace,
  POST as postSettlement,
} from "@/app/api/accounting/cod-settlements/route";
import { POST as correctLine } from "@/app/api/accounting/cod-settlements/lines/[lineId]/correction/route";
import { POST as matchLine } from "@/app/api/accounting/cod-settlements/lines/[lineId]/match/route";

function request(path: string, body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

function command(result: Record<string, unknown>) {
  return {
    commandId: "cod-command",
    aggregateVersion: 1,
    replayed: false,
    result,
  };
}

beforeEach(() => {
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.actorContext);
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.collect.mockReset().mockResolvedValue(command({ orderId: "order-a" }));
  harness.postSettlement.mockReset().mockResolvedValue(command({ settlementId: "settlement-a" }));
  harness.correctCollection.mockReset().mockResolvedValue(command({ orderId: "order-a" }));
  harness.correctLine.mockReset().mockResolvedValue(command({ settlementLineId: "line-a" }));
  harness.matchLine.mockReset().mockResolvedValue(command({ settlementLineId: "line-a" }));
  harness.summary.mockReset().mockResolvedValue({ totals: {} });
  harness.position.mockReset().mockResolvedValue({ orderId: "order-a" });
});

describe("canonical COD trusted API boundaries", () => {
  it("rejects collection before parsing an untrusted request body", async () => {
    harness.requireTrustedActor.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
    const incoming = request(
      "/api/orders/order-a/cod/collection",
      "{malformed-json",
    );
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postCollection(incoming, {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(401);
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(harness.collect).not.toHaveBeenCalled();
  });

  it("binds collection to the path order and exact server-minted authority", async () => {
    const response = await postCollection(
      request(
        "/api/orders/order-a/cod/collection",
        JSON.stringify({ amount: 5000, expectedVersion: 5 }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.principalFromActor).toHaveBeenCalledWith(harness.actorContext);
    expect(harness.collect).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
        businessPrincipal: harness.principal,
      }),
      expect.objectContaining({
        orderId: "order-a",
        amount: 5000,
        expectedVersion: 5,
      }),
    );
  });

  it("binds settlement posting and workspace reads to the same exact shop", async () => {
    const postResponse = await postSettlement(
      request(
        "/api/accounting/cod-settlements",
        JSON.stringify({ externalReference: "REM-1", lines: [{}] }),
      ),
    );
    const getResponse = await getWorkspace();

    expect(postResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    const expectedContext = expect.objectContaining({
      prisma: { marker: "exact-process-db" },
      shop: (harness.actorContext as { shop: unknown }).shop,
      businessPrincipal: harness.principal,
    });
    expect(harness.postSettlement).toHaveBeenCalledWith(
      expectedContext,
      expect.objectContaining({ externalReference: "REM-1" }),
    );
    expect(harness.summary).toHaveBeenCalledWith(expectedContext);
  });

  it("uses path identities for correction and unmatched-line reconciliation", async () => {
    await correctCollection(
      request(
        "/api/orders/order-a/cod/collection/correction",
        JSON.stringify({ amountDelta: 100 }),
      ),
      { params: Promise.resolve({ id: "order-a" }) },
    );
    await correctLine(
      request(
        "/api/accounting/cod-settlements/lines/line-a/correction",
        JSON.stringify({ grossDelta: 100 }),
      ),
      { params: Promise.resolve({ lineId: "line-a" }) },
    );
    await matchLine(
      request(
        "/api/accounting/cod-settlements/lines/line-a/match",
        JSON.stringify({ orderId: "order-a" }),
      ),
      { params: Promise.resolve({ lineId: "line-a" }) },
    );

    expect(harness.correctCollection).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ orderId: "order-a", amountDelta: 100 }),
    );
    expect(harness.correctLine).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ settlementLineId: "line-a", grossDelta: 100 }),
    );
    expect(harness.matchLine).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ settlementLineId: "line-a", orderId: "order-a" }),
    );
  });

  it("requires trusted authority for order-position reads", async () => {
    harness.requireTrustedActor.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });

    const response = await getPosition(request("/api/orders/order-a/cod/position"), {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(401);
    expect(harness.position).not.toHaveBeenCalled();
  });
});
