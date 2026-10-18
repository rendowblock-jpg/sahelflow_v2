import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireTrustedAction: vi.fn(),
  changePin: vi.fn(),
  audit: vi.fn(),
  checkLimit: vi.fn(),
  getIp: vi.fn(),
  recordAttempt: vi.fn(),
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
}));

vi.mock("@/lib/auth/server", () => ({
  changeAuthPin: harness.changePin,
  auditLog: harness.audit,
}));

vi.mock("@/lib/auth/rate-limit", () => ({
  checkLoginRateLimit: harness.checkLimit,
  getClientIp: harness.getIp,
  getConfirmationLimiterKey: (sessionId: string) => `confirm:session:${sessionId}`,
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

import { POST } from "@/app/api/auth/change-pin/route";

const shop = {
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
};

function ownerContext() {
  return {
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
    shop,
  };
}

beforeEach(() => {
  harness.requireTrustedAction.mockReset().mockResolvedValue(ownerContext());
  harness.changePin.mockReset().mockResolvedValue({ changed: true });
  harness.audit.mockReset().mockResolvedValue(undefined);
  harness.checkLimit.mockReset().mockReturnValue({ allowed: true });
  harness.getIp.mockReset().mockReturnValue("127.0.0.1");
  harness.recordAttempt.mockReset();
  harness.recordFailure.mockReset().mockReturnValue({ allowed: true, locked: false });
  harness.recordSuccess.mockReset();
});

describe("POST /api/auth/change-pin", () => {
  it("proves owner authority before consuming the PIN body", async () => {
    harness.requireTrustedAction.mockRejectedValue(
      Object.assign(new Error("Forbidden"), {
        code: "ACTION_FORBIDDEN",
        statusCode: 403,
      }),
    );
    const json = vi.fn();

    const response = await POST({
      headers: new Headers(),
      json,
    } as unknown as Request);

    expect(response.status).toBe(403);
    expect(harness.requireTrustedAction).toHaveBeenCalledWith("members.manage");
    expect(json).not.toHaveBeenCalled();
    expect(harness.changePin).not.toHaveBeenCalled();
  });

  it("rejects a non-owner even if an upstream mock grants the action", async () => {
    harness.requireTrustedAction.mockResolvedValue({
      ...ownerContext(),
      actor: {
        ...ownerContext().actor,
        role: "manager" as const,
        permissions: ["members.manage"] as const,
      },
    });
    const json = vi.fn();

    const response = await POST({
      headers: new Headers(),
      json,
    } as unknown as Request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(harness.changePin).not.toHaveBeenCalled();
  });

  it("changes the owner PIN after exact owner authority", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: "12345678", newPin: "87654321" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.changePin).toHaveBeenCalledWith(
      "12345678",
      "87654321",
      "127.0.0.1",
    );
  });
});

describe("limiter bucket (IDN-01)", () => {
  it("keys the allowance on the verified owner session, never on a forwarding header", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/change-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.78",
        },
        body: JSON.stringify({ currentPin: "12345678", newPin: "87654321" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.checkLimit).toHaveBeenCalledWith("confirm:session:owner-session");
    expect(harness.recordAttempt).toHaveBeenCalledWith("confirm:session:owner-session");
    expect(harness.recordSuccess).toHaveBeenCalledWith("confirm:session:owner-session");
    for (const spy of [harness.checkLimit, harness.recordAttempt, harness.recordSuccess]) {
      expect(spy).not.toHaveBeenCalledWith("203.0.113.78");
      expect(spy).not.toHaveBeenCalledWith("127.0.0.1");
    }
  });

  it("counts a wrong current PIN against the same session bucket", async () => {
    harness.changePin.mockResolvedValue({ changed: false, reason: "invalid_current_pin" });

    const response = await POST(
      new Request("http://localhost/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: "00000000", newPin: "87654321" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(harness.recordFailure).toHaveBeenCalledWith("confirm:session:owner-session");
  });
});
