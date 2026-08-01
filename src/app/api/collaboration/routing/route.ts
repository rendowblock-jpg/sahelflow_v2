import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  executeCollaborationRouting,
  getCollaborationRoutingVersion,
} from "@/lib/collaboration/assignment";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

const entitySchema = z.object({
  entityType: z.enum(["conversation", "order", "confirmation"]),
  entityId: z.string().trim().min(1).max(256),
});

function assertEntityRead(
  actorContext: Awaited<ReturnType<typeof requireTrustedActor>>,
  entityType: "conversation" | "order" | "confirmation",
): void {
  assertTrustedAction(
    actorContext,
    entityType === "conversation" ? "conversations.read" : "orders.read",
    { shopId: actorContext.shop.shopId },
  );
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const entity = entitySchema.parse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
  });
  assertEntityRead(actorContext, entity.entityType);
  assertTrustedAction(actorContext, "queues.read", {
    shopId: actorContext.shop.shopId,
  });

  const [assignment, queues, version] = await Promise.all([
    db.collaborationAssignment.findUnique({
      where: {
        entityType_entityId: {
          entityType: entity.entityType,
          entityId: entity.entityId,
        },
      },
    }),
    db.collaborationQueue.findMany({
      where: { entityType: entity.entityType, state: "active" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        workgroupId: true,
      },
    }),
    getCollaborationRoutingVersion(
      { prisma: db, shop: shopContext },
      entity.entityType,
      entity.entityId,
    ),
  ]);

  return NextResponse.json(
    {
      assignment: assignment ?? {
        entityType: entity.entityType,
        entityId: entity.entityId,
        queueId: null,
        workgroupId: null,
        assigneeMemberId: null,
        state: "open",
        generation: 0,
      },
      queues,
      version,
      permissions: {
        canRoute: trustedActionAllowed(
          actorContext,
          entity.entityType === "conversation"
            ? "conversations.assign"
            : "orders.assign",
          { shopId: actorContext.shop.shopId },
        ),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/collaboration/routing");

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedActor();
  const body = (await request.json()) as Record<string, unknown>;
  const entity = entitySchema.parse(body);
  assertEntityRead(actorContext, entity.entityType);
  assertTrustedAction(
    actorContext,
    entity.entityType === "conversation"
      ? "conversations.assign"
      : "orders.assign",
    { shopId: actorContext.shop.shopId },
  );

  const command = await executeCollaborationRouting(
    { prisma: db, shop: shopContext },
    actorContext,
    body,
  );
  return NextResponse.json({
    assignment: command.result,
    command: {
      id: command.commandId,
      aggregateVersion: command.aggregateVersion,
      replayed: command.replayed,
    },
  });
}, "POST /api/collaboration/routing");
