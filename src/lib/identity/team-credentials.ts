import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  createTeamLoginSession,
  listTeamMembers,
  type TeamSessionGrant,
} from "./team-directory";
import { assertTeamMemberActive } from "./team-revocation-authority";

/**
 * Validate a member's exact-shop and active control authority before generating
 * a session.
 *
 * Session registration still performs the final race-safe check. This preflight
 * prevents a revoked or wrong-shop public credential from creating orphan
 * directory sessions while never granting database/cookie authority.
 *
 * Unknown, revoked and wrong-shop members are deliberately indistinguishable
 * from invalid credentials to the public login flow. Authentication failures
 * caused by corrupt, mismatched or unavailable authority remain hard failures
 * and are never hidden.
 */
export async function createActiveTeamLoginSession(
  loginId: string,
  pin: string,
  shop: ShopContext,
): Promise<TeamSessionGrant | null> {
  const member = (await listTeamMembers(shop)).find(
    (candidate) => candidate.loginId === loginId.trim().toLowerCase(),
  );
  if (!member || !member.shopIds.includes(shop.shopId)) return null;

  try {
    await assertTeamMemberActive(member.memberId, shop);
  } catch (error) {
    if (
      error instanceof SahelFlowError &&
      error.code === "IDENTITY_MEMBER_REVOKED"
    ) {
      return null;
    }
    throw error;
  }

  return createTeamLoginSession(loginId, pin, shop);
}
