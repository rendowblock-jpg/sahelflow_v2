import "server-only";

import { db } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  getIdentityAdministrationSnapshot,
  revokeIdentitySessionBinding,
  type IdentityAdministrationSnapshot,
} from "./control-authority";

export type AdministrativeSession = Readonly<{
  sessionId: string;
  personId: string;
  workspaceMemberId: string;
  deviceId: string;
  policyVersion: number;
  boundAt: string;
  controlRevokedAt: string | null;
  databaseIssuedAt: string | null;
  databaseLastSeenAt: string | null;
  databaseRevokedAt: string | null;
  databaseState: "active" | "revoked" | "missing";
  current: boolean;
}>;

export type IdentityAdministrationView = Readonly<{
  revision: number;
  workspace: IdentityAdministrationSnapshot["workspace"];
  installation: IdentityAdministrationSnapshot["installation"];
  currentActor: IdentityAdministrationSnapshot["currentActor"];
  member: IdentityAdministrationSnapshot["member"];
  devices: IdentityAdministrationSnapshot["devices"];
  sessions: readonly AdministrativeSession[];
}>;

export type RevokeAdministrativeSessionResult = Readonly<{
  state: "revoked" | "already-revoked";
  sessionId: string;
  deviceId: string;
  workspaceMemberId: string;
  revokedAt: string;
  authorityRevision: number;
  databaseState: "revoked" | "already-revoked" | "missing";
}>;

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Return one exact-installation identity/session inventory without exposing
 * signing secrets, PIN material, tokens or client IP addresses.
 */
export async function getIdentityAdministrationView(
  currentSessionId: string,
  shop: ShopContext,
): Promise<IdentityAdministrationView> {
  const authority = await getIdentityAdministrationSnapshot(
    currentSessionId,
    shop,
  );
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

  const sessions = authority.sessions
    .map((binding): AdministrativeSession => {
      const database = databaseById.get(binding.sessionId);
      const databaseState = !database
        ? "missing"
        : database.revokedAt || binding.revokedAt
          ? "revoked"
          : "active";
      return Object.freeze({
        sessionId: binding.sessionId,
        personId: binding.personId,
        workspaceMemberId: binding.workspaceMemberId,
        deviceId: binding.deviceId,
        policyVersion: binding.policyVersion,
        boundAt: binding.boundAt,
        controlRevokedAt: binding.revokedAt,
        databaseIssuedAt: toIso(database?.issuedAt),
        databaseLastSeenAt: toIso(database?.lastSeenAt),
        databaseRevokedAt: toIso(database?.revokedAt),
        databaseState,
        current: binding.current,
      });
    })
    .sort((left, right) =>
      left.boundAt > right.boundAt ? -1 : left.boundAt < right.boundAt ? 1 : 0,
    );

  return Object.freeze({
    revision: authority.revision,
    workspace: authority.workspace,
    installation: authority.installation,
    currentActor: authority.currentActor,
    member: authority.member,
    devices: authority.devices,
    sessions: Object.freeze(sessions),
  });
}

/**
 * Revoke another session using control-first ordering.
 *
 * The authenticated control binding is revoked under the installation lock
 * before the shop database is touched, so access is denied immediately. The
 * database revocation and durable audit fact then commit together. If that
 * transaction fails, retrying is safe: the control mutation is idempotent and
 * the database/audit evidence can catch up without restoring access.
 */
export async function revokeAdministrativeSession(input: {
  currentSessionId: string;
  targetSessionId: string;
  shop: ShopContext;
  auditActor: string;
}): Promise<RevokeAdministrativeSessionResult> {
  const control = await revokeIdentitySessionBinding(
    input.currentSessionId,
    input.targetSessionId,
    input.shop,
  );
  const revokedAt = new Date(control.revokedAt);
  if (!Number.isFinite(revokedAt.getTime())) {
    throw new SahelFlowError(
      "The durable session revocation timestamp is invalid",
      "IDENTITY_AUTHORITY_UNAVAILABLE",
      503,
    );
  }

  let databaseState: RevokeAdministrativeSessionResult["databaseState"];
  try {
    databaseState = await db.$transaction(async (tx) => {
      const existing = await tx.session.findUnique({
        where: { id: input.targetSessionId },
        select: { revokedAt: true },
      });

      let state: RevokeAdministrativeSessionResult["databaseState"];
      if (!existing) {
        state = "missing";
      } else if (existing.revokedAt) {
        state = "already-revoked";
      } else {
        const claimed = await tx.session.updateMany({
          where: { id: input.targetSessionId, revokedAt: null },
          data: { revokedAt },
        });
        if (claimed.count !== 1) {
          const concurrent = await tx.session.findUnique({
            where: { id: input.targetSessionId },
            select: { revokedAt: true },
          });
          if (!concurrent?.revokedAt) {
            throw new SahelFlowError(
              "The database session changed during revocation",
              "SESSION_REVOCATION_CONFLICT",
              409,
            );
          }
          state = "already-revoked";
        } else {
          state = "revoked";
        }
      }

      await tx.auditLog.create({
        data: {
          action: "auth.session.revoked",
          entity: "session",
          entityId: input.targetSessionId,
          actor: input.auditActor,
          before: JSON.stringify({
            databaseRevokedAt: existing?.revokedAt?.toISOString() ?? null,
          }),
          after: JSON.stringify({
            controlRevokedAt: control.revokedAt,
            databaseState: state,
          }),
          metadata: JSON.stringify({
            authorityRevision: control.revision,
            controlState: control.state,
            deviceId: control.deviceId,
            workspaceMemberId: control.workspaceMemberId,
          }),
        },
      });

      return state;
    });
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "Session access is denied by durable identity authority, but database revocation evidence could not be committed. Retry this revocation.",
      "SESSION_REVOCATION_PERSISTENCE_FAILED",
      503,
    );
  }

  return Object.freeze({
    state: control.state,
    sessionId: control.sessionId,
    deviceId: control.deviceId,
    workspaceMemberId: control.workspaceMemberId,
    revokedAt: control.revokedAt,
    authorityRevision: control.revision,
    databaseState,
  });
}
