import "server-only";

export * from "./control-authority";

import {
  rotateIdentityAuthorityAuthentication as rotateCoreIdentityAuthority,
  type IdentityAuthorityRotationResult,
} from "./control-authority";
import { rotateMemberAuthorityAuthentication } from "./member-authority";
import { SahelFlowError } from "@/types/errors";

/**
 * Public installation-identity rotation boundary.
 *
 * Both authenticated authority files are verified under the current/candidate
 * roots before either is rewritten. This prevents an orphan member authority
 * from being silently carried across a root rotation. A later write failure is
 * safe to resume because each underlying authority accepts either root.
 */
export function rotateIdentityAuthorityAuthentication(
  oldKey: Buffer,
  newKey: Buffer,
  dryRun = false,
): IdentityAuthorityRotationResult {
  const corePreview = rotateCoreIdentityAuthority(oldKey, newKey, true);
  const memberPreview = rotateMemberAuthorityAuthentication(oldKey, newKey, true);

  if (corePreview.state === "absent" && memberPreview.state !== "absent") {
    throw new SahelFlowError(
      "Member authority exists without the installation identity authority",
      "MEMBER_AUTHORITY_ORPHANED",
      503,
    );
  }

  if (dryRun) return corePreview;

  const core = rotateCoreIdentityAuthority(oldKey, newKey, false);
  rotateMemberAuthorityAuthentication(oldKey, newKey, false);
  return core;
}
