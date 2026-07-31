import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { revokeMemberInvitation } from "@/lib/identity/member-authority";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/auth/invitations/[id]/revoke — owner-only invitation revocation. */
export const POST = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const context = await requireTrustedAction("members.manage");
    if (context.actor.kind !== "person" || context.actor.role !== "owner") {
      throw new SahelFlowError(
        "Only the workspace owner may administer invitations",
        "ACTION_FORBIDDEN",
        403,
      );
    }
    await requireRecentReauthentication();
    const { id } = await params;
    const result = await revokeMemberInvitation(
      context.actor.sessionId,
      id,
      context.shop,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  },
  "POST /api/auth/invitations/[id]/revoke",
);
