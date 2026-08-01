import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  executeInternalComment,
  getInternalCommentVersion,
  listInternalComments,
} from "@/lib/collaboration/comments";
import { db, shopContext } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

const entityQuerySchema = z.object({
  entityType: z.enum(["conversation", "order", "confirmation"]),
  entityId: z.string().trim().min(1).max(256),
});

function assertEntityRead(
  actorContext: TrustedActorContext,
  entityType: "conversation" | "order" | "confirmation",
): void {
  assertTrustedAction(
    actorContext,
    entityType === "conversation" ? "conversations.read" : "orders.read",
    { shopId: actorContext.shop.shopId },
  );
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("comments.read");
  const query = entityQuerySchema.parse({
    entityType: request.nextUrl.searchParams.get("entityType"),
    entityId: request.nextUrl.searchParams.get("entityId"),
  });
  assertEntityRead(actorContext, query.entityType);
  const context = { prisma: db, shop: shopContext };
  const [comments, version] = await Promise.all([
    listInternalComments(context, query.entityType, query.entityId),
    getInternalCommentVersion(context, query.entityType, query.entityId),
  ]);
  return NextResponse.json(
    { comments, version },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/collaboration/comments");

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("comments.write");
  const body = (await request.json()) as Record<string, unknown>;
  const query = entityQuerySchema.parse(body);
  assertEntityRead(actorContext, query.entityType);

  const command = await executeInternalComment(
    { prisma: db, shop: shopContext },
    actorContext,
    body,
  );
  return NextResponse.json({
    comment: command.result,
    command: {
      id: command.commandId,
      aggregateVersion: command.aggregateVersion,
      replayed: command.replayed,
    },
  });
}, "POST /api/collaboration/comments");
