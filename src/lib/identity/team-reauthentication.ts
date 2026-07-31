import "server-only";

import { resolveDurableIdentityActor } from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import { createActiveTeamLoginSession } from "./team-credentials";
import {
  listTeamMembers,
  type TeamSessionGrant,
} from "./team-directory";

export type TeamReauthenticationAttempt =
  | Readonly<{ subject: "owner" }>
  | Readonly<{ subject: "team"; grant: TeamSessionGrant | null }>;

/**
 * Identify the current durable subject before validating a PIN.
 *
 * A known team session is always handled as that exact active member. Invalid
 * member PIN proof returns a team failure and must never fall through to owner
 * PIN verification. Core-owner sessions return the owner branch unchanged.
 */
export async function prepareTeamReauthentication(
  currentSessionId: string,
  pin: string,
  shop: ShopContext,
): Promise<TeamReauthenticationAttempt> {
  const actor = await resolveDurableIdentityActor(currentSessionId, shop);
  if (!actor) return Object.freeze({ subject: "owner" });

  const members = await listTeamMembers(shop);
  const member = members.find(
    (candidate) => candidate.memberId === actor.workspaceMemberId,
  );
  if (!member) return Object.freeze({ subject: "owner" });

  const grant = await createActiveTeamLoginSession(member.loginId, pin, shop);
  return Object.freeze({ subject: "team", grant });
}
