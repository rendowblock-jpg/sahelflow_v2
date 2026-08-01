import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { PersonActor } from "../trusted-actor";

const harness = vi.hoisted(() => ({
  listMembers: vi.fn(),
  assertActive: vi.fn(),
}));

vi.mock("../team-directory", () => ({
  listTeamMembers: harness.listMembers,
}));

vi.mock("../team-revocation-authority", () => ({
  assertTeamMemberActive: harness.assertActive,
}));

import { resolveConversationAssignee } from "../conversation-assignee";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

const OWNER: PersonActor = Object.freeze({
  kind: "person",
  personId: "5".repeat(32),
  workspaceMemberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  sessionId: "owner-session",
  role: "owner",
  policyVersion: 1,
  revocationEpoch: 0,
});

const MEMBER = Object.freeze({
  personId: "8".repeat(32),
  memberId: "9".repeat(32),
  deviceId: "a".repeat(32),
  invitationId: "b".repeat(32),
  displayName: "Amina",
  loginId: "amina.ops",
  role: "operator" as const,
  permissions: null,
  shopIds: [SHOP.shopId],
  policyVersion: 1,
  revocationEpoch: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  revokedAt: null,
});

beforeEach(() => {
  harness.listMembers.mockReset().mockResolvedValue([MEMBER]);
  harness.assertActive.mockReset().mockResolvedValue(undefined);
});

describe("resolveConversationAssignee", () => {
  it("resolves the sole core owner only for owner self-assignment", async () => {
    await expect(
      resolveConversationAssignee(OWNER, OWNER.workspaceMemberId, SHOP),
    ).resolves.toEqual({
      personId: OWNER.personId,
      memberId: OWNER.workspaceMemberId,
      displayName: null,
      role: "owner",
    });
    expect(harness.listMembers).not.toHaveBeenCalled();
    expect(harness.assertActive).not.toHaveBeenCalled();
  });

  it("resolves one active manager/operator in the exact shop", async () => {
    await expect(
      resolveConversationAssignee(OWNER, MEMBER.memberId, SHOP),
    ).resolves.toMatchObject({
      personId: MEMBER.personId,
      memberId: MEMBER.memberId,
      displayName: "Amina",
      role: "operator",
    });
    expect(harness.assertActive).toHaveBeenCalledWith(MEMBER.memberId, SHOP);
  });

  it.each([
    { ...MEMBER, role: "viewer" as const },
    { ...MEMBER, shopIds: ["shop-b"] },
    { ...MEMBER, revokedAt: "2026-08-01T01:00:00.000Z" },
  ])("rejects a viewer, wrong-shop or revoked target", async (candidate) => {
    harness.listMembers.mockResolvedValue([candidate]);

    await expect(
      resolveConversationAssignee(OWNER, MEMBER.memberId, SHOP),
    ).rejects.toMatchObject({
      code: "CONVERSATION_ASSIGNEE_UNAVAILABLE",
      statusCode: 409,
    });
    expect(harness.assertActive).not.toHaveBeenCalled();
  });

  it("normalizes a concurrently revoked target to unavailable", async () => {
    harness.assertActive.mockRejectedValue(
      new SahelFlowError(
        "Member revoked",
        "IDENTITY_MEMBER_REVOKED",
        401,
      ),
    );

    await expect(
      resolveConversationAssignee(OWNER, MEMBER.memberId, SHOP),
    ).rejects.toMatchObject({
      code: "CONVERSATION_ASSIGNEE_UNAVAILABLE",
      statusCode: 409,
    });
  });

  it("propagates corrupt revocation authority", async () => {
    const unavailable = new SahelFlowError(
      "Authority unavailable",
      "TEAM_REVOCATION_AUTHORITY_UNAVAILABLE",
      503,
    );
    harness.assertActive.mockRejectedValue(unavailable);

    await expect(
      resolveConversationAssignee(OWNER, MEMBER.memberId, SHOP),
    ).rejects.toBe(unavailable);
  });
});
