import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  collaborationCommentBinding,
  openBusinessPayloadWithKey,
  sealBusinessPayloadWithKey,
} from "@/lib/business-truth/payload-codec";
import {
  businessPrincipalFromTrustedActor,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { resolveCollaborationMembers } from "@/lib/identity/collaboration-member";
import {
  isTrustedActorContext,
  type PersonActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import {
  NotFoundError,
  SahelFlowError,
} from "@/types/errors";
import type { CollaborationContext } from "./administration";

const exactMemberId = z.string().regex(/^[0-9a-f]{32}$/i);
const entityType = z.enum(["conversation", "order", "confirmation"]);

export const internalCommentSchema = z
  .object({
    entityType,
    entityId: z.string().trim().min(1).max(256),
    body: z.string().trim().min(1).max(4000),
    mentionMemberIds: z.array(exactMemberId).max(10).default([]),
    expectedVersion: z.number().int().nonnegative().safe(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type InternalCommentInput = z.infer<typeof internalCommentSchema>;

export type InternalCommentResult = Readonly<{
  commentId: string;
  entityType: InternalCommentInput["entityType"];
  entityId: string;
  authorMemberId: string;
  body: string;
  mentionMemberIds: readonly string[];
  createdAt: string;
  version: number;
}>;

export type InternalCommentView = Readonly<{
  id: string;
  entityType: InternalCommentInput["entityType"];
  entityId: string;
  authorMemberId: string;
  body: string;
  mentionMemberIds: readonly string[];
  createdAt: string;
}>;

function assertExecutionContext(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
): PersonActor {
  if (!isTrustedActorContext(actorContext) || actorContext.actor.kind !== "person") {
    throw new SahelFlowError(
      "Internal comments require a server-minted person actor",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }
  if (
    actorContext.shop.workspaceId !== context.shop.workspaceId ||
    actorContext.shop.installationId !== context.shop.installationId ||
    actorContext.shop.shopId !== context.shop.shopId ||
    actorContext.shop.shopIncarnationId !== context.shop.shopIncarnationId ||
    actorContext.shop.databaseFileId !== context.shop.databaseFileId
  ) {
    throw new SahelFlowError(
      "Internal comment context does not match the trusted shop",
      "TRUSTED_ACTOR_SHOP_MISMATCH",
      409,
    );
  }
  assertTrustedAction(actorContext, "comments.write", {
    shopId: context.shop.shopId,
  });
  return actorContext.actor;
}

function deterministicCommentId(
  context: CollaborationContext,
  requestKey: string,
): string {
  return createHash("sha256")
    .update(
      `comment:${context.shop.workspaceId}:${context.shop.installationId}:${context.shop.shopId}:${requestKey}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 32);
}

function samePersonReplay(personId: string) {
  const prefix = `authenticated-owner:person:${personId}:session:`;
  return async ({ principal, storedCommand }: {
    principal: { auditActor: string };
    storedCommand: { actor: string };
  }): Promise<void> => {
    if (
      !principal.auditActor.startsWith(prefix) ||
      !storedCommand.actor.startsWith(prefix)
    ) {
      throw new SahelFlowError(
        "Only the same durable person may replay this internal comment command",
        "BUSINESS_COMMAND_REPLAY_FORBIDDEN",
        403,
      );
    }
  };
}

async function assertEntityExists(
  tx: Parameters<Parameters<CollaborationContext["prisma"]["$transaction"]>[0]>[0],
  type: InternalCommentInput["entityType"],
  id: string,
): Promise<void> {
  if (type === "conversation") {
    const row = await tx.conversation.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundError("Conversation", id);
    return;
  }
  const row = await tx.order.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError("Order", id);
}

export async function executeInternalComment(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  input: unknown,
): Promise<BusinessCommandResult<InternalCommentResult>> {
  const actor = assertExecutionContext(context, actorContext);
  const data = internalCommentSchema.parse(input);
  const mentions = await resolveCollaborationMembers(
    actor,
    data.mentionMemberIds,
    context.shop,
    { allowViewer: true },
  );
  const commentId = deterministicCommentId(context, data.idempotencyKey);
  const correlationId = data.correlationId ?? randomUUID();
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const businessContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };

  return executeBusinessCommand(
    businessContext,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: "collaboration.comment.create.v1",
      aggregate: {
        type: "collaboration-comments",
        id: `${data.entityType}:${data.entityId}`,
        expectedVersion: data.expectedVersion,
      },
      actor: `workspace-member:${actor.workspaceMemberId}`,
      correlationId,
      payload: {
        entityType: data.entityType,
        entityId: data.entityId,
        body: data.body,
        mentionMemberIds: mentions.map((member) => member.memberId),
      },
    },
    async ({ tx, commandId, aggregateVersion }) => {
      await assertEntityExists(tx, data.entityType, data.entityId);
      const createdAt = new Date();
      const mentionIds = mentions.map((member) => member.memberId).sort();
      await tx.collaborationComment.create({
        data: {
          id: commentId,
          entityType: data.entityType,
          entityId: data.entityId,
          authorMemberId: actor.workspaceMemberId,
          bodyJson: sealBusinessPayloadWithKey(
            { body: data.body },
            collaborationCommentBinding(commandId, commentId, data.entityType),
            envelopeKey,
          ),
          commandId,
          createdAt,
          mentions: {
            create: mentionIds.map((memberId) => ({ memberId, createdAt })),
          },
        },
      });

      const result: InternalCommentResult = Object.freeze({
        commentId,
        entityType: data.entityType,
        entityId: data.entityId,
        authorMemberId: actor.workspaceMemberId,
        body: data.body,
        mentionMemberIds: Object.freeze(mentionIds),
        createdAt: createdAt.toISOString(),
        version: aggregateVersion,
      });
      return {
        result,
        audit: {
          action: "collaboration.comment.created",
          entity: data.entityType,
          entityId: data.entityId,
          after: {
            commentId,
            authorMemberId: actor.workspaceMemberId,
            mentionMemberIds: mentionIds,
          },
        },
        events: [
          {
            key: `${commentId}:created`,
            type: "collaboration.comment.created",
            payload: {
              commentId,
              entityType: data.entityType,
              entityId: data.entityId,
              authorMemberId: actor.workspaceMemberId,
              mentionMemberIds: mentionIds,
            },
            occurredAt: createdAt,
          },
        ],
        projectionInvalidations: [
          `collaboration-comments:${data.entityType}:${data.entityId}`,
          `mentions:${actor.workspaceMemberId}`,
          ...mentionIds.map((memberId) => `mentions:${memberId}`),
        ],
      };
    },
    { authorizeReplay: samePersonReplay(actor.personId) },
  );
}

export async function getInternalCommentVersion(
  context: CollaborationContext,
  type: InternalCommentInput["entityType"],
  id: string,
): Promise<number> {
  const rows = await context.prisma.$queryRaw<Array<{ version: number | bigint }>>`
    SELECT "version"
    FROM "BusinessAggregateVersion"
    WHERE "aggregateType" = 'collaboration-comments'
      AND "aggregateId" = ${`${type}:${id}`}
    LIMIT 1
  `;
  return Number(rows[0]?.version ?? 0);
}

export async function listInternalComments(
  context: CollaborationContext,
  type: InternalCommentInput["entityType"],
  id: string,
): Promise<readonly InternalCommentView[]> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const comments = await context.prisma.collaborationComment.findMany({
    where: { entityType: type, entityId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { mentions: { orderBy: { memberId: "asc" } } },
  });
  return Object.freeze(
    comments.map((comment) => {
      const payload = openBusinessPayloadWithKey<{ body: string }>(
        comment.bodyJson,
        collaborationCommentBinding(
          comment.commandId,
          comment.id,
          comment.entityType,
        ),
        envelopeKey,
      );
      return Object.freeze({
        id: comment.id,
        entityType: comment.entityType as InternalCommentView["entityType"],
        entityId: comment.entityId,
        authorMemberId: comment.authorMemberId,
        body: payload.body,
        mentionMemberIds: Object.freeze(
          comment.mentions.map((mention) => mention.memberId),
        ),
        createdAt: comment.createdAt.toISOString(),
      });
    }),
  );
}
