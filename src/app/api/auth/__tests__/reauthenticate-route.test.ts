import { describe, expect, it, beforeEach, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireEligibility: vi.fn(),
  reauthenticate: vi.fn(),
  audit: vi.fn(),
  checkLimit: vi.fn(),
  getIp: vi.fn(),
  recordAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireReauthenticationEligibility: harness.requireEligibility,
  reauthenticateCurrentSession: harness.reauthenticate,
  auditLog: harness.audit,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: harness.checkLimit,
  getClientIp: harness.getIp,
  recordLoginAttempt: harness.recordAttempt,
  recordLoginFailure: harness.recordFailure,
  recordLoginSuccess: harness.recordSuccess,
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
  harness.reauthenticate.mockReset().mockResolvedValue({ reauthenticated: true });
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
    expect(harness.recordAttempt).not.toHaveBeenCalled();
    expect(harness.reauthenticate).not.toHaveBeenCalled();
  });

  it("rotates an eligible session after successful PIN proof", async () => {
    const response = await POST(request(JSON.stringify({ pin: "12345678" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      sessionRotated: true,
    });
    expect(harness.requireEligibility).toHaveBeenCalledTimes(1);
    expect(harness.reauthenticate).toHaveBeenCalledWith(
      "12345678",
      "127.0.0.1",
    );
    expect(harness.recordSuccess).toHaveBeenCalledWith("127.0.0.1");
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
    expect(harness.reauthenticate).not.toHaveBeenCalled();
  });
});
