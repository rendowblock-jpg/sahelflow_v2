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
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireTrustedAction: vi.fn(),
  requireRecent: vi.fn(),
  getView: vi.fn(),
  revoke: vi.fn(),
  auditIdentity: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  trustedActorAuditIdentity: harness.auditIdentity,
}));

vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: harness.requireRecent,
}));

vi.mock("@/lib/identity/team-administration", () => ({
  getTeamAdministrationView: harness.getView,
  revokeAdministrativeTeamMember: harness.revoke,
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

import { GET as getMembers } from "@/app/api/auth/members/route";
import { POST as revokeMember } from "@/app/api/auth/members/[id]/revoke/route";

beforeEach(() => {
  harness.context.actor.role = "owner";
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.context);
  harness.requireRecent.mockReset().mockResolvedValue(undefined);
  harness.getView.mockReset().mockResolvedValue({ revision: 1, members: [] });
  harness.revoke.mockReset().mockResolvedValue({
    state: "revoked",
    memberId: "8".repeat(32),
    personId: "9".repeat(32),
    deviceId: "a".repeat(32),
    revokedAt: new Date().toISOString(),
    authorityRevision: 2,
    sessionIds: ["member-session"],
    databaseState: "revoked",
    changedSessions: 1,
  });
  harness.auditIdentity.mockReset().mockReturnValue("person:owner");
});

describe("member administration routes", () => {
  it("returns permission-filtered member inventory", async () => {
    const response = await getMembers();

    expect(response.status).toBe(200);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("members.read");
    expect(harness.getView).toHaveBeenCalledWith(harness.context.shop);
    await expect(response.json()).resolves.toMatchObject({
      authority: { revision: 1, members: [] },
      currentActor: { role: "owner" },
    });
  });

  it("authenticates before consuming the target member ID", async () => {
    harness.requireTrustedAction.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
      }),
    );
    let consumed = false;
    const params = {
      then: () => {
        consumed = true;
        return Promise.resolve({ id: "8".repeat(32) });
      },
    } as unknown as Promise<{ id: string }>;

    const response = await revokeMember(
      new NextRequest("http://localhost/api/auth/members/x/revoke", {
        method: "POST",
      }),
      { params },
    );

    expect(response.status).toBe(401);
    expect(consumed).toBe(false);
    expect(harness.requireRecent).not.toHaveBeenCalled();
    expect(harness.revoke).not.toHaveBeenCalled();
  });

  it("requires recent PIN proof before consuming the target member ID", async () => {
    harness.requireRecent.mockRejectedValue(
      Object.assign(new Error("Recent PIN verification is required"), {
        code: "REAUTHENTICATION_REQUIRED",
        statusCode: 403,
      }),
    );
    let consumed = false;
    const params = {
      then: () => {
        consumed = true;
        return Promise.resolve({ id: "8".repeat(32) });
      },
    } as unknown as Promise<{ id: string }>;

    const response = await revokeMember(
      new NextRequest("http://localhost/api/auth/members/x/revoke", {
        method: "POST",
      }),
      { params },
    );

    expect(response.status).toBe(403);
    expect(consumed).toBe(false);
    expect(harness.revoke).not.toHaveBeenCalled();
  });

  it("keeps member revocation explicitly owner-only", async () => {
    harness.context.actor.role = "manager" as "owner";
    const json = vi.fn();

    const response = await revokeMember(
      { json } as unknown as NextRequest,
      { params: Promise.resolve({ id: "8".repeat(32) }) },
    );

    expect(response.status).toBe(403);
    expect(harness.requireRecent).not.toHaveBeenCalled();
    expect(harness.revoke).not.toHaveBeenCalled();
  });

  it("revokes the exact member after authority and recent proof", async () => {
    const targetMemberId = "8".repeat(32);
    const response = await revokeMember(
      new NextRequest(
        `http://localhost/api/auth/members/${targetMemberId}/revoke`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: targetMemberId }) },
    );

    expect(response.status).toBe(200);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("members.manage");
    expect(harness.requireRecent).toHaveBeenCalledTimes(1);
    expect(harness.revoke).toHaveBeenCalledWith({
      currentOwnerSessionId: "owner-session",
      targetMemberId,
      shop: harness.context.shop,
      auditActor: "person:owner",
    });
  });
});
