import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bindOwnerIdentitySession,
  resolveDurableIdentityActor,
  rotateIdentityAuthorityAuthentication,
} from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import { createMemberInvitation } from "../member-authority";
import {
  acceptTeamInvitation,
  acceptedInvitationIds,
  createTeamLoginSession,
  listTeamMembers,
  resolveTeamIdentityActor,
  teamDirectoryMarkerPath,
  teamDirectoryPath,
} from "../team-directory";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

const OTHER_SHOP: ShopContext = Object.freeze({
  ...SHOP,
  shopId: "other",
  shopIncarnationId: "5".repeat(32),
  databaseFileId: "other.db",
});

function configuredRoot(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SF_MASTER_KEY must be configured for identity tests");
  }
  return Buffer.from(value, "hex");
}

function cleanupTeam(): void {
  for (const path of [teamDirectoryPath(), teamDirectoryMarkerPath()]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions surface meaningful cleanup failures.
    }
  }
}

async function issueInvitation(options?: {
  role?: "manager" | "operator" | "viewer";
  permissions?: readonly ("shops.read" | "shops.switch")[] | null;
}) {
  await bindOwnerIdentitySession("owner-session", SHOP);
  return createMemberInvitation("owner-session", SHOP, {
    requestId: randomUUID(),
    role: options?.role ?? "operator",
    permissions: options?.permissions ?? null,
    shopIds: [SHOP.shopId],
    expiresInHours: 24,
  });
}

beforeEach(cleanupTeam);
afterEach(cleanupTeam);

describe("accepted team member directory", () => {
  it("creates exactly one person, member, device and recoverable session per token", async () => {
    const invitation = await issueInvitation();
    const input = {
      token: invitation.token!,
      requestId: "22222222-2222-4222-8222-222222222222",
      displayName: "Amina Operator",
      loginId: "amina.ops",
      pin: "12345678",
    };

    const first = await acceptTeamInvitation(input, SHOP);
    const replay = await acceptTeamInvitation(input, SHOP);
    const members = await listTeamMembers(SHOP);

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      sessionId: first.sessionId,
      actor: first.actor,
      replayed: true,
    });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      personId: first.actor.personId,
      memberId: first.actor.workspaceMemberId,
      deviceId: first.actor.deviceId,
      invitationId: invitation.invitation.id,
      displayName: "Amina Operator",
      loginId: "amina.ops",
      role: "operator",
      shopIds: [SHOP.shopId],
    });
    await expect(resolveTeamIdentityActor(first.sessionId, SHOP)).resolves.toEqual(
      first.actor,
    );
    expect(await acceptedInvitationIds(SHOP)).toContain(invitation.invitation.id);
  });

  it("rejects replay with changed profile or PIN", async () => {
    const invitation = await issueInvitation();
    const input = {
      token: invitation.token!,
      requestId: "22222222-2222-4222-8222-222222222222",
      displayName: "Amina",
      loginId: "amina.ops",
      pin: "12345678",
    };
    await acceptTeamInvitation(input, SHOP);

    await expect(
      acceptTeamInvitation({ ...input, displayName: "Other" }, SHOP),
    ).rejects.toMatchObject({
      code: "INVITATION_ACCEPTANCE_CONFLICT",
      statusCode: 409,
    });
    await expect(
      acceptTeamInvitation({ ...input, pin: "87654321" }, SHOP),
    ).rejects.toMatchObject({
      code: "INVITATION_ACCEPTANCE_CONFLICT",
      statusCode: 409,
    });
  });

  it("supports individual member login and rejects a wrong PIN", async () => {
    const invitation = await issueInvitation();
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "22222222-2222-4222-8222-222222222222",
        displayName: "Amina",
        loginId: "amina.ops",
        pin: "12345678",
      },
      SHOP,
    );

    await expect(
      createTeamLoginSession("amina.ops", "bad-pin-1", SHOP),
    ).resolves.toBeNull();
    const login = await createTeamLoginSession("AMINA.OPS", "12345678", SHOP);
    expect(login).toMatchObject({
      displayName: "Amina",
      loginId: "amina.ops",
      actor: accepted.actor,
      replayed: false,
    });
    expect(login?.sessionId).not.toBe(accepted.sessionId);
    await expect(
      resolveDurableIdentityActor(login!.sessionId, SHOP),
    ).resolves.toMatchObject({
      personId: accepted.actor.personId,
      workspaceMemberId: accepted.actor.workspaceMemberId,
      role: "operator",
    });
  });

  it("preserves role-bounded custom permissions", async () => {
    const invitation = await issueInvitation({
      role: "operator",
      permissions: ["shops.read"],
    });
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "22222222-2222-4222-8222-222222222222",
        displayName: "Read Only Operator",
        loginId: "read.operator",
        pin: "12345678",
      },
      SHOP,
    );

    expect(accepted.actor).toMatchObject({
      role: "operator",
      permissions: ["shops.read"],
    });
  });

  it("denies a member outside the invitation shop grant", async () => {
    const invitation = await issueInvitation();
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "22222222-2222-4222-8222-222222222222",
        displayName: "Amina",
        loginId: "amina.ops",
        pin: "12345678",
      },
      SHOP,
    );

    await expect(
      resolveTeamIdentityActor(accepted.sessionId, OTHER_SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_SHOP_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("rotates accepted member credentials and sessions with the installation root", async () => {
    const invitation = await issueInvitation();
    const accepted = await acceptTeamInvitation(
      {
        token: invitation.token!,
        requestId: "22222222-2222-4222-8222-222222222222",
        displayName: "Amina",
        loginId: "amina.ops",
        pin: "12345678",
      },
      SHOP,
    );
    const oldKey = configuredRoot();
    const newKey = Buffer.alloc(32, 0x73);
    try {
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey, true),
      ).toMatchObject({ state: "verified" });
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey),
      ).toMatchObject({ state: "reauthenticated" });
      expect(
        rotateIdentityAuthorityAuthentication(newKey, oldKey),
      ).toMatchObject({ state: "reauthenticated" });
      await expect(
        resolveTeamIdentityActor(accepted.sessionId, SHOP),
      ).resolves.toMatchObject({ personId: accepted.actor.personId });
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });
});
