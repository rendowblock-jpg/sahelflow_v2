import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authSetup: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  recordAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  decide: vi.fn(),
  register: vi.fn(),
  establish: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  isAuthSetup: harness.authSetup,
  auditLog: harness.audit,
  verifyAuthPinAndMaybeRehash: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: harness.rateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
  getLoginLimiterKey: vi.fn(() => "test-login-limiter-key"),
  getOwnerLoginLimiterKey: vi.fn(() => "test-owner-limiter-key"),
  getMemberLoginLimiterKey: vi.fn((loginId: string) => `test-member:${loginId}`),
  holdFailedAttempt: vi.fn(async () => undefined),
  recordLoginAttempt: harness.recordAttempt,
  recordLoginFailure: harness.recordFailure,
  recordLoginSuccess: harness.recordSuccess,
}));

vi.mock("@/lib/identity/team-credentials", () => ({
  decideActiveTeamLogin: harness.decide,
}));

vi.mock("@/lib/identity/team-revocation-authority", () => ({
  registerTeamSessionAuthority: harness.register,
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

import { POST as login } from "@/app/api/auth/login/route";

function memberRequest(pin: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginId: "amina.ops", pin }),
  });
}

beforeEach(() => {
  harness.authSetup.mockReset().mockResolvedValue(true);
  harness.audit.mockReset().mockResolvedValue(undefined);
  harness.rateLimit.mockReset().mockReturnValue({ allowed: true });
  harness.recordAttempt.mockReset();
  harness.recordFailure.mockReset().mockReturnValue({ allowed: true, locked: false });
  harness.recordSuccess.mockReset();
  harness.decide.mockReset();
  harness.register.mockReset();
  harness.establish.mockReset();
});

describe("POST /api/auth/login team PIN", () => {
  it("returns a validation code for a short team PIN and does not consume an attempt", async () => {
    const response = await login(memberRequest("1234567"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "REQUEST_VALIDATION_FAILED",
    });
    expect(harness.recordAttempt).not.toHaveBeenCalled();
    expect(harness.recordFailure).not.toHaveBeenCalled();
    expect(harness.decide).not.toHaveBeenCalled();
    expect(response.status).not.toBe(500);
  });

  it("keeps a wrong PIN as INVALID_CREDENTIALS", async () => {
    harness.decide.mockResolvedValue({ code: "invalid" });
    const response = await login(memberRequest("12345678"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Incorrect login or PIN",
      code: "INVALID_CREDENTIALS",
    });
    expect(harness.recordFailure).toHaveBeenCalledTimes(1);
  });

  it("says this shop is not available when the PIN matches another shop's grant", async () => {
    harness.decide.mockResolvedValue({ code: "shop_unavailable" });
    const response = await login(memberRequest("12345678"));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({
      error: "This shop is not available for that account.",
      code: "TEAM_SHOP_UNAVAILABLE",
    });
    expect(body).not.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(harness.recordFailure).not.toHaveBeenCalled();
    expect(harness.recordSuccess).not.toHaveBeenCalled();
  });
});
