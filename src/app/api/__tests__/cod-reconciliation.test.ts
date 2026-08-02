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
      sessionId: "legacy-cod-owner-session",
    },
  } as unknown,
  principal: {
    kind: "authenticated-owner",
    subjectId: "compatibility_local_owner:legacy-cod-owner-session",
    auditActor:
      "authenticated-owner:compatibility_local_owner:legacy-cod-owner-session",
  } as unknown,
  requireTrustedActor: vi.fn(),
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  principalFromActor: vi.fn(),
  summary: vi.fn(),
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

vi.mock("@/lib/accounting/canonical-cod-projections", () => ({
  getCanonicalCodWorkspaceSummary: harness.summary,
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

import { GET as getCompatibilitySummary } from "@/app/api/accounting/cod-reconciliation/route";
import { POST as postLegacyBulk } from "@/app/api/accounting/cod-reconciliation/bulk/route";
import { PATCH as patchLegacyOrderCod } from "@/app/api/orders/[id]/cod/route";

function request(path: string, method = "GET", body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.actorContext);
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertTrustedAction.mockReset();
  harness.principalFromActor.mockReset().mockReturnValue(harness.principal);
  harness.summary.mockReset().mockResolvedValue({
    totals: { expectedReceivable: 5000 },
    counts: { receivable: 1 },
  });
});

describe("legacy COD route containment", () => {
  it("serves the old reconciliation GET from the canonical projection", async () => {
    const response = await getCompatibilitySummary();

    expect(response.status).toBe(200);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(response.headers.get("link")).toContain(
      "/api/accounting/cod-settlements",
    );
    expect(harness.principalFromActor).toHaveBeenCalledWith(harness.actorContext);
    expect(harness.summary).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: { marker: "exact-process-db" },
        shop: (harness.actorContext as { shop: unknown }).shop,
        businessPrincipal: harness.principal,
      }),
    );
    expect(await response.json()).toEqual({
      summary: {
        totals: { expectedReceivable: 5000 },
        counts: { receivable: 1 },
      },
      deprecated: true,
      canonicalEndpoint: "/api/accounting/cod-settlements",
    });
  });

  it("requires trusted authority before reading the compatibility alias", async () => {
    harness.requireTrustedActor.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });

    const response = await getCompatibilitySummary();

    expect(response.status).toBe(401);
    expect(harness.summary).not.toHaveBeenCalled();
  });

  it("returns 410 for the removed bulk scalar-remittance mutation", async () => {
    const incoming = request(
      "/api/accounting/cod-reconciliation/bulk",
      "POST",
      "{malformed-json",
    );
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await postLegacyBulk(incoming);

    expect(response.status).toBe(410);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: "LEGACY_COD_MUTATION_REMOVED",
      canonicalEndpoint: "/api/accounting/cod-settlements",
    });
  });

  it("returns 410 for the removed per-order scalar COD mutation", async () => {
    const incoming = request(
      "/api/orders/order-a/cod",
      "PATCH",
      "{malformed-json",
    );
    const jsonSpy = vi.spyOn(incoming, "json");

    const response = await patchLegacyOrderCod(incoming, {
      params: Promise.resolve({ id: "order-a" }),
    });

    expect(response.status).toBe(410);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: "LEGACY_COD_MUTATION_REMOVED",
      orderId: "order-a",
      collectionEndpoint: "/api/orders/order-a/cod/collection",
      settlementEndpoint: "/api/accounting/cod-settlements",
    });
  });

  it("authenticates before exposing removed mutation guidance", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce({
      message: "Trusted actor required",
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });

    const response = await postLegacyBulk(
      request("/api/accounting/cod-reconciliation/bulk", "POST", "{}"),
    );

    expect(response.status).toBe(401);
  });
});
