import "server-only";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { getIdentityAdministrationSnapshot } from "./control-authority";
import {
  revokeTeamMemberAuthority,
  type RevokeTeamMemberAuthorityResult,
} from "./team-revocation-authority";

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

/**
 * Serialize the production member-revocation command and revalidate the exact
 * owner session after any queue wait, immediately before durable control state
 * is changed.
 *
 * The lower authority primitive retains its own validation and file lock. This
 * command boundary prevents a request that became stale while waiting behind
 * another administration operation from reaching that primitive.
 */
export async function revokeFreshOwnerTeamMemberAuthority(input: {
  currentOwnerSessionId: string;
  targetMemberId: string;
  shop: ShopContext;
}): Promise<RevokeTeamMemberAuthorityResult> {
  return withCommandQueue(async () => {
    const owner = await getIdentityAdministrationSnapshot(
      input.currentOwnerSessionId,
      input.shop,
    );
    if (owner.currentActor.role !== "owner") {
      throw new SahelFlowError(
        "Only the workspace owner may revoke a member",
        "ACTION_FORBIDDEN",
        403,
      );
    }

    return revokeTeamMemberAuthority(input);
  });
}
