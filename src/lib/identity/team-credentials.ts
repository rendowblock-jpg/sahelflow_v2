import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  createTeamLoginSession,
  listTeamMembers,
  teamMemberPinMatches,
  type TeamSessionGrant,
} from "./team-directory";
import { assertTeamMemberActive } from "./team-revocation-authority";

export type ActiveTeamLoginDecision =
  | { code: "granted"; grant: TeamSessionGrant }
  | { code: "invalid" }
  | { code: "shop_unavailable" };

/**
 * Validate a member's exact-shop and active control authority before generating
 * a session.
 *
 * Session registration still performs the final race-safe check. This preflight
 * prevents a revoked or wrong-shop public credential from creating orphan
 * directory sessions while never granting database/cookie authority.
 *
 * A wrong PIN stays indistinguishable from an unknown login. A correct PIN
 * whose grant does not include this shop is `shop_unavailable` — that only
 * tells the holder of the PIN that this shop is closed to them. Revoked
 * members and corrupt authority stay on their existing paths. Authentication
 * failures caused by corrupt, mismatched or unavailable authority remain hard
 * failures and are never hidden.
 */
export async function decideActiveTeamLogin(
  loginId: string,
  pin: string,
  shop: ShopContext,
): Promise<ActiveTeamLoginDecision> {
  const member = (await listTeamMembers(shop)).find(
    (candidate) => candidate.loginId === loginId.trim().toLowerCase(),
  );
  if (!member || member.revokedAt) return { code: "invalid" };
  if (!member.shopIds.includes(shop.shopId)) {
    const pinMatches = await teamMemberPinMatches(loginId, pin, shop);
    return pinMatches ? { code: "shop_unavailable" } : { code: "invalid" };
  }

  try {
    await assertTeamMemberActive(member.memberId, shop);
  } catch (error) {
    if (
      error instanceof SahelFlowError &&
      error.code === "IDENTITY_MEMBER_REVOKED"
    ) {
      return { code: "invalid" };
    }
    throw error;
  }

  const grant = await createTeamLoginSession(loginId, pin, shop);
  return grant ? { code: "granted", grant } : { code: "invalid" };
}

export async function createActiveTeamLoginSession(
  loginId: string,
  pin: string,
  shop: ShopContext,
): Promise<TeamSessionGrant | null> {
  const decision = await decideActiveTeamLogin(loginId, pin, shop);
  return decision.code === "granted" ? decision.grant : null;
}
