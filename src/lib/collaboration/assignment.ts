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
import { assertTrustedAction } from "@/lib/identity/authorization";
import { resolveCollaborationMember } from "@/lib/identity/collaboration-member";
import {
  isTrustedActorContext,
  type PersonActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";
import type { CollaborationContext } from "./administration";

const exactId = z.string().regex(/^[0-9a-f]{32}$/i);
const entityType = z.enum(["conversation", "order", "confirmation"]);

export const collaborationRoutingSchema = z
  .object({
    entityType,
    entityId: z.string().trim().min(1).max(256),
    targetQueueId: exactId.optional().nullable(),
    targetMemberId: exactId.optional().nullable(),
    clearQueue: z.boolean().default(false),
    clearAssignee: z.boolean().default(false),
    targetState: z.enum(["open", "closed"]).optional(),
    expectedVersion: z.number().int().nonnegative().safe(),
    idempotencyKey: z.string().trim().min(8).max(200),
    correlationId: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((value, refinement) => {
    if (value.targetQueueId && value.clearQueue) {
      refinement.addIssue({
        code: "custom",
        path: ["targetQueueId"],
        message: "Queue cannot be selected and cleared in the same command",
      });
    }
    if (value.targetMemberId && value.clearAssignee) {
      refinement.addIssue({
        code: "custom",
        path: ["targetMemberId"],
        message: "Assignee cannot be selected and cleared in the same command",
      });
    }
    if (
      value.targetQueueId == null &&
      value.targetMemberId == null &&
      !value.clearQueue &&
      !value.clearAssignee &&
      value.targetState === undefined
    ) {
      refinement.addIssue({
        code: "custom",
        path: ["entityId"],
        message: "Routing command does not contain a state change",
      });
    }
  });

export type CollaborationRoutingInput = z.infer<typeof collaborationRoutingSchema>;

export type CollaborationRoutingResult = Readonly<{
  entityType: CollaborationRoutingInput["entityType"];
  entityId: string;
  queueId: string | null;
  workgroupId: string | null;
  assigneeMemberId: string | null;
  state: "open" | "closed";
  version: number;
}>;

function assertContext(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  type: CollaborationRoutingInput["entityType"],
): PersonActor {
  if (!isTrustedActorContext(actorContext) || actorContext.actor.kind !== "person") {
    throw new SahelFlowError(
      "Collaboration routing requires a server-minted person actor",
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
      "Collaboration routing context does not match the trusted shop",
      "TRUSTED_ACTOR_SHOP_MISMATCH",
      409,
    );
  }
  assertTrustedAction(
    actorContext,
    type === "conversation" ? "conversations.assign" : "orders.assign",
    { shopId: context.shop.shopId },
  );
  return actorContext.actor;
}

function aggregateType(type: CollaborationRoutingInput["entityType"]): string {
  if (type === "conversation") return "conversation-assignment";
  if (type === "confirmation") return "confirmation-assignment";
  return "order-assignment";
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
        "Only the same durable person may replay this routing command",
        "BUSINESS_COMMAND_REPLAY_FORBIDDEN",
        403,
      );
    }
  };
}

async function assertEntityExists(
  tx: Parameters<Parameters<CollaborationContext["prisma"]["$transaction"]>[0]>[0],
  type: CollaborationRoutingInput["entityType"],
  id: string,
): Promise<{ legacyAssigneeId: string | null }> {
  if (type === "conversation") {
    const row = await tx.conversation.findUnique({
      where: { id },
      select: { id: true, assigneeId: true },
    });
    if (!row) throw new NotFoundError("Conversation", id);
    return { legacyAssigneeId: row.assigneeId };
  }
  const row = await tx.order.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError("Order", id);
  return { legacyAssigneeId: null };
}

