import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getTeamAdministrationView } from "@/lib/identity/team-administration";

export const dynamic = "force-dynamic";

/** GET /api/auth/members — permission-filtered accepted-member inventory. */
export const GET = withErrorHandler(async () => {
  const context = await requireTrustedAction("members.read");
  const completeAuthority = await getTeamAdministrationView(context.shop);
  const personActor =
    context.actor.kind === "person" ? context.actor : null;
  const owner = personActor?.role === "owner";
  const authority = owner
    ? completeAuthority
    : Object.freeze({
        revision: completeAuthority.revision,
        members: Object.freeze(
          completeAuthority.members.filter((member) =>
            member.shopIds.includes(context.shop.shopId),
          ),
        ),
      });

  return NextResponse.json(
    {
      authority,
      currentActor: {
        personId: personActor?.personId ?? null,
        memberId: personActor?.workspaceMemberId ?? null,
        role:
          context.actor.kind === "system" ? null : context.actor.role,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/auth/members");
