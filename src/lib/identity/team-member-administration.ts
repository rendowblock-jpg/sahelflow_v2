import "server-only";

import { db } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { getIdentityAdministrationSnapshot } from "./control-authority";
import {
  changeOwnTeamMemberPin,
  resetTeamMemberPin,
  updateTeamMemberAccess,
  type TeamMemberAccess,
  type TeamMemberDirectoryChange,
} from "./team-directory";
import { assertTeamMemberActive } from "./team-revocation-authority";

export type TeamMemberAdministrationResult = Readonly<{
  memberId: string;
  changed: boolean;
  endedSessions: number;
}>;

let commandQueue: Promise<void> = Promise.resolve();

async function withCommandQueue<T>(work: () => Promise<T>): Promise<T> {
  const previous = commandQueue;
  let release!: () => void;
  commandQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function requireFreshOwner(
  currentOwnerSessionId: string,
  shop: ShopContext,
): Promise<void> {
  const owner = await getIdentityAdministrationSnapshot(
    currentOwnerSessionId,
    shop,
  );
  if (owner.currentActor.role !== "owner") {
    throw new SahelFlowError(
      "Only the workspace owner may administer team members",
      "ACTION_FORBIDDEN",
      403,
    );
  }
}

/**
 * Close the database sessions the directory change ended and record the
 * audit fact in one transaction. The directory already denies those sessions,
 * so a failure here never restores access; retrying is safe.
 */
async function commitSessionEnd(input: {
  change: TeamMemberDirectoryChange;
  action: string;
  auditActor: string;
  before?: unknown;
}): Promise<number> {
  const ended = [...input.change.endedSessionIds];
  try {
    return await db.$transaction(async (tx) => {
      const claim = ended.length
        ? await tx.session.updateMany({
            where: { id: { in: ended }, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await tx.auditLog.create({
        data: {
          action: input.action,
          entity: "workspace_member",
          entityId: input.change.member.memberId,
          actor: input.auditActor,
          before: input.before === undefined ? null : JSON.stringify(input.before),
          after: JSON.stringify({
            role: input.change.member.role,
            permissions: input.change.member.permissions,
            shopIds: input.change.member.shopIds,
          }),
          metadata: JSON.stringify({ endedSessionIds: ended }),
        },
      });
      return claim.count;
    });
  } catch {
    throw new SahelFlowError(
      "The change is saved, but its sign-out record could not be written. Retry.",
      "MEMBER_ADMINISTRATION_PERSISTENCE_FAILED",
      503,
    );
  }
}

/** Owner changes a member's role, permissions and shops; their sessions end. */
export async function updateAdministrativeTeamMemberAccess(input: {
  currentOwnerSessionId: string;
  targetMemberId: string;
  access: TeamMemberAccess;
  before: unknown;
  shop: ShopContext;
  auditActor: string;
}): Promise<TeamMemberAdministrationResult> {
  return withCommandQueue(async () => {
    await requireFreshOwner(input.currentOwnerSessionId, input.shop);
    await assertTeamMemberActive(input.targetMemberId, input.shop);
    const change = await updateTeamMemberAccess(
      { memberId: input.targetMemberId, access: input.access },
      input.shop,
    );
    const endedSessions = change.changed
      ? await commitSessionEnd({
          change,
          action: "team.member.access_changed",
          auditActor: input.auditActor,
          before: input.before,
        })
      : 0;
    return Object.freeze({
      memberId: change.member.memberId,
      changed: change.changed,
      endedSessions,
    });
  });
}

/** Owner sets a new PIN for a member who forgot theirs; their sessions end. */
export async function resetAdministrativeTeamMemberPin(input: {
  currentOwnerSessionId: string;
  targetMemberId: string;
  newPin: string;
  shop: ShopContext;
  auditActor: string;
}): Promise<TeamMemberAdministrationResult> {
  return withCommandQueue(async () => {
    await requireFreshOwner(input.currentOwnerSessionId, input.shop);
    await assertTeamMemberActive(input.targetMemberId, input.shop);
    const change = await resetTeamMemberPin(
      { memberId: input.targetMemberId, newPin: input.newPin },
      input.shop,
    );
    const endedSessions = await commitSessionEnd({
      change,
      action: "team.member.pin_reset",
      auditActor: input.auditActor,
    });
    return Object.freeze({
      memberId: change.member.memberId,
      changed: true,
      endedSessions,
    });
  });
}

/**
 * A member changes their own PIN. Null when the current PIN is wrong. Their
 * other sessions end; the one making the change continues.
 */
export async function changeOwnTeamPin(input: {
  sessionId: string;
  currentPin: string;
  newPin: string;
  shop: ShopContext;
  auditActor: string;
}): Promise<TeamMemberAdministrationResult | null> {
  const change = await changeOwnTeamMemberPin(input, input.shop);
  if (!change) return null;
  const endedSessions = await commitSessionEnd({
    change,
    action: "team.member.pin_changed",
    auditActor: input.auditActor,
  });
  return Object.freeze({
    memberId: change.member.memberId,
    changed: true,
    endedSessions,
  });
}