export async function getCollaborationRoutingVersion(
  context: CollaborationContext,
  type: CollaborationRoutingInput["entityType"],
  id: string,
): Promise<number> {
  const rows = await context.prisma.$queryRaw<Array<{ version: number | bigint }>>`
    SELECT "version"
    FROM "BusinessAggregateVersion"
    WHERE "aggregateType" = ${aggregateType(type)}
      AND "aggregateId" = ${id}
    LIMIT 1
  `;
  return Number(rows[0]?.version ?? 0);
}

export async function executeCollaborationRouting(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  input: unknown,
): Promise<BusinessCommandResult<CollaborationRoutingResult>> {
  const data = collaborationRoutingSchema.parse(input);
  const actor = assertContext(context, actorContext, data.entityType);
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const correlationId = data.correlationId ?? randomUUID();
  const businessContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };

  return executeBusinessCommand(
    businessContext,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `collaboration.routing.${data.entityType}.v1`,
      aggregate: {
        type: aggregateType(data.entityType),
        id: data.entityId,
        expectedVersion: data.expectedVersion,
      },
      actor: `workspace-member:${actor.workspaceMemberId}`,
      correlationId,
      payload: {
        entityType: data.entityType,
        entityId: data.entityId,
        targetQueueId: data.targetQueueId ?? null,
        targetMemberId: data.targetMemberId ?? null,
        clearQueue: data.clearQueue,
        clearAssignee: data.clearAssignee,
        targetState: data.targetState ?? null,
        reason: data.reason ?? null,
      },
    },
    async ({ tx, commandId, aggregateVersion }) => {
      const { legacyAssigneeId } = await assertEntityExists(
        tx,
        data.entityType,
        data.entityId,
      );
      const targetMember = data.targetMemberId
        ? await resolveCollaborationMember(
            actor,
            data.targetMemberId,
            context.shop,
            { allowViewer: false },
          )
        : null;
      const current = await tx.collaborationAssignment.findUnique({
        where: {
          entityType_entityId: {
            entityType: data.entityType,
            entityId: data.entityId,
          },
        },
      });
      const previousAssigneeId = current?.assigneeMemberId ?? legacyAssigneeId;
      const previousQueueId = current?.queueId ?? null;
      const previousWorkgroupId = current?.workgroupId ?? null;
      const previousState = (current?.state ?? "open") as "open" | "closed";

      const queue = data.targetQueueId
        ? await tx.collaborationQueue.findFirst({
            where: {
              id: data.targetQueueId,
              state: "active",
              entityType: data.entityType,
            },
          })
        : null;
      if (data.targetQueueId && !queue) {
        throw new ValidationError(
          "The selected queue is missing, archived or belongs to another entity type",
          "targetQueueId",
        );
      }

      const nextQueueId = data.clearQueue
        ? null
        : queue?.id ?? previousQueueId;
      const nextWorkgroupId = data.clearQueue
        ? null
        : queue?.workgroupId ?? previousWorkgroupId;
      const nextAssigneeId = data.clearAssignee
        ? null
        : targetMember?.memberId ?? previousAssigneeId;
      const nextState = data.targetState ?? previousState;

      if (nextWorkgroupId && nextAssigneeId) {
        const membership = await tx.collaborationWorkgroupMember.findFirst({
          where: {
            workgroupId: nextWorkgroupId,
            memberId: nextAssigneeId,
            removedAt: null,
          },
          select: { memberId: true },
        });
        if (!membership) {
          throw new ConflictError(
            "The selected assignee is not active in the queue workgroup",
          );
        }
      }
      if (
        previousQueueId === nextQueueId &&
        previousWorkgroupId === nextWorkgroupId &&
        previousAssigneeId === nextAssigneeId &&
        previousState === nextState
      ) {
        throw new ConflictError("Routing command does not change current state");
      }

      const occurredAt = new Date();
      const handoverId = commandId;
      await tx.collaborationAssignment.upsert({
        where: {
          entityType_entityId: {
            entityType: data.entityType,
            entityId: data.entityId,
          },
        },
        create: {
          entityType: data.entityType,
          entityId: data.entityId,
          queueId: nextQueueId,
          workgroupId: nextWorkgroupId,
          assigneeMemberId: nextAssigneeId,
          state: nextState,
          generation: aggregateVersion,
          updatedByMemberId: actor.workspaceMemberId,
          commandId,
          createdAt: occurredAt,
          updatedAt: occurredAt,
        },
        update: {
          queueId: nextQueueId,
          workgroupId: nextWorkgroupId,
          assigneeMemberId: nextAssigneeId,
          state: nextState,
          generation: aggregateVersion,
          updatedByMemberId: actor.workspaceMemberId,
          commandId,
          updatedAt: occurredAt,
        },
      });
      await tx.collaborationHandover.create({
        data: {
          id: handoverId,
          entityType: data.entityType,
          entityId: data.entityId,
          fromMemberId: previousAssigneeId,
          toMemberId: nextAssigneeId,
          fromQueueId: previousQueueId,
          toQueueId: nextQueueId,
          fromWorkgroupId: previousWorkgroupId,
          toWorkgroupId: nextWorkgroupId,
          reasonJson: data.reason
            ? sealBusinessPayloadWithKey(
                { reason: data.reason },
                collaborationHandoverReasonBinding(
                  commandId,
                  handoverId,
                  data.entityType,
                ),
                envelopeKey,
              )
            : null,
          commandId,
          occurredAt,
        },
      });
      if (data.entityType === "conversation") {
        await tx.conversation.update({
          where: { id: data.entityId },
          data: { assigneeId: nextAssigneeId, teamId: nextWorkgroupId },
        });
        await tx.message.create({
          data: {
            conversationId: data.entityId,
            body: JSON.stringify({
              version: 1,
              kind: "collaboration_routing",
              fromMemberId: previousAssigneeId,
              toMemberId: nextAssigneeId,
              fromQueueId: previousQueueId,
              toQueueId: nextQueueId,
              fromWorkgroupId: previousWorkgroupId,
              toWorkgroupId: nextWorkgroupId,
              state: nextState,
              reason: data.reason ?? null,
            }),
            direction: "system",
            timestamp: occurredAt,
            messageType: "activity",
            activityType: "collaboration_routed",
          },
        });
      }

      const result: CollaborationRoutingResult = Object.freeze({
        entityType: data.entityType,
        entityId: data.entityId,
        queueId: nextQueueId,
        workgroupId: nextWorkgroupId,
        assigneeMemberId: nextAssigneeId,
        state: nextState,
        version: aggregateVersion,
      });
      return {
        result,
        audit: {
          action: "collaboration.routing.changed",
          entity: data.entityType,
          entityId: data.entityId,
          before: {
            queueId: previousQueueId,
            workgroupId: previousWorkgroupId,
            assigneeMemberId: previousAssigneeId,
            state: previousState,
          },
          after: {
            queueId: nextQueueId,
            workgroupId: nextWorkgroupId,
            assigneeMemberId: nextAssigneeId,
            state: nextState,
          },
          metadata: {
            handoverId,
            reasonProvided: Boolean(data.reason),
          },
        },
        events: [
          {
            key: `${commandId}:collaboration-routing`,
            type: "collaboration.routing.changed",
            payload: {
              entityType: data.entityType,
              entityId: data.entityId,
              queueId: nextQueueId,
              workgroupId: nextWorkgroupId,
              assigneeMemberId: nextAssigneeId,
              state: nextState,
            },
            occurredAt,
          },
        ],
        projectionInvalidations: [
          `collaboration-assignment:${data.entityType}:${data.entityId}`,
          `${data.entityType}:${data.entityId}`,
          `queue:${nextQueueId ?? "unassigned"}`,
        ],
      };
    },
    { authorizeReplay: samePersonReplay(actor.personId) },
  );
}
