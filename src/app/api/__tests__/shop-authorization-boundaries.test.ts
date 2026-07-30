import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authority: {
    status: "authenticated",
    sessionId: "session-owner",
  } as unknown,
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
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
  createShop: vi.fn(),
  setActiveShopId: vi.fn(),
  deleteShop: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentSessionAuthority: vi.fn(async () => harness.authority),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: harness.shopContext,
}));

vi.mock("@/lib/shops", () => ({
  listShops: vi.fn(() => harness.shops),
  getActiveShopId: vi.fn(() => harness.shopContext.shopId),
  getShop: vi.fn((id: string) => harness.shops.find((shop) => shop.id === id) ?? null),
  createShop: harness.createShop,
  setActiveShopId: harness.setActiveShopId,
  deleteShop: harness.deleteShop,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: harness.logAudit,
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

beforeEach(() => {
  harness.authority = { status: "authenticated", sessionId: "session-owner" };
  harness.createShop.mockReset();
  harness.setActiveShopId.mockReset();
  harness.deleteShop.mockReset();
  harness.logAudit.mockReset();
});

describe("shop route authorization behavior", () => {
  it("returns only the exact process shop even though the registry has another shop", async () => {
    const response = await listShops();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activeShopId: "shop-a",
      shops: [{ id: "shop-a" }],
    });
  });

  it("normalizes setup-mode denial before exposing registry contents", async () => {
    harness.authority = { status: "setup" };
    const response = await listShops();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "TRUSTED_ACTOR_REQUIRED",
    });
  });

  it("keeps compatibility-owner shop creation disabled", async () => {
    const response = await createShop(request(
      "/api/shops",
      "POST",
      JSON.stringify({ name: "New shop" }),
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(harness.createShop).not.toHaveBeenCalled();
  });

  it("authenticates before parsing a shop-switch body", async () => {
    harness.authority = { status: "rejected", code: "SESSION_REQUIRED" };
    const response = await switchShop(request(
      "/api/shops/active",
      "PUT",
      "{not-json",
    ));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
    expect(harness.setActiveShopId).not.toHaveBeenCalled();
  });

  it("denies switching to another shop before changing registry preference", async () => {
    const response = await switchShop(request(
      "/api/shops/active",
      "PUT",
      JSON.stringify({ shopId: "shop-b" }),
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "ACTION_FORBIDDEN" });
    expect(harness.setActiveShopId).not.toHaveBeenCalled();
  });

  it("denies reading and deleting a different shop", async () => {
    const getResponse = await getShop(
      new NextRequest("http://localhost/api/shops/shop-b"),
      { params: Promise.resolve({ id: "shop-b" }) },
    );
    expect(getResponse.status).toBe(403);
    await expect(getResponse.json()).resolves.toMatchObject({
      code: "ACTION_FORBIDDEN",
    });

    const response = await deleteShop(
      request("/api/shops/shop-b", "DELETE", JSON.stringify({ confirm: "DELETE" })),
      { params: Promise.resolve({ id: "shop-b" }) },
    );
    expect(response.status).toBe(403);
    expect(harness.deleteShop).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });
});
