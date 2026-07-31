import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
  rotateIdentityAuthorityAuthentication,
} from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import {
  createMemberInvitation,
  listMemberInvitations,
  memberAuthorityMarkerPath,
  memberAuthorityPath,
} from "../member-authority";
import {
  acceptTeamInvitation,
  teamDirectoryMarkerPath,
  teamDirectoryPath,
} from "../team-directory";
import {
  registerTeamSessionAuthority,
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

function rootKey(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SF_MASTER_KEY must be configured for identity tests");
  }
  return Buffer.from(value, "hex");
}

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

beforeEach(cleanup);
afterEach(cleanup);

describe("public installation identity authority", () => {
  it("re-authenticates core, invitation, member and revocation files together", async () => {
    await bindOwnerIdentitySession("session-owner", SHOP);
    const invitation = await createMemberInvitation("session-owner", SHOP, {
      requestId: "11111111-1111-4111-8111-111111111111",
      role: "operator",
      permissions: null,
      shopIds: [SHOP.shopId],
      expiresInHours: 24,
    });
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "33333333-3333-4333-8333-333333333333",
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

    const oldKey = rootKey();
    const newKey = Buffer.alloc(32, 0x71);
    try {
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey, true),
      ).toMatchObject({ state: "verified" });
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey),
      ).toMatchObject({ state: "reauthenticated" });
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey),
      ).toMatchObject({ state: "already-new" });

      expect(
        rotateIdentityAuthorityAuthentication(newKey, oldKey),
      ).toMatchObject({ state: "reauthenticated" });
      await expect(
        listMemberInvitations("session-owner", SHOP),
      ).resolves.toMatchObject({
        invitations: [{ role: "operator", state: "pending" }],
      });
      await expect(
        resolveDurableIdentityActor(accepted.sessionId, SHOP),
      ).resolves.toMatchObject({
        personId: accepted.actor.personId,
        workspaceMemberId: accepted.actor.workspaceMemberId,
      });
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });

  it("rejects a member authority orphan before rewriting it", async () => {
    await bindOwnerIdentitySession("session-owner", SHOP);
    await createMemberInvitation("session-owner", SHOP, {
      requestId: "22222222-2222-4222-8222-222222222222",
      role: "viewer",
      permissions: null,
      shopIds: [SHOP.shopId],
      expiresInHours: 24,
    });
    unlinkSync(identityAuthorityPath());
    unlinkSync(identityAuthorityMarkerPath());

    const oldKey = rootKey();
    const newKey = Buffer.alloc(32, 0x72);
    try {
      expect(() => rotateIdentityAuthorityAuthentication(oldKey, newKey)).toThrow(
        expect.objectContaining({
          code: "MEMBER_AUTHORITY_ORPHANED",
          statusCode: 503,
        }),
      );
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });

  it("rejects revocation authority without the accepted-member directory", async () => {
    await bindOwnerIdentitySession("session-owner", SHOP);
    const invitation = await createMemberInvitation("session-owner", SHOP, {
      requestId: "44444444-4444-4444-8444-444444444444",
      role: "operator",
      permissions: null,
      shopIds: [SHOP.shopId],
      expiresInHours: 24,
    });
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "55555555-5555-4555-8555-555555555555",
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
    unlinkSync(teamDirectoryPath());
    unlinkSync(teamDirectoryMarkerPath());

    const oldKey = rootKey();
    const newKey = Buffer.alloc(32, 0x74);
    try {
      expect(() => rotateIdentityAuthorityAuthentication(oldKey, newKey)).toThrow(
        expect.objectContaining({
          code: "TEAM_REVOCATION_ORPHANED",
          statusCode: 503,
        }),
      );
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });
});
