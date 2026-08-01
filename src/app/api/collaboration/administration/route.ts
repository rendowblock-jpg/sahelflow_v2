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

  const view = await getCollaborationAdministrationView({
    prisma: db,
    shop: shopContext,
  });
  return NextResponse.json(
    {
      workgroups: canReadWorkgroups ? view.workgroups : [],
      queues: canReadQueues ? view.queues : [],
      permissions: {
        workgroupsRead: canReadWorkgroups,
        workgroupsManage: trustedActionAllowed(
          actorContext,
          "workgroups.manage",
          { shopId: actorContext.shop.shopId },
        ),
        queuesRead: canReadQueues,
        queuesManage: trustedActionAllowed(actorContext, "queues.manage", {
          shopId: actorContext.shop.shopId,
        }),
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
