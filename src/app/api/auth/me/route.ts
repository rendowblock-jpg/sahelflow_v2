import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import { listTeamMembers } from "@/lib/identity/team-directory";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — current durable person/member/device authority. */
export const GET = withErrorHandler(async () => {
  const context = await requireTrustedActor();
  if (context.actor.kind !== "person") {
    throw new SahelFlowError(
      "Durable person authority is required",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }

  const member = (await listTeamMembers(context.shop)).find(
    (candidate) => candidate.memberId === context.actor.workspaceMemberId,
  );

  return NextResponse.json(
    {
      profile: member
        ? {
            kind: "team_member",
            personId: member.personId,
            memberId: member.memberId,
            deviceId: member.deviceId,
            displayName: member.displayName,
            loginId: member.loginId,
            role: member.role,
            permissions: member.permissions,
            shopIds: member.shopIds,
            policyVersion: member.policyVersion,
            revocationEpoch: member.revocationEpoch,
          }
        : {
            kind: "owner",
            personId: context.actor.personId,
            memberId: context.actor.workspaceMemberId,
            deviceId: context.actor.deviceId,
            role: context.actor.role,
            permissions: context.actor.permissions ?? null,
            shopIds: [context.shop.shopId],
            policyVersion: context.actor.policyVersion,
            revocationEpoch: context.actor.revocationEpoch,
          },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/auth/me");
