import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { executeConversationAssignment } from "@/lib/inbox/conversation-assignment";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const operationSchema = z
  .object({
    operation: z.enum(["claim", "release", "assign", "unassign"]),
  })
  .passthrough();

/**
 * PATCH /api/conversations/[id]/assign
 *
 * Govern self-claim/release and manager assignment/handover through one exact
 * business command. The trusted actor and process shop are established before
 * request input can select an operation or create a live-JID conversation row.
 */
export const PATCH = withErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const body = (await request.json()) as unknown;
    const operation = operationSchema.parse(body).operation;
    assertTrustedAction(
      actorContext,
      operation === "claim" || operation === "release"
        ? "conversations.claim"
        : "conversations.assign",
      { shopId: actorContext.shop.shopId },
    );

    const context = { prisma: db, shop: shopContext };
    const conversationId = await ensureConversationForJid(context, rawId);
    const command = await executeConversationAssignment(
      context,
      actorContext,
      {
        ...(body as Record<string, unknown>),
        conversationId,
      },
    );

    return NextResponse.json({
      assignment: command.result,
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    });
  },
  "PATCH /api/conversations/[id]/assign",
);
