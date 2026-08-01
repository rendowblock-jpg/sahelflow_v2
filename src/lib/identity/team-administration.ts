import "server-only";

import { db } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  listTeamMembers,
  type TeamDirectoryMemberView,
} from "./team-directory";
import { revokeFreshOwnerTeamMemberAuthority } from "./team-revocation-command";
import { getTeamRevocationSnapshot } from "./team-revocation-authority";

export type AdministrativeTeamSession = Readonly<{
  sessionId: string;
  registeredAt: string;
  controlRevokedAt: string | null;
  databaseIssuedAt: string | null;
  databaseLastSeenAt: string | null;
  databaseRevokedAt: string | null;
  databaseState: "active" | "revoked" | "missing";
}>;

export type AdministrativeTeamMember = Readonly<{
  personId: string;
  memberId: string;
  deviceId: string;
  invitationId: string;
  displayName: string;
  loginId: string;
  role: TeamDirectoryMemberView["role"];
  permissions: TeamDirectoryMemberView["permissions"];
  shopIds: TeamDirectoryMemberView["shopIds"];
  policyVersion: number;
  revocationEpoch: number;
  createdAt: string;
  revokedAt: string | null;
  sessions: readonly AdministrativeTeamSession[];
}>;

export type TeamAdministrationView = Readonly<{
  revision: number;
  members: readonly AdministrativeTeamMember[];
}>;

export type RevokeAdministrativeTeamMemberResult = Readonly<{
  state: "revoked" | "already-revoked";
  memberId: string;
  personId: string;
  deviceId: string;
  revokedAt: string;
  authorityRevision: number;
  sessionIds: readonly string[];
  databaseState: "revoked" | "already-revoked" | "missing";
  changedSessions: number;
}>;

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Return accepted members and their exact control/database session state. */
export async function getTeamAdministrationView(
  shop: ShopContext,
): Promise<TeamAdministrationView> {
  const [members, authority] = await Promise.all([
    listTeamMembers(shop),
    getTeamRevocationSnapshot(shop),
  ]);
  const sessionIds = authority.sessions.map((session) => session.sessionId);
  const databaseSessions = sessionIds.length
    ? await db.session.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          issuedAt: true,
          lastSeenAt: true,
          revokedAt: true,
        },
      })
    : [];
  const databaseById = new Map(
    databaseSessions.map((session) => [session.id, session] as const),
  );
  const revokedByMember = new Map(
    authority.memberRevocations.map((entry) => [entry.memberId, entry] as const),
  );

  const output = members
    .map((member): AdministrativeTeamMember => {
      const memberRevocation = revokedByMember.get(member.memberId);
      const sessions = authority.sessions
        .filter((session) => session.memberId === member.memberId)
        .map((session): AdministrativeTeamSession => {
          const database = databaseById.get(session.sessionId);
          const controlRevokedAt =
            session.revokedAt ?? memberRevocation?.revokedAt ?? null;
          const databaseState = !database
            ? "missing"
            : database.revokedAt || controlRevokedAt
              ? "revoked"
              : "active";
          return Object.freeze({
            sessionId: session.sessionId,
            registeredAt: session.registeredAt,
            controlRevokedAt,
            databaseIssuedAt: toIso(database?.issuedAt),
            databaseLastSeenAt: toIso(database?.lastSeenAt),
            databaseRevokedAt: toIso(database?.revokedAt),
            databaseState,
          });
        })
        .sort((left, right) =>
          left.registeredAt > right.registeredAt
            ? -1
            : left.registeredAt < right.registeredAt
              ? 1
              : 0,
        );

      return Object.freeze({
        personId: member.personId,
        memberId: member.memberId,
        deviceId: member.deviceId,
        invitationId: member.invitationId,
        displayName: member.displayName,
        loginId: member.loginId,
        role: member.role,
        permissions: member.permissions,
        shopIds: member.shopIds,
        policyVersion: member.policyVersion,
        revocationEpoch: member.revocationEpoch,
        createdAt: member.createdAt,
        revokedAt: memberRevocation?.revokedAt ?? member.revokedAt,
        sessions: Object.freeze(sessions),
      });
    })
    .sort((left, right) =>
      left.createdAt < right.createdAt
        ? -1
        : left.createdAt > right.createdAt
          ? 1
          : 0,
    );

  return Object.freeze({
    revision: authority.revision,
    members: Object.freeze(output),
  });
}

