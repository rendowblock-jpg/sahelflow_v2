import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  context: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "owner-session",
      role: "owner" as "owner" | "manager",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "shop-a",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 7,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireAction: vi.fn(),
  requireRecent: vi.fn(),
  createInvitation: vi.fn(),
  listInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
}));

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: harness.requireRecent,
}));

vi.mock("@/lib/identity/member-authority", () => ({
  createMemberInvitation: harness.createInvitation,
  listMemberInvitations: harness.listInvitations,
  revokeMemberInvitation: harness.revokeInvitation,
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
  GET as listInvitations,
  POST as createInvitation,
} from "@/app/api/auth/invitations/route";
import { POST as revokeInvitation } from "@/app/api/auth/invitations/[id]/revoke/route";

function post(path: string, body: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

function trackedParams(id: string): {
  params: Promise<{ id: string }>;
  consumed: () => boolean;
} {
  let wasConsumed = false;
  const thenable: Promise<{ id: string }> = {
    then(onFulfilled, onRejected) {
      wasConsumed = true;
      return Promise.resolve({ id }).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return this.then(undefined, onRejected);
    },
    finally(onFinally) {
      return Promise.resolve({ id }).finally(onFinally);
    },
    [Symbol.toStringTag]: "Promise",
  };
  return { params: thenable, consumed: () => wasConsumed };
}

beforeEach(() => {
  harness.context.actor.role = "owner";
  harness.requireAction.mockReset().mockResolvedValue(harness.context);
  harness.requireRecent.mockReset().mockResolvedValue(undefined);
  harness.listInvitations.mockReset().mockResolvedValue({
    revision: 0,
    invitations: [],
  });
  harness.createInvitation.mockReset().mockResolvedValue({
    invitation: {
      id: "a".repeat(32),
      role: "viewer",
      shopIds: ["shop-a"],
      state: "pending",
    },
    token: "sf-invite-v1.token",
    replayed: false,
    revision: 2,
  });
  harness.revokeInvitation.mockReset().mockResolvedValue({
    invitation: { id: "a".repeat(32), state: "revoked" },
    state: "revoked",
    revision: 3,
  });
});

describe("member invitation routes", () => {
  it("lists only after owner member authority", async () => {
    const response = await listInvitations();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(harness.requireAction).toHaveBeenCalledWith("members.manage");
    expect(harness.listInvitations).toHaveBeenCalledWith(
      "owner-session",
      harness.context.shop,
    );
  });

  it("rejects a non-owner even if a caller reaches the route", async () => {
    harness.context.actor.role = "manager";

    const response = await listInvitations();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACTION_FORBIDDEN",
    });
    expect(harness.listInvitations).not.toHaveBeenCalled();
  });

  it("authenticates before parsing an invitation body", async () => {
    harness.requireAction.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
      }),
    );

    const response = await createInvitation(
      post("/api/auth/invitations", "{not-json"),
    );

    expect(response.status).toBe(401);
    expect(harness.requireRecent).not.toHaveBeenCalled();
    expect(harness.createInvitation).not.toHaveBeenCalled();
  });

  it("requires recent PIN proof before parsing invitation authority", async () => {
    harness.requireRecent.mockRejectedValue(
      Object.assign(new Error("Recent PIN verification is required"), {
        code: "REAUTHENTICATION_REQUIRED",
        statusCode: 403,
      }),
    );

    const response = await createInvitation(
      post("/api/auth/invitations", "{not-json"),
    );

    expect(response.status).toBe(403);
    expect(harness.createInvitation).not.toHaveBeenCalled();
  });

  it("passes validated invitation input with exact actor and shop authority", async () => {
    const input = {
      requestId: "11111111-1111-4111-8111-111111111111",
      role: "viewer",
      shopIds: ["shop-a"],
      expiresInHours: 24,
    };

    const response = await createInvitation(
      post("/api/auth/invitations", JSON.stringify(input)),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(harness.createInvitation).toHaveBeenCalledWith(
      "owner-session",
      harness.context.shop,
      input,
    );
  });

  it("authenticates and reauthenticates before consuming a revoke target", async () => {
    harness.requireRecent.mockRejectedValue(
      Object.assign(new Error("Recent PIN verification is required"), {
        code: "REAUTHENTICATION_REQUIRED",
        statusCode: 403,
      }),
    );
    const tracked = trackedParams("a".repeat(32));

    const response = await revokeInvitation(
      post(`/api/auth/invitations/${"a".repeat(32)}/revoke`, "{}"),
      { params: tracked.params },
    );

    expect(response.status).toBe(403);
    expect(tracked.consumed()).toBe(false);
    expect(harness.revokeInvitation).not.toHaveBeenCalled();
  });

  it("revokes with exact owner session and process shop", async () => {
    const id = "a".repeat(32);
    const response = await revokeInvitation(
      post(`/api/auth/invitations/${id}/revoke`, "{}"),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(200);
    expect(harness.revokeInvitation).toHaveBeenCalledWith(
      "owner-session",
      id,
      harness.context.shop,
    );
  });
});
