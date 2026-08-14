import "server-only";

export * from "./control-authority";

import {
  resolveDurableIdentityMember as resolveCoreIdentityMember,
  resolveDurableIdentityActor as resolveCoreIdentityActor,
  rotateIdentityAuthorityAuthentication as rotateCoreIdentityAuthority,
  type DurableIdentityActor as CoreIdentityActor,
  type IdentityAuthorityRotationResult,
} from "./control-authority";
import { rotateMemberAuthorityAuthentication } from "./member-authority";
import type { Phase2Action } from "./permissions";
import {
  listTeamMembers,
  resolveTeamIdentityActor,
  rotateTeamDirectoryAuthentication,
  type TeamIdentityActor,
} from "./team-directory";
import {
  assertTeamMemberActive,
  rotateTeamRevocationAuthentication,
} from "./team-revocation-authority";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

export type PublicIdentityActor =
  | Readonly<CoreIdentityActor & { permissions: readonly Phase2Action[] | null }>
  | TeamIdentityActor;

function errorCode(error: unknown): string | null {
  return error instanceof SahelFlowError ? error.code : null;
}

/** Resolve current owner/member policy without trusting a browser session. */
export async function resolveRemoteIdentityActor(
  memberId: string,
  shop: ShopContext,
): Promise<PublicIdentityActor | null> {
  const core = await resolveCoreIdentityMember(memberId, shop);
  if (core) return Object.freeze({ ...core, permissions: null });
  const members = await listTeamMembers(shop);
  const member = members.find((candidate) =>
    candidate.memberId === memberId &&
    candidate.revokedAt === null &&
    candidate.shopIds.includes(shop.shopId)
  );
  if (!member) return null;
  await assertTeamMemberActive(member.memberId, shop);
  return Object.freeze({
    personId: member.personId,
    workspaceMemberId: member.memberId,
    deviceId: member.deviceId,
    role: member.role,
    permissions: member.permissions,
    policyVersion: member.policyVersion,
    revocationEpoch: member.revocationEpoch,
  });
}

/** Resolve an exact active owner or accepted-member actor from one boundary. */
export async function resolveDurableIdentityActor(
  sessionId: string,
  shop: ShopContext,
): Promise<PublicIdentityActor | null> {
  try {
    const core = await resolveCoreIdentityActor(sessionId, shop);
    if (core) return Object.freeze({ ...core, permissions: null });
  } catch (error) {
    if (errorCode(error) !== "IDENTITY_SESSION_BINDING_REQUIRED") throw error;
  }

  const team = await resolveTeamIdentityActor(sessionId, shop);
  if (team) {
    await assertTeamMemberActive(team.workspaceMemberId, shop);
    return team;
  }
  return null;
}

/**
 * Public installation-identity rotation boundary.
 *
 * Core identity, invitation issuance, accepted-member directory and member
 * revocation files are verified under current/candidate roots before any write.
 * A later write failure remains safe to resume because every store accepts either
 * root.
 */
export function rotateIdentityAuthorityAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): IdentityAuthorityRotationResult {
  const corePreview = rotateCoreIdentityAuthority(oldKey, newKey, true);
  const invitationPreview = rotateMemberAuthorityAuthentication(oldKey, newKey, true);
  const teamPreview = rotateTeamDirectoryAuthentication(oldKey, newKey, true);
  const revocationPreview = rotateTeamRevocationAuthentication(oldKey, newKey, true);

  if (
    corePreview.state === "absent" &&
    (invitationPreview.state !== "absent" ||
      teamPreview.state !== "absent" ||
      revocationPreview.state !== "absent")
  ) {
    throw new SahelFlowError(
      "Member authority exists without the installation identity authority",
      "MEMBER_AUTHORITY_ORPHANED",
      503,
    );
  }
  if (
    invitationPreview.state === "absent" &&
    (teamPreview.state !== "absent" || revocationPreview.state !== "absent")
  ) {
    throw new SahelFlowError(
      "Accepted member authority exists without invitation authority",
      "TEAM_DIRECTORY_ORPHANED",
      503,
    );
  }
  if (teamPreview.state === "absent" && revocationPreview.state !== "absent") {
    throw new SahelFlowError(
      "Member revocation authority exists without the accepted-member directory",
      "TEAM_REVOCATION_ORPHANED",
      503,
    );
  }

  if (dryRun) return corePreview;

  const core = rotateCoreIdentityAuthority(oldKey, newKey, false);
  rotateMemberAuthorityAuthentication(oldKey, newKey, false);
  rotateTeamDirectoryAuthentication(oldKey, newKey, false);
  rotateTeamRevocationAuthentication(oldKey, newKey, false);
  return core;
}