/**
 * Revoke one accepted member using control-first ordering.
 *
 * Durable installation authority denies the member and every registered session
 * before SQLite is touched. Database session revocation and the audit fact then
 * commit atomically. If that transaction fails, retrying is safe: control
 * revocation is idempotent and access never becomes valid again.
 */
export async function revokeAdministrativeTeamMember(input: {
  currentOwnerSessionId: string;
  targetMemberId: string;
  shop: ShopContext;
  auditActor: string;
}): Promise<RevokeAdministrativeTeamMemberResult> {
  const control = await revokeFreshOwnerTeamMemberAuthority({
    currentOwnerSessionId: input.currentOwnerSessionId,
    targetMemberId: input.targetMemberId,
    shop: input.shop,
  });
  const revokedAt = new Date(control.revokedAt);
  if (!Number.isFinite(revokedAt.getTime())) {
    throw new SahelFlowError(
      "The durable member revocation timestamp is invalid",
      "TEAM_REVOCATION_AUTHORITY_UNAVAILABLE",
      503,
    );
  }

  let databaseState: RevokeAdministrativeTeamMemberResult["databaseState"];
  let changedSessions = 0;
  try {
    const databaseResult = await db.$transaction(async (tx) => {
      const existing = control.sessionIds.length
        ? await tx.session.findMany({
            where: { id: { in: [...control.sessionIds] } },
            select: { id: true, revokedAt: true },
          })
        : [];
      const existingById = new Map(
        existing.map((session) => [session.id, session] as const),
      );
      const present = control.sessionIds.filter((id) => existingById.has(id));
      const alreadyRevoked = present.filter(
        (id) => existingById.get(id)?.revokedAt,
      );
      const claim = present.length
        ? await tx.session.updateMany({
            where: {
              id: { in: present },
              revokedAt: null,
            },
            data: { revokedAt },
          })
        : { count: 0 };

      const state: RevokeAdministrativeTeamMemberResult["databaseState"] =
        present.length === 0
          ? "missing"
          : claim.count === 0 && alreadyRevoked.length === present.length
            ? "already-revoked"
            : "revoked";

      await tx.auditLog.create({
        data: {
          action: "team.member.revoked",
          entity: "workspace_member",
          entityId: control.memberId,
          actor: input.auditActor,
          before: JSON.stringify({
            databaseSessions: existing.map((session) => ({
              id: session.id,
              revokedAt: session.revokedAt?.toISOString() ?? null,
            })),
          }),
          after: JSON.stringify({
            controlRevokedAt: control.revokedAt,
            databaseState: state,
            changedSessions: claim.count,
          }),
          metadata: JSON.stringify({
            authorityRevision: control.revision,
            controlState: control.state,
            personId: control.personId,
            deviceId: control.deviceId,
            sessionIds: control.sessionIds,
          }),
        },
      });

      return { state, changedSessions: claim.count };
    });
    databaseState = databaseResult.state;
    changedSessions = databaseResult.changedSessions;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "Member access is denied by durable installation authority, but database revocation evidence could not be committed. Retry this revocation.",
      "MEMBER_REVOCATION_PERSISTENCE_FAILED",
      503,
    );
  }

  return Object.freeze({
    state: control.state,
    memberId: control.memberId,
    personId: control.personId,
    deviceId: control.deviceId,
    revokedAt: control.revokedAt,
    authorityRevision: control.revision,
    sessionIds: control.sessionIds,
    databaseState,
    changedSessions,
  });
}
