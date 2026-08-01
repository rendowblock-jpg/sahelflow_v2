import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

const harness = vi.hoisted(() => ({
  listMembers: vi.fn(),
  createSession: vi.fn(),
  assertActive: vi.fn(),
}));

vi.mock("../team-directory", () => ({
  listTeamMembers: harness.listMembers,
  createTeamLoginSession: harness.createSession,
}));

vi.mock("../team-revocation-authority", () => ({
  assertTeamMemberActive: harness.assertActive,
}));

import { createActiveTeamLoginSession } from "../team-credentials";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

const MEMBER = Object.freeze({
  personId: "5".repeat(32),
  memberId: "6".repeat(32),
  deviceId: "7".repeat(32),
  invitationId: "8".repeat(32),
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
  harness.createSession.mockReset().mockResolvedValue({
    sessionId: "member-session",
    actor: {
      personId: MEMBER.personId,
      workspaceMemberId: MEMBER.memberId,
      deviceId: MEMBER.deviceId,
      role: MEMBER.role,
      permissions: MEMBER.permissions,
      policyVersion: MEMBER.policyVersion,
      revocationEpoch: MEMBER.revocationEpoch,
    },
    displayName: MEMBER.displayName,
    loginId: MEMBER.loginId,
    invitationId: MEMBER.invitationId,
    replayed: false,
  });
});

describe("createActiveTeamLoginSession", () => {
  it("returns a generic credential miss for an unknown login", async () => {
    harness.listMembers.mockResolvedValue([]);

    await expect(
      createActiveTeamLoginSession("missing", "12345678", SHOP),
    ).resolves.toBeNull();
    expect(harness.assertActive).not.toHaveBeenCalled();
    expect(harness.createSession).not.toHaveBeenCalled();
  });

  it("returns a generic credential miss for a revoked member", async () => {
    harness.assertActive.mockRejectedValue(
      new SahelFlowError(
        "This member has been revoked",
        "IDENTITY_MEMBER_REVOKED",
        401,
      ),
    );

    await expect(
      createActiveTeamLoginSession("AMINA.OPS", "12345678", SHOP),
    ).resolves.toBeNull();
    expect(harness.assertActive).toHaveBeenCalledWith(MEMBER.memberId, SHOP);
    expect(harness.createSession).not.toHaveBeenCalled();
  });

  it("propagates corrupt or unavailable revocation authority", async () => {
    const unavailable = new SahelFlowError(
      "Team revocation authority authentication failed",
      "TEAM_REVOCATION_AUTHORITY_UNAVAILABLE",
      503,
    );
    harness.assertActive.mockRejectedValue(unavailable);

    await expect(
      createActiveTeamLoginSession("amina.ops", "12345678", SHOP),
    ).rejects.toBe(unavailable);
    expect(harness.createSession).not.toHaveBeenCalled();
  });

  it("creates a session only after active authority succeeds", async () => {
    const result = await createActiveTeamLoginSession(
      "AMINA.OPS",
      "12345678",
      SHOP,
    );

    expect(harness.assertActive).toHaveBeenCalledWith(MEMBER.memberId, SHOP);
    expect(harness.createSession).toHaveBeenCalledWith(
      "AMINA.OPS",
      "12345678",
      SHOP,
    );
    expect(result).toMatchObject({
      sessionId: "member-session",
      loginId: "amina.ops",
    });
  });
});
