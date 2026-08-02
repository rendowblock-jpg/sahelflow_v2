import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireEligibility: vi.fn(),
  currentAuthority: vi.fn(),
  reauthenticateOwner: vi.fn(),
  prepareTeam: vi.fn(),
  registerTeam: vi.fn(),
  rotateTeam: vi.fn(),
  audit: vi.fn(),
  checkLimit: vi.fn(),
  getIp: vi.fn(),
  recordAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireReauthenticationEligibility: harness.requireEligibility,
  getCurrentSessionAuthority: harness.currentAuthority,
  reauthenticateCurrentSession: harness.reauthenticateOwner,
  auditLog: harness.audit,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: harness.checkLimit,
  getClientIp: harness.getIp,
  recordLoginAttempt: harness.recordAttempt,
  recordLoginFailure: harness.recordFailure,
  recordLoginSuccess: harness.recordSuccess,
}));

vi.mock("@/lib/identity/team-reauthentication", () => ({
  prepareTeamReauthentication: harness.prepareTeam,
}));

vi.mock("@/lib/identity/team-revocation-authority", () => ({
  registerTeamSessionAuthority: harness.registerTeam,
}));

vi.mock("@/lib/identity/team-session", () => ({
  rotateTeamDatabaseSession: harness.rotateTeam,
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
    (handler: (request: Request) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      try {
        return await handler(request);
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

import { POST } from "@/app/api/auth/reauthenticate/route";

function request(body: string): Request {
  return new Request("http://localhost/api/auth/reauthenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.requireEligibility.mockReset().mockResolvedValue(undefined);
  harness.currentAuthority.mockReset().mockResolvedValue({
    status: "authenticated",
    sessionId: "current-session",
    issuedAt: new Date("2026-07-31T20:00:00.000Z"),
    lastSeenAt: new Date("2026-07-31T20:00:00.000Z"),
  });
  harness.prepareTeam.mockReset().mockResolvedValue({ subject: "owner" });
  harness.reauthenticateOwner
    .mockReset()
    .mockResolvedValue({ reauthenticated: true });
  harness.registerTeam.mockReset().mockResolvedValue({
    sessionId: "new-team-session",
    memberId: "6".repeat(32),
    personId: "5".repeat(32),
    deviceId: "7".repeat(32),
    registeredAt: new Date().toISOString(),
    revokedAt: null,
  });
  harness.rotateTeam.mockReset().mockResolvedValue({
    sessionId: "new-team-session",
    issuedAt: new Date(),
    replayed: false,
  });
  harness.audit.mockReset().mockResolvedValue(undefined);
  harness.checkLimit.mockReset().mockReturnValue({
    allowed: true,
    locked: false,
    retryAfterMs: 0,
  });
  harness.getIp.mockReset().mockReturnValue("127.0.0.1");
  harness.recordAttempt.mockReset();
  harness.recordFailure.mockReset().mockReturnValue({
    allowed: true,
    locked: false,
    retryAfterMs: 0,
  });
  harness.recordSuccess.mockReset();
});

describe("POST /api/auth/reauthenticate", () => {
  it("proves current-or-stale identity eligibility before parsing the PIN body", async () => {
    harness.requireEligibility.mockRejectedValue(
      Object.assign(new Error("Identity binding is revoked"), {
        code: "IDENTITY_SESSION_BINDING_REQUIRED",
        statusCode: 401,
      }),
    );

    const response = await POST(request("{not-json"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
    });
    expect(harness.checkLimit).not.toHaveBeenCalled();
    expect(harness.prepareTeam).not.toHaveBeenCalled();
    expect(harness.reauthenticateOwner).not.toHaveBeenCalled();
    expect(harness.registerTeam).not.toHaveBeenCalled();
  });

  it("rotates an eligible owner session after owner PIN proof", async () => {
    const response = await POST(request(JSON.stringify({ pin: "12345678" })));

    expect(response.status).toBe(200);
    expect(harness.prepareTeam).toHaveBeenCalledWith(
      "current-session",
      "12345678",
      expect.objectContaining({ shopId: "default" }),
    );
    expect(harness.reauthenticateOwner).toHaveBeenCalledWith(
      "12345678",
      "127.0.0.1",
    );
    expect(harness.registerTeam).not.toHaveBeenCalled();
    expect(harness.rotateTeam).not.toHaveBeenCalled();
  });

  it("registers and rotates a known team session with that member's PIN", async () => {
    const actor = {
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      role: "operator" as const,
      permissions: null,
      policyVersion: 1,
      revocationEpoch: 0,
    };
    harness.prepareTeam.mockResolvedValue({
      subject: "team",
      grant: {
        sessionId: "new-team-session",
        actor,
        displayName: "Amina",
        loginId: "amina.ops",
        invitationId: "8".repeat(32),
        replayed: false,
      },
    });

    const response = await POST(request(JSON.stringify({ pin: "12345678" })));

    expect(response.status).toBe(200);
    expect(harness.registerTeam).toHaveBeenCalledWith({
      sessionId: "new-team-session",
      actor,
      shop: expect.objectContaining({ shopId: "default" }),
    });
    expect(harness.registerTeam.mock.invocationCallOrder[0]).toBeLessThan(
      harness.rotateTeam.mock.invocationCallOrder[0]!,
    );
    expect(harness.rotateTeam).toHaveBeenCalledWith(
      "current-session",
      "new-team-session",
      "127.0.0.1",
    );
    expect(harness.reauthenticateOwner).not.toHaveBeenCalled();
  });

  it("never falls through to owner PIN for a known team session", async () => {
    harness.prepareTeam.mockResolvedValue({ subject: "team", grant: null });

    const response = await POST(request(JSON.stringify({ pin: "owner-pin" })));

    expect(response.status).toBe(401);
    expect(harness.registerTeam).not.toHaveBeenCalled();
    expect(harness.rotateTeam).not.toHaveBeenCalled();
    expect(harness.reauthenticateOwner).not.toHaveBeenCalled();
    expect(harness.recordFailure).toHaveBeenCalledWith("127.0.0.1");
  });

  it("applies rate limiting after authority but before parsing the PIN", async () => {
    harness.checkLimit.mockReturnValue({
      allowed: false,
      locked: true,
      retryAfterMs: 60_000,
    });

    const response = await POST(request("{not-json"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(harness.requireEligibility).toHaveBeenCalledTimes(1);
    expect(harness.recordAttempt).not.toHaveBeenCalled();
    expect(harness.prepareTeam).not.toHaveBeenCalled();
    expect(harness.registerTeam).not.toHaveBeenCalled();
  });
});
