import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dbRaw } from "@/lib/db";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
} from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import {
  getTeamAdministrationView,
  revokeAdministrativeTeamMember,
} from "../team-administration";
import { createActiveTeamLoginSession } from "../team-credentials";
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

function cleanupAuthority(): void {
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
      // Focused assertions surface meaningful cleanup failures.
    }
  }
}

async function createMemberWithTwoSessions() {
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
  const now = new Date();
  await dbRaw.session.create({
    data: {
      id: accepted.sessionId,
      issuedAt: now,
      lastSeenAt: now,
    },
  });

  const login = await createActiveTeamLoginSession(
    "amina.ops",
    "12345678",
    SHOP,
  );
  if (!login) throw new Error("Expected member login grant");
  await registerTeamSessionAuthority({
    sessionId: login.sessionId,
    actor: login.actor,
    shop: SHOP,
  });
  await dbRaw.session.create({
    data: {
      id: login.sessionId,
      issuedAt: now,
      lastSeenAt: now,
    },
  });

  return {
    actor: accepted.actor,
    sessionIds: [accepted.sessionId, login.sessionId] as const,
  };
}

beforeEach(async () => {
  cleanupAuthority();
  await dbRaw.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS team_test_block_session_revoke",
  );
  await dbRaw.auditLog.deleteMany();
  await dbRaw.session.deleteMany();
});

afterEach(async () => {
  await dbRaw.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS team_test_block_session_revoke",
  );
  await dbRaw.auditLog.deleteMany();
  await dbRaw.session.deleteMany();
  cleanupAuthority();
});

describe("team member administration", () => {
  it("lists exact control and database session states", async () => {
    const created = await createMemberWithTwoSessions();

    const view = await getTeamAdministrationView(SHOP);

    expect(view.members).toHaveLength(1);
    expect(view.members[0]).toMatchObject({
      memberId: created.actor.workspaceMemberId,
      personId: created.actor.personId,
      deviceId: created.actor.deviceId,
      displayName: "Amina",
      loginId: "amina.ops",
      role: "operator",
      revokedAt: null,
    });
    expect(view.members[0]?.sessions).toHaveLength(2);
    expect(view.members[0]?.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ databaseState: "active" }),
        expect.objectContaining({ databaseState: "active" }),
      ]),
    );
  });

  it("denies the member immediately and revokes every indexed database session", async () => {
    const created = await createMemberWithTwoSessions();

    const result = await revokeAdministrativeTeamMember({
      currentOwnerSessionId: "owner-session",
      targetMemberId: created.actor.workspaceMemberId,
      shop: SHOP,
      auditActor: "person:owner",
    });

    expect(result).toMatchObject({
      state: "revoked",
      memberId: created.actor.workspaceMemberId,
      databaseState: "revoked",
      changedSessions: 2,
    });
    expect(result.sessionIds).toEqual(expect.arrayContaining(created.sessionIds));
    await expect(
      resolveDurableIdentityActor(created.sessionIds[0], SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_MEMBER_REVOKED",
      statusCode: 401,
    });
    await expect(
      createActiveTeamLoginSession("amina.ops", "12345678", SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_MEMBER_REVOKED",
      statusCode: 401,
    });
    expect(
      await dbRaw.session.count({
        where: {
          id: { in: [...created.sessionIds] },
          revokedAt: { not: null },
        },
      }),
    ).toBe(2);
    expect(
      await dbRaw.auditLog.count({
        where: {
          action: "team.member.revoked",
          entityId: created.actor.workspaceMemberId,
        },
      }),
    ).toBe(1);
  });

  it("keeps access denied when database evidence fails and completes on retry", async () => {
    const created = await createMemberWithTwoSessions();
    await dbRaw.$executeRawUnsafe(`
      CREATE TRIGGER team_test_block_session_revoke
      BEFORE UPDATE OF revokedAt ON Session
      BEGIN
        SELECT RAISE(ABORT, 'database unavailable');
      END
    `);

    await expect(
      revokeAdministrativeTeamMember({
        currentOwnerSessionId: "owner-session",
        targetMemberId: created.actor.workspaceMemberId,
        shop: SHOP,
        auditActor: "person:owner",
      }),
    ).rejects.toMatchObject({
      code: "MEMBER_REVOCATION_PERSISTENCE_FAILED",
      statusCode: 503,
    });
    await expect(
      resolveDurableIdentityActor(created.sessionIds[0], SHOP),
    ).rejects.toMatchObject({ code: "IDENTITY_MEMBER_REVOKED" });
    expect(
      await dbRaw.session.count({
        where: {
          id: { in: [...created.sessionIds] },
          revokedAt: { not: null },
        },
      }),
    ).toBe(0);

    await dbRaw.$executeRawUnsafe(
      "DROP TRIGGER IF EXISTS team_test_block_session_revoke",
    );
    const retry = await revokeAdministrativeTeamMember({
      currentOwnerSessionId: "owner-session",
      targetMemberId: created.actor.workspaceMemberId,
      shop: SHOP,
      auditActor: "person:owner",
    });

    expect(retry).toMatchObject({
      state: "already-revoked",
      databaseState: "revoked",
      changedSessions: 2,
    });
    expect(
      await dbRaw.session.count({
        where: {
          id: { in: [...created.sessionIds] },
          revokedAt: { not: null },
        },
      }),
    ).toBe(2);
  });
});
