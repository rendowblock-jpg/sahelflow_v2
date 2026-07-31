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
      sessionId: "session-current",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 7,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireTrustedAction: vi.fn(),
  requireRecentReauthentication: vi.fn(),
  getView: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  trustedActorAuditIdentity: vi.fn(
    () => `person:${harness.context.actor.personId}`,
  ),
}));

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: harness.requireRecentReauthentication,
}));

vi.mock("@/lib/identity/session-administration", () => ({
  getIdentityAdministrationView: harness.getView,
  revokeAdministrativeSession: harness.revoke,
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

import { GET as getAuthority } from "@/app/api/auth/authority/route";
import { POST as revokeSession } from "@/app/api/auth/sessions/[id]/revoke/route";

beforeEach(() => {
  harness.context.actor.role = "owner";
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.context);
  harness.requireRecentReauthentication.mockReset().mockResolvedValue(undefined);
  harness.getView.mockReset().mockResolvedValue({
    revision: 2,
    sessions: [],
    devices: [],
  });
  harness.revoke.mockReset().mockResolvedValue({
    state: "revoked",
    sessionId: "session-target",
    databaseState: "revoked",
  });
});

describe("identity administration routes", () => {
  it("returns the exact owner installation inventory", async () => {
    const response = await getAuthority();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authority: { revision: 2, sessions: [], devices: [] },
    });
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("sessions.read");
    expect(harness.getView).toHaveBeenCalledWith(
      "session-current",
      harness.context.shop,
    );
  });

  it("keeps the combined session/device inventory owner-only", async () => {
    harness.context.actor.role = "manager" as "owner";

    const response = await getAuthority();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACTION_FORBIDDEN",
    });
    expect(harness.getView).not.toHaveBeenCalled();
  });

  it("authenticates before consuming the target session ID", async () => {
    harness.requireTrustedAction.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
      }),
    );
    let paramsConsumed = false;
    const params = new Promise<{ id: string }>((resolve) => {
      queueMicrotask(() => {
        paramsConsumed = true;
        resolve({ id: "session-target" });
      });
    });

    const response = await revokeSession(
      new NextRequest(
        "http://localhost/api/auth/sessions/session-target/revoke",
        { method: "POST" },
      ),
      { params },
    );

    expect(response.status).toBe(401);
    expect(harness.requireRecentReauthentication).not.toHaveBeenCalled();
    expect(harness.revoke).not.toHaveBeenCalled();
    expect(paramsConsumed).toBe(false);
  });

  it("requires recent PIN proof before consuming the target session ID", async () => {
    harness.requireRecentReauthentication.mockRejectedValue(
      Object.assign(new Error("Recent PIN verification is required"), {
        code: "REAUTHENTICATION_REQUIRED",
        statusCode: 403,
      }),
    );
    let paramsConsumed = false;
    const params = new Promise<{ id: string }>((resolve) => {
      queueMicrotask(() => {
        paramsConsumed = true;
        resolve({ id: "session-target" });
      });
    });

    const response = await revokeSession(
      new NextRequest(
        "http://localhost/api/auth/sessions/session-target/revoke",
        { method: "POST" },
      ),
      { params },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
    });
    expect(harness.revoke).not.toHaveBeenCalled();
    expect(paramsConsumed).toBe(false);
  });

  it("revokes another session with exact actor and shop authority", async () => {
    const response = await revokeSession(
      new NextRequest(
        "http://localhost/api/auth/sessions/session-target/revoke",
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: "session-target" }) },
    );

    expect(response.status).toBe(200);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("sessions.revoke");
    expect(harness.requireRecentReauthentication).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledWith({
      currentSessionId: "session-current",
      targetSessionId: "session-target",
      shop: harness.context.shop,
      auditActor: `person:${harness.context.actor.personId}`,
    });
  });
});
