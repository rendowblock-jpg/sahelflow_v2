import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  executeQueueMutation,
  executeWorkgroupMutation,
  getCollaborationAdministrationView,
} from "@/lib/collaboration/administration";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { listTeamMembers } from "@/lib/identity/team-directory";
import { getTeamRevocationSnapshot } from "@/lib/identity/team-revocation-authority";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

const mutationKindSchema = z.object({
  kind: z.enum(["workgroup", "queue"]),
}).passthrough();

export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedActor();
  const canReadWorkgroups = trustedActionAllowed(
    actorContext,
    "workgroups.read",
    { shopId: actorContext.shop.shopId },
  );
  const canReadQueues = trustedActionAllowed(actorContext, "queues.read", {
    shopId: actorContext.shop.shopId,
  });
  if (!canReadWorkgroups && !canReadQueues) {
    assertTrustedAction(actorContext, "workgroups.read", {
      shopId: actorContext.shop.shopId,
    });
  }

  const workgroupsManage = trustedActionAllowed(
    actorContext,
    "workgroups.manage",
    { shopId: actorContext.shop.shopId },
  );
  const queuesManage = trustedActionAllowed(actorContext, "queues.manage", {
    shopId: actorContext.shop.shopId,
  });
  const view = await getCollaborationAdministrationView({
    prisma: db,
    shop: shopContext,
  });
  const activeMembers: Array<{
    memberId: string;
    displayName: string | null;
    role: "owner" | "manager" | "operator" | "viewer";
  }> = [];
  if (workgroupsManage) {
    const [members, revocation] = await Promise.all([
      listTeamMembers(actorContext.shop),
      getTeamRevocationSnapshot(actorContext.shop),
    ]);
    const revoked = new Set(
      revocation.memberRevocations.map((entry) => entry.memberId),
    );
    activeMembers.push(
      ...members
        .filter(
          (member) =>
            member.revokedAt === null &&
            !revoked.has(member.memberId) &&
            member.shopIds.includes(actorContext.shop.shopId),
        )
        .map((member) => ({
          memberId: member.memberId,
          displayName: member.displayName,
          role: member.role,
        })),
    );
    if (
      actorContext.actor.kind === "person" &&
      actorContext.actor.role === "owner" &&
      !activeMembers.some(
        (member) => member.memberId === actorContext.actor.workspaceMemberId,
      )
    ) {
      activeMembers.unshift({
        memberId: actorContext.actor.workspaceMemberId,
        displayName: null,
        role: "owner",
      });
    }
  }

  return NextResponse.json(
    {
      workgroups: canReadWorkgroups ? view.workgroups : [],
      queues: canReadQueues ? view.queues : [],
      activeMembers,
      permissions: {
        workgroupsRead: canReadWorkgroups,
        workgroupsManage,
        queuesRead: canReadQueues,
        queuesManage,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/collaboration/administration");

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const body = (await request.json()) as unknown;
  const { kind } = mutationKindSchema.parse(body);
  assertTrustedAction(
    actorContext,
    kind === "workgroup" ? "workgroups.manage" : "queues.manage",
    { shopId: actorContext.shop.shopId },
  );

  const context = { prisma: db, shop: shopContext };
  const command = kind === "workgroup"
    ? await executeWorkgroupMutation(context, actorContext, body)
    : await executeQueueMutation(context, actorContext, body);

  return NextResponse.json({
    result: command.result,
    command: {
      id: command.commandId,
      aggregateVersion: command.aggregateVersion,
      replayed: command.replayed,
    },
  });
}, "POST /api/collaboration/administration");
