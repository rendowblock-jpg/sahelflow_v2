import "server-only";

export * from "./control-authority";

import {
  resolveDurableIdentityActor as resolveCoreIdentityActor,
  rotateIdentityAuthorityAuthentication as rotateCoreIdentityAuthority,
  type DurableIdentityActor as CoreIdentityActor,
  type IdentityAuthorityRotationResult,
} from "./control-authority";
import { rotateMemberAuthorityAuthentication } from "./member-authority";
import type { Phase2Action } from "./permissions";
import {
  resolveTeamIdentityActor,
  rotateTeamDirectoryAuthentication,
  type TeamIdentityActor,
} from "./team-directory";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";

export type PublicIdentityActor =
  | Readonly<CoreIdentityActor & { permissions: readonly Phase2Action[] | null }>
  | TeamIdentityActor;

function errorCode(error: unknown): string | null {
  return error instanceof SahelFlowError ? error.code : null;
}

/** Resolve an exact owner or accepted-member actor from one public boundary. */
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
  if (team) return team;
  return null;
}

/**
 * Public installation-identity rotation boundary.
 *
 * Core identity, invitation issuance and accepted-member directory files are all
 * verified under the current/candidate roots before any is rewritten. A later
 * write failure remains safe to resume because every store accepts either root.
 */
export function rotateIdentityAuthorityAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): IdentityAuthorityRotationResult {
  const corePreview = rotateCoreIdentityAuthority(oldKey, newKey, true);
  const invitationPreview = rotateMemberAuthorityAuthentication(oldKey, newKey, true);
  const teamPreview = rotateTeamDirectoryAuthentication(oldKey, newKey, true);

  if (
    corePreview.state === "absent" &&
    (invitationPreview.state !== "absent" || teamPreview.state !== "absent")
  ) {
    throw new SahelFlowError(
      "Member authority exists without the installation identity authority",
      "MEMBER_AUTHORITY_ORPHANED",
      503,
    );
  }
  if (invitationPreview.state === "absent" && teamPreview.state !== "absent") {
    throw new SahelFlowError(
      "Accepted member authority exists without invitation authority",
      "TEAM_DIRECTORY_ORPHANED",
      503,
    );
  }

  if (dryRun) return corePreview;

  const core = rotateCoreIdentityAuthority(oldKey, newKey, false);
  rotateMemberAuthorityAuthentication(oldKey, newKey, false);
  rotateTeamDirectoryAuthentication(oldKey, newKey, false);
  return core;
}
