import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  context: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "current-session",
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
  requireActor: vi.fn(),
  listMembers: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: harness.requireActor,
}));

vi.mock("@/lib/identity/team-directory", () => ({
  listTeamMembers: harness.listMembers,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: () => Promise<Response>) =>
    async (): Promise<Response> => {
      try {
        return await handler();
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

import { GET } from "@/app/api/auth/me/route";

beforeEach(() => {
  harness.context.actor.role = "owner";
  delete (harness.context.actor as { permissions?: readonly string[] }).permissions;
  harness.requireActor.mockReset().mockResolvedValue(harness.context);
  harness.listMembers.mockReset().mockResolvedValue([]);
});

describe("GET /api/auth/me", () => {
  it("returns the durable owner self-view", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      profile: {
        kind: "owner",
        memberId: "6".repeat(32),
        deviceId: "7".repeat(32),
        role: "owner",
        shopIds: ["default"],
      },
    });
  });

  it("returns the accepted member profile and custom permissions", async () => {
    harness.context.actor.role = "operator";
    (harness.context.actor as { permissions?: readonly string[] }).permissions = [
      "shops.read",
    ];
    harness.listMembers.mockResolvedValue([
      {
        personId: "5".repeat(32),
        memberId: "6".repeat(32),
        deviceId: "7".repeat(32),
        invitationId: "8".repeat(32),
        displayName: "Amina",
        loginId: "amina.ops",
        role: "operator",
        permissions: ["shops.read"],
        shopIds: ["default"],
        policyVersion: 1,
        revocationEpoch: 0,
        createdAt: new Date().toISOString(),
        revokedAt: null,
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      profile: {
        kind: "team_member",
        displayName: "Amina",
        loginId: "amina.ops",
        role: "operator",
        permissions: ["shops.read"],
        shopIds: ["default"],
      },
    });
  });
});
