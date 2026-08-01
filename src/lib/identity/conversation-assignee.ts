import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { PersonActor } from "./trusted-actor";
import { listTeamMembers } from "./team-directory";
import { assertTeamMemberActive } from "./team-revocation-authority";

const MEMBER_ID = /^[0-9a-f]{32}$/i;

export type ConversationAssignee = Readonly<{
  personId: string;
  memberId: string;
  displayName: string | null;
  role: "owner" | "manager" | "operator";
}>;

function unavailable(): SahelFlowError {
  return new SahelFlowError(
    "The selected assignee is unavailable for this shop",
    "CONVERSATION_ASSIGNEE_UNAVAILABLE",
    409,
  );
}

/**
 * Resolve one exact active assignee from installation identity authority.
 *
 * The sole core owner is not duplicated in the accepted-member directory, so
 * owner self-assignment is resolved from the current trusted actor. Every other
 * target must be an active manager/operator with an exact grant for the process
 * shop. Viewers can read collaboration state but cannot receive operational work.
 */
export async function resolveConversationAssignee(
  currentActor: PersonActor,
  targetMemberId: string,
  shop: ShopContext,
): Promise<ConversationAssignee> {
  const memberId = targetMemberId.trim();
  if (!MEMBER_ID.test(memberId)) throw unavailable();

  if (
    memberId === currentActor.workspaceMemberId &&
    currentActor.role === "owner"
  ) {
    return Object.freeze({
      personId: currentActor.personId,
      memberId,
      displayName: null,
      role: "owner" as const,
    });
  }

  const member = (await listTeamMembers(shop)).find(
    (candidate) => candidate.memberId === memberId,
  );
  if (
    !member ||
    member.revokedAt !== null ||
    member.role === "viewer" ||
    !member.shopIds.includes(shop.shopId)
  ) {
    throw unavailable();
  }

  try {
    await assertTeamMemberActive(member.memberId, shop);
  } catch (error) {
    if (
      error instanceof SahelFlowError &&
      error.code === "IDENTITY_MEMBER_REVOKED"
    ) {
      throw unavailable();
    }
    throw error;
  }

  return Object.freeze({
    personId: member.personId,
    memberId: member.memberId,
    displayName: member.displayName,
    role: member.role,
  });
}
