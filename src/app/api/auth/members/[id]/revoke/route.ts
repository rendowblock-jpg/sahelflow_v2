import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { loadConnectedRuntimeIfEnrolled } from "@/lib/connected-platform/runtime";
import { db } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { revokeAdministrativeTeamMember } from "@/lib/identity/team-administration";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/auth/members/[id]/revoke — owner-only control-first revocation. */
export const POST = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const context = await requireTrustedAction("members.manage");
    if (context.actor.kind !== "person" || context.actor.role !== "owner") {
      throw new SahelFlowError(
        "Only the workspace owner may revoke a member",
        "ACTION_FORBIDDEN",
        403,
      );
    }
    await requireRecentReauthentication();
    const { id } = await params;
    const result = await revokeAdministrativeTeamMember({
      currentOwnerSessionId: context.actor.sessionId,
      targetMemberId: id,
      shop: context.shop,
      auditActor: trustedActorAuditIdentity(context.actor),
    });
    let connectedPolicyInvalidated = false;
    try {
      const runtime = await loadConnectedRuntimeIfEnrolled({ prisma: db, shop: context.shop });
      if (runtime) {
        const invalidated = await runtime.client.invalidateMemberCommandPolicies(
          context.shop.workspaceId,
          result.memberId,
        );
        connectedPolicyInvalidated = invalidated.status === "invalidated";
      }
    } catch {
      // Local authority is already revoked. Cloud policy expires fail-closed and
      // desktop execution revalidates the durable member before any command.
    }
    return NextResponse.json({ ...result, connectedPolicyInvalidated }, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  "POST /api/auth/members/[id]/revoke",
);
