import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  listTeamMembers: vi.fn(),
  getTeamRevocationSnapshot: vi.fn(),
}));

vi.mock("@/lib/identity/team-directory", () => ({
  listTeamMembers: harness.listTeamMembers,
}));

vi.mock("@/lib/identity/team-revocation-authority", () => ({
  assertTeamMemberActive: vi.fn(),
  getTeamRevocationSnapshot: harness.getTeamRevocationSnapshot,
}));

import { listCollaborationMembers } from "@/lib/identity/collaboration-member";
import type { ShopContext } from "@/lib/shops/context";
import type { PersonActor } from "@/lib/identity/trusted-actor";

const SHOP = {
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
} as ShopContext;

const OWNER = {
  kind: "person",
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  sessionId: "session-owner",
  role: "owner",
  policyVersion: 1,
  revocationEpoch: 0,
} as PersonActor;

beforeEach(() => {
  harness.listTeamMembers.mockReset().mockResolvedValue([
    {
      personId: "8".repeat(32),
      memberId: "9".repeat(32),
      displayName: "Amina",
      role: "operator",
      shopIds: ["shop-a"],
      revokedAt: null,
    },
    {
      personId: "a".repeat(32),
      memberId: "b".repeat(32),
      displayName: "Other shop",
      role: "manager",
      shopIds: ["shop-b"],
      revokedAt: null,
    },
    {
      personId: "c".repeat(32),
      memberId: "d".repeat(32),
      displayName: "Revoked",
      role: "operator",
      shopIds: ["shop-a"],
      revokedAt: null,
    },
    {
      personId: "e".repeat(32),
      memberId: "f".repeat(32),
      displayName: "Viewer",
      role: "viewer",
      shopIds: ["shop-a"],
      revokedAt: null,
    },
  ]);
  harness.getTeamRevocationSnapshot.mockReset().mockResolvedValue({
    memberRevocations: [{ memberId: "d".repeat(32) }],
  });
});

describe("collaboration member options", () => {
  it("returns only current-shop, non-revoked targets and restores the core owner", async () => {
    const members = await listCollaborationMembers(OWNER, SHOP, {
      allowViewer: true,
    });

    expect(members.map((member) => member.memberId)).toEqual([
      OWNER.workspaceMemberId,
      "9".repeat(32),
      "f".repeat(32),
    ]);
  });

  it("removes viewers when the calling workflow cannot target them", async () => {
    const members = await listCollaborationMembers(OWNER, SHOP, {
      allowViewer: false,
    });

    expect(members.map((member) => member.memberId)).toEqual([
      OWNER.workspaceMemberId,
      "9".repeat(32),
    ]);
  });
});
