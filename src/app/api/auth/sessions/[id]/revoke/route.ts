import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { revokeAdministrativeSession } from "@/lib/identity/session-administration";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** POST /api/auth/sessions/[id]/revoke — revoke another installation session. */
export const POST = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const context = await requireTrustedAction("sessions.revoke");
    if (context.actor.kind !== "person") {
      throw new SahelFlowError(
        "Durable person authority is required",
        "TRUSTED_ACTOR_REQUIRED",
        401,
      );
    }

    // Session administration is a high-risk authority change. The proof check
    // happens before the route consumes the caller-supplied target ID.
    await requireRecentReauthentication();
    const { id } = await params;

    const result = await revokeAdministrativeSession({
      currentSessionId: context.actor.sessionId,
      targetSessionId: id,
      shop: context.shop,
      auditActor: trustedActorAuditIdentity(context.actor),
    });
    return NextResponse.json({ result });
  },
  "POST /api/auth/sessions/[id]/revoke",
);
