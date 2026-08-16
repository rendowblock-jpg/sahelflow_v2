import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { projectTrustedActorActions } from "@/lib/identity/conversation-projection";

export const dynamic = "force-dynamic";

/** Minimal trusted-actor projection used only for Inbox work-queue ownership. */
export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("conversations.read");
  const actor = actorContext.actor;

  return NextResponse.json({
    currentMemberId:
      actor.kind === "person" ? actor.workspaceMemberId : null,
    role:
      actor.kind === "person"
        ? actor.role
        : actor.kind === "compatibility_local_owner"
          ? actor.role
          : null,
    allowedActions: projectTrustedActorActions(actorContext),
  });
}, "GET /api/inbox/authority");
