import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { loadConnectedRuntimeIfEnrolled } from "@/lib/connected-platform/runtime";
import { db } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { getIdentityAdministrationSnapshot } from "@/lib/identity/control-authority";
import { PHASE2_ACTIONS } from "@/lib/identity/permissions";
import { listTeamMembers } from "@/lib/identity/team-directory";
import { updateAdministrativeTeamMemberAccess } from "@/lib/identity/team-member-administration";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const accessSchema = z
  .object({
    role: z.enum(["manager", "operator", "viewer"]),
    permissions: z.array(z.enum(PHASE2_ACTIONS)).nullable(),
    shopIds: z.array(z.string().trim().min(1).max(200)).min(1),
  })
  .strict();

/**
 * PATCH /api/auth/members/[id] — owner changes a member's role, permissions
 * and shops. The member keeps their identity and history; their open sessions
 * end so the next sign-in carries the new access.
 */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const context = await requireTrustedAction("members.manage");
    if (context.actor.kind !== "person" || context.actor.role !== "owner") {
      throw new SahelFlowError(
        "Only the workspace owner may change a member's access",
        "ACTION_FORBIDDEN",
        403,
      );
    }
    await requireRecentReauthentication();
    const { id } = await params;
    const access = accessSchema.parse(await request.json());
    // A member can be granted exactly the shops the owner holds.
    const owner = await getIdentityAdministrationSnapshot(
      context.actor.sessionId,
      context.shop,
    );
    const granted = new Set(owner.member.shopIds);
    if (!access.shopIds.every((shopId) => granted.has(shopId))) {
      throw new SahelFlowError(
        "Invitation requests a shop outside the owner grant",
        "INVITATION_SHOP_FORBIDDEN",
        403,
      );
    }
    const before = (await listTeamMembers(context.shop)).find(
      (member) => member.memberId === id,
    );
    const result = await updateAdministrativeTeamMemberAccess({
      currentOwnerSessionId: context.actor.sessionId,
      targetMemberId: id,
      access,
      before: before
        ? {
            role: before.role,
            permissions: before.permissions,
            shopIds: before.shopIds,
          }
        : null,
      shop: context.shop,
      auditActor: trustedActorAuditIdentity(context.actor),
    });
    if (result.changed) {
      try {
        const runtime = await loadConnectedRuntimeIfEnrolled({
          prisma: db,
          shop: context.shop,
        });
        await runtime?.client.invalidateMemberCommandPolicies(
          context.shop.workspaceId,
          result.memberId,
        );
      } catch {
        // Remote command policy expires fail-closed; the desktop revalidates
        // the durable member before executing any command.
      }
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  "PATCH /api/auth/members/[id]",
);
