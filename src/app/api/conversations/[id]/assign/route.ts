import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { ensureConversationForJid } from "@/lib/data/conversation-service";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { resolvePhase2Permissions } from "@/lib/identity/permissions";
import { listTeamMembers } from "@/lib/identity/team-directory";
import {
  executeConversationAssignment,
  getConversationAssignmentVersion,
} from "@/lib/inbox/conversation-assignment";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

const operationSchema = z
  .object({
    operation: z.enum(["claim", "release", "assign", "unassign"]),
  })
  .passthrough();

function actorProjection(
  context: Awaited<ReturnType<typeof requireTrustedAction>>,
) {
  if (context.actor.kind !== "person") {
    return {
      personId: null,
      memberId: null,
      role: null,
      allowedActions: [] as string[],
      shopId: context.shop.shopId,
    };
  }
  const actor = context.actor;
  return {
    personId: actor.personId,
    memberId: actor.workspaceMemberId,
    role: actor.role,
    allowedActions: resolvePhase2Permissions(
      actor.role,
      actor.permissions ? JSON.stringify(actor.permissions) : null,
    ),
    shopId: context.shop.shopId,
  };
}

/** GET /api/conversations/[id]/assign — lightweight assignment authority state. */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const context = { prisma: db, shop: shopContext };
    const conversationId = await ensureConversationForJid(context, rawId);
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, assigneeId: true },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const currentActor = actorProjection(actorContext);
    const canAssign = currentActor.allowedActions.includes(
      "conversations.assign",
    );
    const acceptedMembers = canAssign
      ? (await listTeamMembers(actorContext.shop))
          .filter(
            (member) =>
              member.revokedAt === null &&
              member.role !== "viewer" &&
              member.shopIds.includes(actorContext.shop.shopId),
          )
          .map((member) => ({
            memberId: member.memberId,
            displayName: member.displayName,
            role: member.role,
          }))
      : [];
    const assignableMembers = [...acceptedMembers];
    if (
      canAssign &&
      currentActor.role === "owner" &&
      currentActor.memberId &&
      !assignableMembers.some(
        (member) => member.memberId === currentActor.memberId,
      )
    ) {
      assignableMembers.unshift({
        memberId: currentActor.memberId,
        displayName: null,
        role: "owner",
      });
    }

    return NextResponse.json(
      {
        assignment: {
          conversationId: conversation.id,
          assigneeId: conversation.assigneeId,
          version: await getConversationAssignmentVersion(
            context,
            conversation.id,
          ),
        },
        currentActor,
        assignableMembers,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  "GET /api/conversations/[id]/assign",
);

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
