import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const shopContext = {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  };
  const actor = {
    kind: "person" as const,
    personId: "6".repeat(32),
    workspaceMemberId: "7".repeat(32),
    deviceId: "8".repeat(32),
    sessionId: "session-owner",
    role: "owner" as const,
    policyVersion: 1,
    revocationEpoch: 0,
  };
  return {
    shopContext,
    actorContext: { version: 1, actor, shop: shopContext },
    identity: {
      workspace: { id: shopContext.workspaceId },
      installation: { id: shopContext.installationId },
      currentActor: {
        personId: actor.personId,
        workspaceMemberId: actor.workspaceMemberId,
        deviceId: actor.deviceId,
        policyVersion: actor.policyVersion,
        revocationEpoch: actor.revocationEpoch,
      },
      member: { id: actor.workspaceMemberId, shopIds: ["shop-a"] },
    },
    shops: [
      {
        id: "shop-a",
        incarnationId: "3".repeat(32),
        name: "Shop A",
        databaseFile: "shop-a.db",
        icon: null,
        createdAt: "2026-07-30T00:00:00.000Z",
      },
      {
        id: "shop-b",
        incarnationId: "5".repeat(32),
        name: "Shop B",
        databaseFile: "shop-b.db",
        icon: null,
        createdAt: "2026-07-30T00:00:00.000Z",
      },
    ],
    requireTrustedAction: vi.fn(),
    getIdentityAdministrationSnapshot: vi.fn(),
    enqueueLifecycle: vi.fn(),
    requireRecentReauthentication: vi.fn(),
    getCurrentSessionAuthority: vi.fn(),
    getActiveShopId: vi.fn(),
  };
});

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
}));

vi.mock("@/lib/identity/control-authority", () => ({
  getIdentityAdministrationSnapshot: harness.getIdentityAdministrationSnapshot,
}));

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: harness.requireRecentReauthentication,
  getCurrentSessionAuthority: harness.getCurrentSessionAuthority,
}));

vi.mock("@/lib/shops", () => ({
  listShops: vi.fn(() => harness.shops),
  getRegistry: vi.fn(() => ({
    formatVersion: 2,
    revision: harness.shopContext.registryRevision,
    workspaceId: harness.shopContext.workspaceId,
    installationId: harness.shopContext.installationId,
    activeShopId: harness.shopContext.shopId,
    shops: harness.shops,
  })),
  getActiveShopId: harness.getActiveShopId,
  getShop: vi.fn(
    (id: string) => harness.shops.find((shop) => shop.id === id) ?? null,
  ),
}));

vi.mock("@/lib/shops/native-lifecycle-authority", () => ({
  registryLifecycleTarget: (
    id: string,
    shops: typeof harness.shops,
  ) => {
    const shop = shops.find((candidate) => candidate.id === id);
    if (!shop) throw new Error("Shop not found");
    return { id: shop.id, incarnationId: shop.incarnationId };
  },
  enqueueAuthorizedNativeLifecycle: harness.enqueueLifecycle,
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

import { GET as listShops, POST as createShop } from "@/app/api/shops/route";
import { PUT as switchShop } from "@/app/api/shops/active/route";
import {
  DELETE as deleteShop,
  GET as getShop,
} from "@/app/api/shops/[id]/route";

function request(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body: string,
): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function rejected(
  message: string,
  code: string,
  statusCode: number,
): Error & { code: string; statusCode: number } {
  return Object.assign(new Error(message), { code, statusCode });
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.requireTrustedAction.mockResolvedValue(harness.actorContext);
  harness.getIdentityAdministrationSnapshot.mockResolvedValue(harness.identity);
  harness.enqueueLifecycle.mockResolvedValue({
    status: "pending",
    operationId: "9".repeat(32),
    operation: "switch",
    targetShopId: "shop-b",
    targetShopIncarnationId: "5".repeat(32),
  });
  harness.requireRecentReauthentication.mockResolvedValue(undefined);
  harness.getCurrentSessionAuthority.mockResolvedValue({
    status: "authenticated",
    sessionId: "session-owner",
    issuedAt: new Date("2026-08-02T19:00:00.000Z"),
  });
  harness.getActiveShopId.mockReturnValue("shop-a");
});

describe("native shop route authorization behavior", () => {
  it("projects every registry shop to a durable installation owner", async () => {
    const response = await listShops();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activeShopId: "shop-a",
      shops: [{ id: "shop-a" }, { id: "shop-b" }],
    });
  });

  it("authenticates creation before parsing an untrusted body", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce(
      rejected("Unauthorized", "UNAUTHORIZED", 401),
    );
    const response = await createShop(
      request("/api/shops", "POST", "{not-json"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
    expect(harness.enqueueLifecycle).not.toHaveBeenCalled();
  });

  it("returns a pending native receipt instead of mutating the registry", async () => {
    harness.enqueueLifecycle.mockResolvedValueOnce({
      status: "pending",
      operationId: "a".repeat(32),
      operation: "create",
      targetShopId: null,
      targetShopIncarnationId: null,
    });
    const response = await createShop(
      request(
        "/api/shops",
        "POST",
        JSON.stringify({ name: "New shop", icon: null }),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      operationId: "a".repeat(32),
    });
    expect(harness.enqueueLifecycle).toHaveBeenCalledWith({
      action: "shops.create",
      operation: "create",
      payload: { operation: "create", name: "New shop", icon: null },
      target: null,
    });
  });

  it("authenticates switching before parsing an untrusted body", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce(
      rejected("Unauthorized", "UNAUTHORIZED", 401),
    );
    const response = await switchShop(
      request("/api/shops/active", "PUT", "{not-json"),
    );
    expect(response.status).toBe(401);
    expect(harness.enqueueLifecycle).not.toHaveBeenCalled();
  });

  it("enqueues an owner-authorized switch without changing browser authority", async () => {
    const response = await switchShop(
      request(
        "/api/shops/active",
        "PUT",
        JSON.stringify({ shopId: "shop-b" }),
      ),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending",
      targetShopId: "shop-b",
    });
    expect(harness.enqueueLifecycle).toHaveBeenCalledWith({
      action: "shops.switch",
      operation: "switch",
      payload: { operation: "switch" },
      target: { id: "shop-b", incarnationId: "5".repeat(32) },
    });
  });

  it("keeps ordinary cross-shop reads denied", async () => {
    harness.requireTrustedAction.mockRejectedValueOnce(
      rejected("Forbidden", "ACTION_FORBIDDEN", 403),
    );
    const response = await getShop(
      new NextRequest("http://localhost/api/shops/shop-b"),
      { params: Promise.resolve({ id: "shop-b" }) },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACTION_FORBIDDEN",
    });
  });

  it("requires reauthentication before enqueuing destructive deletion", async () => {
    const response = await deleteShop(
      request(
        "/api/shops/shop-b",
        "DELETE",
        JSON.stringify({ confirmationShopId: "shop-b" }),
      ),
      { params: Promise.resolve({ id: "shop-b" }) },
    );
    expect(response.status).toBe(202);
    expect(harness.requireRecentReauthentication).toHaveBeenCalledOnce();
    expect(harness.enqueueLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "shops.delete",
        operation: "delete",
        recentOwnerReauthentication: true,
        target: { id: "shop-b", incarnationId: "5".repeat(32) },
      }),
    );
  });
});
