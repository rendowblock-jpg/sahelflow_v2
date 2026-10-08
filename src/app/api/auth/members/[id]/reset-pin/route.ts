import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { resetAdministrativeTeamMemberPin } from "@/lib/identity/team-member-administration";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ newPin: z.string().min(8).max(32) }).strict();

/**
 * POST /api/auth/members/[id]/reset-pin — owner sets a new PIN for a member
 * who forgot theirs. The member's sessions end; they sign in with the new PIN
 * and can change it from My account.
 */
export const POST = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const context = await requireTrustedAction("members.manage");
    if (context.actor.kind !== "person" || context.actor.role !== "owner") {
      throw new SahelFlowError(
        "Only the workspace owner may reset a member's PIN",
        "ACTION_FORBIDDEN",
        403,
      );
    }
    await requireRecentReauthentication();
    const { id } = await params;
    const { newPin } = schema.parse(await request.json());
    const result = await resetAdministrativeTeamMemberPin({
      currentOwnerSessionId: context.actor.sessionId,
      targetMemberId: id,
      newPin,
      shop: context.shop,
      auditActor: trustedActorAuditIdentity(context.actor),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  "POST /api/auth/members/[id]/reset-pin",
);
