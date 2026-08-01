import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  context: {
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "current-session",
      role: "owner" as "owner" | "manager",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "shop-a",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "shop-a.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireAction: vi.fn(),
  administration: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
}));

vi.mock("@/lib/identity/team-administration", () => ({
  getTeamAdministrationView: harness.administration,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: () => Promise<Response>) =>
    async (): Promise<Response> => handler(),
}));

import { GET } from "@/app/api/auth/members/route";

const member = (memberId: string, shopIds: string[]) => ({
  personId: memberId.replace(/^./, "5"),
  memberId,
  deviceId: memberId.replace(/^./, "7"),
  invitationId: memberId.replace(/^./, "8"),
  displayName: memberId === "a".repeat(32) ? "Amina" : "Nadia",
  loginId: memberId === "a".repeat(32) ? "amina.ops" : "nadia.ops",
  role: "operator" as const,
  permissions: null,
  shopIds,
  policyVersion: 1,
  revocationEpoch: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  revokedAt: null,
  sessions: [],
});

beforeEach(() => {
  harness.context.actor.role = "owner";
  harness.requireAction.mockReset().mockResolvedValue(harness.context);
  harness.administration.mockReset().mockResolvedValue({
    revision: 4,
    members: [
      member("a".repeat(32), ["shop-a"]),
      member("b".repeat(32), ["shop-b"]),
    ],
  });
});

describe("GET /api/auth/members", () => {
  it("returns the full installation inventory to the owner", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authority: { members: Array<{ memberId: string }> };
    };
    expect(body.authority.members.map((entry) => entry.memberId)).toEqual([
      "a".repeat(32),
      "b".repeat(32),
    ]);
    expect(harness.requireAction).toHaveBeenCalledWith("members.read");
    expect(harness.administration).toHaveBeenCalledWith(harness.context.shop);
  });

  it("projects a manager inventory to the exact process shop", async () => {
    harness.context.actor.role = "manager";

    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authority: { revision: number; members: Array<{ memberId: string }> };
      currentActor: { role: string };
    };
    expect(body.authority.revision).toBe(4);
    expect(body.authority.members.map((entry) => entry.memberId)).toEqual([
      "a".repeat(32),
    ]);
    expect(body.currentActor.role).toBe("manager");
  });
});
