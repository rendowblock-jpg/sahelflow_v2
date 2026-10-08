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
      role: "owner" as "owner" | "operator",
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
  requireTrustedActor: vi.fn(),
  requireRecent: vi.fn(),
  updateAccess: vi.fn(),
  resetPin: vi.fn(),
  changeOwnPin: vi.fn(),
  listTeamMembers: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  trustedActorAuditIdentity: () => "person:owner",
}));
vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireTrustedActor,
}));
vi.mock("@/lib/auth/server", () => ({
  requireRecentReauthentication: harness.requireRecent,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
  getClientIp: () => "127.0.0.1",
  recordLoginAttempt: vi.fn(),
  recordLoginFailure: () => ({ allowed: true, locked: false, retryAfterMs: 0 }),
  recordLoginSuccess: vi.fn(),
}));
vi.mock("@/lib/identity/team-member-administration", () => ({
  updateAdministrativeTeamMemberAccess: harness.updateAccess,
  resetAdministrativeTeamMemberPin: harness.resetPin,
  changeOwnTeamPin: harness.changeOwnPin,
}));
vi.mock("@/lib/identity/team-directory", () => ({
  listTeamMembers: harness.listTeamMembers,
}));
vi.mock("@/lib/identity/control-authority", () => ({
  getIdentityAdministrationSnapshot: vi.fn().mockResolvedValue({
    member: { shopIds: ["default", "second"] },
  }),
}));
vi.mock("@/lib/connected-platform/runtime", () => ({
  loadConnectedRuntimeIfEnrolled: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; code?: string; statusCode?: number; issues?: unknown };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? (typed.issues ? 400 : 500) },
        );
      }
    },
}));

import { PATCH as updateMember } from "@/app/api/auth/members/[id]/route";
import { POST as resetPin } from "@/app/api/auth/members/[id]/reset-pin/route";
import { POST as changeOwnPin } from "@/app/api/auth/me/pin/route";

const MEMBER = "8".repeat(32);
const params = Promise.resolve({ id: MEMBER });

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  harness.context.actor.role = "owner";
  harness.context.actor.sessionId = "owner-session";
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.context);
  harness.requireTrustedActor.mockReset().mockResolvedValue(harness.context);
  harness.requireRecent.mockReset().mockResolvedValue(undefined);
  harness.updateAccess.mockReset().mockResolvedValue({ memberId: MEMBER, changed: true, endedSessions: 1 });
  harness.resetPin.mockReset().mockResolvedValue({ memberId: MEMBER, changed: true, endedSessions: 1 });
  harness.changeOwnPin.mockReset().mockResolvedValue({ memberId: MEMBER, changed: true, endedSessions: 0 });
  harness.listTeamMembers.mockReset().mockResolvedValue([]);
});

describe("member access administration", () => {
  it("changes access only for a recently re-authenticated owner", async () => {
    const response = await updateMember(
      jsonRequest(`/api/auth/members/${MEMBER}`, "PATCH", {
        role: "manager",
        permissions: null,
        shopIds: ["default", "second"],
      }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("members.manage");
    expect(harness.requireRecent).toHaveBeenCalled();
    expect(harness.updateAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        currentOwnerSessionId: "owner-session",
        targetMemberId: MEMBER,
        access: { role: "manager", permissions: null, shopIds: ["default", "second"] },
      }),
    );
  });

  it("rejects a non-owner, a missing PIN proof and an unknown shop", async () => {
    harness.context.actor.role = "operator";
    let response = await updateMember(
      jsonRequest(`/api/auth/members/${MEMBER}`, "PATCH", { role: "viewer", permissions: null, shopIds: ["default"] }),
      { params },
    );
    expect(response.status).toBe(403);

    harness.context.actor.role = "owner";
    harness.requireRecent.mockRejectedValueOnce(
      Object.assign(new Error("Recent PIN verification is required"), { code: "REAUTHENTICATION_REQUIRED", statusCode: 403 }),
    );
    response = await updateMember(
      jsonRequest(`/api/auth/members/${MEMBER}`, "PATCH", { role: "viewer", permissions: null, shopIds: ["default"] }),
      { params },
    );
    await expect(response.json()).resolves.toMatchObject({ code: "REAUTHENTICATION_REQUIRED" });

    response = await updateMember(
      jsonRequest(`/api/auth/members/${MEMBER}`, "PATCH", { role: "viewer", permissions: null, shopIds: ["missing"] }),
      { params },
    );
    await expect(response.json()).resolves.toMatchObject({ code: "INVITATION_SHOP_FORBIDDEN" });
    expect(harness.updateAccess).not.toHaveBeenCalled();
  });

  it("resets a member PIN only for the owner", async () => {
    const response = await resetPin(
      jsonRequest(`/api/auth/members/${MEMBER}/reset-pin`, "POST", { newPin: "24681357" }),
      { params },
    );
    expect(response.status).toBe(200);
    expect(harness.resetPin).toHaveBeenCalledWith(
      expect.objectContaining({ targetMemberId: MEMBER, newPin: "24681357" }),
    );

    harness.context.actor.role = "operator";
    const denied = await resetPin(
      jsonRequest(`/api/auth/members/${MEMBER}/reset-pin`, "POST", { newPin: "24681357" }),
      { params },
    );
    expect(denied.status).toBe(403);
  });
});

describe("member self PIN change", () => {
  it("is refused to the owner, whose PIN has its own route", async () => {
    const response = await changeOwnPin(
      jsonRequest("/api/auth/me/pin", "POST", { currentPin: "12345678", newPin: "87654321" }),
    );
    expect(response.status).toBe(403);
    expect(harness.changeOwnPin).not.toHaveBeenCalled();
  });

  it("changes a member's PIN and reports a wrong current PIN", async () => {
    harness.context.actor.role = "operator";
    harness.context.actor.sessionId = "member-session";
    const ok = await changeOwnPin(
      jsonRequest("/api/auth/me/pin", "POST", { currentPin: "12345678", newPin: "87654321" }),
    );
    expect(ok.status).toBe(200);
    expect(harness.changeOwnPin).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "member-session", currentPin: "12345678", newPin: "87654321" }),
    );

    harness.changeOwnPin.mockResolvedValueOnce(null);
    const wrong = await changeOwnPin(
      jsonRequest("/api/auth/me/pin", "POST", { currentPin: "00000000", newPin: "87654321" }),
    );
    expect(wrong.status).toBe(403);
    await expect(wrong.json()).resolves.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const same = await changeOwnPin(
      jsonRequest("/api/auth/me/pin", "POST", { currentPin: "87654321", newPin: "87654321" }),
    );
    expect(same.status).toBe(400);
  });
});
