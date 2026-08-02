import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  collaborationHandoverReasonBinding,
  sealBusinessPayloadWithKey,
} from "@/lib/business-truth/payload-codec";
import {
  businessPrincipalFromTrustedActor,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { resolveConversationAssignee } from "@/lib/identity/conversation-assignee";
import {
  isTrustedActorContext,
  type PersonActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import { ConflictError, NotFoundError, SahelFlowError } from "@/types/errors";

const exactMemberId = z.string().regex(/^[0-9a-f]{32}$/i);

type ConversationAssignmentContext = ServiceContext & Readonly<{
  shop: ShopContext;
}>;

export const conversationAssignmentSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(256),
    operation: z.enum(["claim", "release", "assign", "unassign"]),
    targetMemberId: exactMemberId.optional().nullable(),
    expectedVersion: z.number().int().nonnegative().safe(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, refinement) => {
    if (value.operation === "assign" && !value.targetMemberId) {
      refinement.addIssue({
        code: "custom",
        path: ["targetMemberId"],
        message: "Assignment requires an exact member target",
      });
    }
    if (value.operation !== "assign" && value.targetMemberId != null) {
      refinement.addIssue({
        code: "custom",
        path: ["targetMemberId"],
        message: "Only assignment accepts a member target",
      });
    }
  });

export type ConversationAssignmentInput = z.infer<
  typeof conversationAssignmentSchema
>;

export type ConversationAssignmentActivityType =
  | "assignment_claimed"
  | "assignment_released"
  | "assignment_assigned"
  | "assignment_handed_over"
  | "assignment_unassigned";

export type ConversationAssignmentResult = Readonly<{
  conversationId: string;
  operation: ConversationAssignmentInput["operation"];
  previousAssigneeId: string | null;
  assignee: Readonly<{
    memberId: string;
    personId: string;
    displayName: string | null;
    role: "owner" | "manager" | "operator";
  }> | null;
  activityType: ConversationAssignmentActivityType;
  version: number;
}>;

function assertExecutionContext(
  context: ConversationAssignmentContext,
  actorContext: TrustedActorContext,
): PersonActor {
  if (!isTrustedActorContext(actorContext)) {
    throw new SahelFlowError(
      "Conversation assignment requires a server-minted trusted actor",
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
      "Conversation assignment context does not match the trusted shop",
      "TRUSTED_ACTOR_SHOP_MISMATCH",
      409,
    );
  }
  if (actorContext.actor.kind !== "person") {
    throw new SahelFlowError(
      "Conversation assignment requires durable person authority",
      "TRUSTED_ACTOR_REQUIRED",
      401,
    );
  }
  return actorContext.actor;
}

function operationAction(
  operation: ConversationAssignmentInput["operation"],
): "conversations.claim" | "conversations.assign" {
  return operation === "claim" || operation === "release"
    ? "conversations.claim"
    : "conversations.assign";
}

function samePersonAuditPrefix(personId: string): string {
  return `authenticated-owner:person:${personId}:session:`;
}

export async function getConversationAssignmentVersion(
  context: ConversationAssignmentContext,
  conversationId: string,
): Promise<number> {
  const rows = await context.prisma.$queryRaw<Array<{ version: number | bigint }>>`
    SELECT "version"
    FROM "BusinessAggregateVersion"
    WHERE "aggregateType" = 'conversation-assignment'
      AND "aggregateId" = ${conversationId}
    LIMIT 1
  `;
  return Number(rows[0]?.version ?? 0);
}

export async function getConversationAssignmentVersions(
  context: ConversationAssignmentContext,
  conversationIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const unique = [...new Set(conversationIds)];
  const entries = await Promise.all(
    unique.map(
      async (conversationId) =>
        [
          conversationId,
          await getConversationAssignmentVersion(context, conversationId),
        ] as const,
    ),
  );
  return new Map(entries);
}

/**
 * Govern self-claim, self-release, manager assignment/handover and unassignment.
 *
 * The generic CollaborationAssignment row is current operational authority. The
 * legacy Conversation.assigneeId column remains an inbox projection and is
 * updated in the same transaction. Every change also appends an explicit
 * CollaborationHandover fact, encrypted reason, activity, trusted audit and
 * domain event.
 */
export async function executeConversationAssignment(
  context: ConversationAssignmentContext,
  actorContext: TrustedActorContext,
  input: unknown,
): Promise<BusinessCommandResult<ConversationAssignmentResult>> {
  const actor = assertExecutionContext(context, actorContext);
  const data = conversationAssignmentSchema.parse(input);
  const action = operationAction(data.operation);
  assertTrustedAction(actorContext, action, { shopId: context.shop.shopId });

  const businessContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };
  const correlationId = data.correlationId ?? randomUUID();
  const replayPrefix = samePersonAuditPrefix(actor.personId);
  const envelopeKey = await getBusinessEnvelopeKey(context);

  return executeBusinessCommand(
    businessContext,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `conversation.assignment.${data.operation}.v2`,
      aggregate: {
        type: "conversation-assignment",
        id: data.conversationId,
        expectedVersion: data.expectedVersion,
      },
      actor: `workspace-member:${actor.workspaceMemberId}`,
      correlationId,
      payload: {
        conversationId: data.conversationId,
        operation: data.operation,
        targetMemberId: data.targetMemberId ?? null,
        reason: data.reason ?? null,
      },
    },
    async ({ tx, commandId, aggregateVersion }) => {
      const conversation = await tx.conversation.findUnique({
        where: { id: data.conversationId },
        select: { id: true, assigneeId: true },
      });
      if (!conversation) {
        throw new NotFoundError("Conversation", data.conversationId);
      }
      const currentAssignment = await tx.collaborationAssignment.findUnique({
        where: {
          entityType_entityId: {
            entityType: "conversation",
            entityId: conversation.id,
          },
        },
      });

      const previousAssigneeId =
        currentAssignment?.assigneeMemberId ?? conversation.assigneeId;
      const assignee =
        data.operation === "claim"
          ? await resolveConversationAssignee(
              actor,
              actor.workspaceMemberId,
              context.shop,
            )
          : data.operation === "assign"
            ? await resolveConversationAssignee(
                actor,
                data.targetMemberId!,
                context.shop,
              )
            : null;

      if (data.operation === "claim") {
        if (previousAssigneeId === actor.workspaceMemberId) {
          throw new ConflictError("Conversation is already claimed by this member");
        }
        if (previousAssigneeId !== null) {
          throw new ConflictError(
            "Conversation is already assigned; an authorized handover is required",
          );
        }
      }
      if (data.operation === "release") {
        if (previousAssigneeId !== actor.workspaceMemberId) {
          throw new SahelFlowError(
            "A member may release only their own conversation assignment",
            "CONVERSATION_RELEASE_FORBIDDEN",
            403,
          );
        }
      }
      if (
        data.operation === "assign" &&
        previousAssigneeId === assignee?.memberId
      ) {
        throw new ConflictError("Conversation is already assigned to this member");
      }
      if (data.operation === "unassign" && previousAssigneeId === null) {
        throw new ConflictError("Conversation is already unassigned");
      }

      const nextAssigneeId = assignee?.memberId ?? null;
      const activityType: ConversationAssignmentActivityType =
        data.operation === "claim"
          ? "assignment_claimed"
          : data.operation === "release"
            ? "assignment_released"
            : data.operation === "unassign"
              ? "assignment_unassigned"
              : previousAssigneeId === null
                ? "assignment_assigned"
                : "assignment_handed_over";
      const activityPayload = Object.freeze({
        version: 2,
        kind: "conversation_assignment",
        activityType,
        fromMemberId: previousAssigneeId,
        toMemberId: nextAssigneeId,
        toDisplayName: assignee?.displayName ?? null,
        toRole: assignee?.role ?? null,
        queueId: currentAssignment?.queueId ?? null,
        workgroupId: currentAssignment?.workgroupId ?? null,
        reason: data.reason ?? null,
      });
      const occurredAt = new Date();
      const handoverId = commandId;

      await tx.collaborationAssignment.upsert({
        where: {
          entityType_entityId: {
            entityType: "conversation",
            entityId: conversation.id,
          },
        },
        create: {
          entityType: "conversation",
          entityId: conversation.id,
          queueId: currentAssignment?.queueId ?? null,
          workgroupId: currentAssignment?.workgroupId ?? null,
          assigneeMemberId: nextAssigneeId,
          state: "open",
          generation: aggregateVersion,
          updatedByMemberId: actor.workspaceMemberId,
          commandId,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
        update: {
          assigneeMemberId: nextAssigneeId,
          generation: aggregateVersion,
          updatedByMemberId: actor.workspaceMemberId,
          commandId,
          updatedAt: occurredAt,
        },
      });
      await tx.collaborationHandover.create({
        data: {
          id: handoverId,
          entityType: "conversation",
          entityId: conversation.id,
          fromMemberId: previousAssigneeId,
          toMemberId: nextAssigneeId,
          fromQueueId: currentAssignment?.queueId ?? null,
          toQueueId: currentAssignment?.queueId ?? null,
          fromWorkgroupId: currentAssignment?.workgroupId ?? null,
          toWorkgroupId: currentAssignment?.workgroupId ?? null,
          fromState: currentAssignment?.state ?? "open",
          toState: currentAssignment?.state ?? "open",
          reasonJson: data.reason
            ? sealBusinessPayloadWithKey(
                { reason: data.reason },
                collaborationHandoverReasonBinding(
                  commandId,
                  handoverId,
                  "conversation",
                ),
                envelopeKey,
              )
            : null,
          commandId,
          occurredAt,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { assigneeId: nextAssigneeId },
      });
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          body: JSON.stringify(activityPayload),
          direction: "system",
          timestamp: occurredAt,
          messageType: "activity",
          activityType,
        },
      });

      const result: ConversationAssignmentResult = Object.freeze({
        conversationId: conversation.id,
        operation: data.operation,
        previousAssigneeId,
        assignee: assignee
          ? Object.freeze({
              memberId: assignee.memberId,
              personId: assignee.personId,
              displayName: assignee.displayName,
              role: assignee.role,
            })
          : null,
        activityType,
        version: aggregateVersion,
      });

      return {
        result,
        audit: {
          action: "conversation.assignment.changed",
          entity: "conversation",
          entityId: conversation.id,
          before: {
            assigneeId: previousAssigneeId,
            queueId: currentAssignment?.queueId ?? null,
            workgroupId: currentAssignment?.workgroupId ?? null,
          },
          after: {
            assigneeId: nextAssigneeId,
            queueId: currentAssignment?.queueId ?? null,
            workgroupId: currentAssignment?.workgroupId ?? null,
          },
          metadata: {
            operation: data.operation,
            activityType,
            handoverId,
            reasonProvided: Boolean(data.reason),
          },
        },
        events: [
          {
            key: `${commandId}:conversation-assignment`,
            type: "conversation.assignment.changed",
            payload: activityPayload,
            occurredAt,
          },
        ],
        projectionInvalidations: [
          `conversation:${conversation.id}`,
          `collaboration-assignment:conversation:${conversation.id}`,
          "inbox:conversations",
        ],
      };
    },
    {
      authorizeReplay: async ({ principal, storedCommand }) => {
        if (
          !principal.auditActor.startsWith(replayPrefix) ||
          !storedCommand.actor.startsWith(replayPrefix)
        ) {
          throw new SahelFlowError(
            "Only the same durable person may replay this assignment command",
            "BUSINESS_COMMAND_REPLAY_FORBIDDEN",
            403,
          );
        }
      },
    },
  );
}
