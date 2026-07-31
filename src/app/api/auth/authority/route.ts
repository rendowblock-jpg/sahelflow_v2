import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getIdentityAdministrationView } from "@/lib/identity/session-administration";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/auth/authority — exact installation identity/session inventory. */
export const GET = withErrorHandler(async () => {
  const context = await requireTrustedAction("sessions.read");
  if (context.actor.kind !== "person") {
    throw new SahelFlowError(
      "Durable person authority is required",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }
  if (context.actor.role !== "owner") {
    throw new SahelFlowError(
      "Only the workspace owner may inspect installation sessions and devices",
      "ACTION_FORBIDDEN",
      403,
    );
  }

  const authority = await getIdentityAdministrationView(
    context.actor.sessionId,
    context.shop,
  );
  return NextResponse.json({ authority });
}, "GET /api/auth/authority");
