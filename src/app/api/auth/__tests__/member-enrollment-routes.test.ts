import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authSetup: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  recordAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  accept: vi.fn(),
  establish: vi.fn(),
  memberLogin: vi.fn(),
  ownerPin: vi.fn(),
  ownerSession: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  isAuthSetup: harness.authSetup,
  auditLog: harness.audit,
  verifyAuthPinAndMaybeRehash: harness.ownerPin,
  createSession: harness.ownerSession,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: harness.rateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
  recordLoginAttempt: harness.recordAttempt,
  recordLoginFailure: harness.recordFailure,
  recordLoginSuccess: harness.recordSuccess,
}));

vi.mock("@/lib/identity/team-directory", () => ({
  acceptTeamInvitation: harness.accept,
  createTeamLoginSession: harness.memberLogin,
}));

vi.mock("@/lib/identity/team-session", () => ({
  establishTeamSession: harness.establish,
}));

vi.mock("@/lib/db", () => ({
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "default",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 1,
    databaseFileId: "default.db",
    migrationSetSha256: "4".repeat(64),
  },
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

import { POST as acceptInvitation } from "@/app/api/auth/invitations/accept/route";
import { POST as login } from "@/app/api/auth/login/route";

const actor = {
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  role: "operator" as const,
  permissions: null,
  policyVersion: 1,
  revocationEpoch: 0,
};

beforeEach(() => {
  harness.authSetup.mockReset().mockResolvedValue(true);
  harness.audit.mockReset().mockResolvedValue(undefined);
  harness.rateLimit.mockReset().mockReturnValue({ allowed: true });
  harness.recordAttempt.mockReset();
  harness.recordFailure.mockReset().mockReturnValue({ allowed: true, locked: false });
  harness.recordSuccess.mockReset();
  harness.accept.mockReset().mockResolvedValue({
    sessionId: "member-session",
    actor,
    displayName: "Amina",
    loginId: "amina.ops",
    invitationId: "8".repeat(32),
    replayed: false,
  });
  harness.establish.mockReset().mockResolvedValue({
    sessionId: "member-session",
    issuedAt: new Date(),
    replayed: false,
  });
  harness.memberLogin.mockReset().mockResolvedValue({
    sessionId: "member-login-session",
    actor,
    displayName: "Amina",
    loginId: "amina.ops",
    invitationId: "8".repeat(32),
    replayed: false,
  });
  harness.ownerPin.mockReset().mockResolvedValue({ valid: true });
  harness.ownerSession.mockReset().mockResolvedValue(undefined);
});

describe("member enrollment and login routes", () => {
  it("checks configured auth before consuming invitation input", async () => {
    harness.authSetup.mockResolvedValue(false);
    const json = vi.fn();
    const response = await acceptInvitation({
      headers: new Headers(),
      json,
    } as unknown as Request);

    expect(response.status).toBe(409);
    expect(json).not.toHaveBeenCalled();
    expect(harness.accept).not.toHaveBeenCalled();
  });

  it("accepts one invitation and establishes its exact stable session", async () => {
    const input = {
      token: `sf-invite-v1.${"8".repeat(32)}.${"a".repeat(43)}`,
      requestId: "11111111-1111-4111-8111-111111111111",
      displayName: "Amina",
      loginId: "amina.ops",
      pin: "12345678",
    };
    const response = await acceptInvitation(
      new Request("http://localhost/api/auth/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.accept).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ shopId: "default" }),
    );
    expect(harness.establish).toHaveBeenCalledWith(
      "member-session",
      "127.0.0.1",
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      member: { loginId: "amina.ops", role: "operator" },
    });
  });

  it("uses individual credentials when loginId is supplied", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: "AMINA.OPS", pin: "12345678" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.memberLogin).toHaveBeenCalledWith(
      "amina.ops",
      "12345678",
      expect.objectContaining({ shopId: "default" }),
    );
    expect(harness.establish).toHaveBeenCalledWith(
      "member-login-session",
      "127.0.0.1",
    );
    expect(harness.ownerPin).not.toHaveBeenCalled();
    expect(harness.ownerSession).not.toHaveBeenCalled();
  });

  it("preserves the PIN-only owner login path", async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "12345678" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.ownerPin).toHaveBeenCalledWith("12345678");
    expect(harness.ownerSession).toHaveBeenCalledWith("127.0.0.1");
    expect(harness.memberLogin).not.toHaveBeenCalled();
  });
});
