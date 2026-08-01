import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { listTeamMembers } from "./team-directory";
import { assertTeamMemberActive } from "./team-revocation-authority";
import type { PersonActor } from "./trusted-actor";

const MEMBER_ID = /^[0-9a-f]{32}$/i;

export type CollaborationMember = Readonly<{
  personId: string;
  memberId: string;
  displayName: string | null;
  role: "owner" | "manager" | "operator" | "viewer";
}>;

function unavailable(): SahelFlowError {
  return new SahelFlowError(
    "The selected member is unavailable for this shop",
    "COLLABORATION_MEMBER_UNAVAILABLE",
    409,
  );
}

export async function resolveCollaborationMember(
  currentActor: PersonActor,
  targetMemberId: string,
  shop: ShopContext,
  options: Readonly<{ allowViewer: boolean }> = { allowViewer: true },
): Promise<CollaborationMember> {
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
    (!options.allowViewer && member.role === "viewer") ||
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

export async function resolveCollaborationMembers(
  currentActor: PersonActor,
  targetMemberIds: readonly string[],
  shop: ShopContext,
  options: Readonly<{ allowViewer: boolean }> = { allowViewer: true },
): Promise<readonly CollaborationMember[]> {
  const unique = [...new Set(targetMemberIds.map((value) => value.trim()))].sort();
  const members = await Promise.all(
    unique.map((memberId) =>
      resolveCollaborationMember(currentActor, memberId, shop, options),
    ),
  );
  return Object.freeze(members);
}
