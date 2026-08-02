import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
} from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import {
  acceptTeamInvitation,
  teamDirectoryMarkerPath,
  teamDirectoryPath,
} from "../team-directory";
import {
  createMemberInvitation,
  memberAuthorityMarkerPath,
  memberAuthorityPath,
} from "../member-authority";
import {
  registerTeamSessionAuthority,
  revokeTeamMemberAuthority,
  teamRevocationAuthorityPath,
  teamRevocationMarkerPath,
} from "../team-revocation-authority";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

function cleanup(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    memberAuthorityPath(),
    memberAuthorityMarkerPath(),
    teamDirectoryPath(),
    teamDirectoryMarkerPath(),
    teamRevocationAuthorityPath(),
    teamRevocationMarkerPath(),
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions expose meaningful cleanup failures.
    }
  }
}

async function createRegisteredMember() {
  await bindOwnerIdentitySession("owner-session", SHOP);
  const invitation = await createMemberInvitation("owner-session", SHOP, {
    requestId: randomUUID(),
    role: "operator",
    permissions: null,
    shopIds: [SHOP.shopId],
    expiresInHours: 24,
  });
  const accepted = await acceptTeamInvitation(
    {
      token: invitation.token!,
      requestId: randomUUID(),
      displayName: "Amina",
      loginId: "amina.ops",
      pin: "12345678",
    },
    SHOP,
  );
  await registerTeamSessionAuthority({
    sessionId: accepted.sessionId,
    actor: accepted.actor,
    shop: SHOP,
  });
  return accepted;
}

beforeEach(cleanup);
afterEach(cleanup);

describe("team revocation authority", () => {
  it("serializes duplicate concurrent member revocation", async () => {
    const accepted = await createRegisteredMember();

    const [first, second] = await Promise.all([
      revokeTeamMemberAuthority({
        currentOwnerSessionId: "owner-session",
        targetMemberId: accepted.actor.workspaceMemberId,
        shop: SHOP,
      }),
      revokeTeamMemberAuthority({
        currentOwnerSessionId: "owner-session",
        targetMemberId: accepted.actor.workspaceMemberId,
        shop: SHOP,
      }),
    ]);

    expect(new Set([first.state, second.state])).toEqual(
      new Set(["revoked", "already-revoked"]),
    );
    expect(first.memberId).toBe(second.memberId);
    expect(first.revokedAt).toBe(second.revokedAt);
    expect(first.sessionIds).toContain(accepted.sessionId);
    expect(second.sessionIds).toContain(accepted.sessionId);
  });

  it("denies current authority and every future session after revocation", async () => {
    const accepted = await createRegisteredMember();
    await revokeTeamMemberAuthority({
      currentOwnerSessionId: "owner-session",
      targetMemberId: accepted.actor.workspaceMemberId,
      shop: SHOP,
    });

    await expect(
      resolveDurableIdentityActor(accepted.sessionId, SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_MEMBER_REVOKED",
      statusCode: 401,
    });
    await expect(
      registerTeamSessionAuthority({
        sessionId: "future-session",
        actor: accepted.actor,
        shop: SHOP,
      }),
    ).rejects.toMatchObject({
      code: "IDENTITY_MEMBER_REVOKED",
      statusCode: 401,
    });
  });
});
