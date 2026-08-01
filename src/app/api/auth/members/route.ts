import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getTeamAdministrationView } from "@/lib/identity/team-administration";

export const dynamic = "force-dynamic";

/** GET /api/auth/members — permission-filtered accepted-member inventory. */
export const GET = withErrorHandler(async () => {
  const context = await requireTrustedAction("members.read");
  const completeAuthority = await getTeamAdministrationView(context.shop);
  const owner =
    context.actor.kind === "person" && context.actor.role === "owner";
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
        personId:
          context.actor.kind === "person" ? context.actor.personId : null,
        memberId:
          context.actor.kind === "person"
            ? context.actor.workspaceMemberId
            : null,
        role: context.actor.role,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/auth/members");
