import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessCommandResult } from "@/lib/business-truth/contracts";
import {
  businessPrincipalFromTrustedActor,
  type BusinessPrincipalContext,
} from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { resolveCollaborationMembers } from "@/lib/identity/collaboration-member";
import {
  isTrustedActorContext,
  type PersonActor,
  type TrustedActorContext,
} from "@/lib/identity/trusted-actor";
import type { ShopContext } from "@/lib/shops/context";
import {
  ConflictError,
  NotFoundError,
  SahelFlowError,
  ValidationError,
} from "@/types/errors";

export type CollaborationContext = ServiceContext & { readonly shop: ShopContext };

const exactId = z.string().regex(/^[0-9a-f]{32}$/i);
const idempotencyKey = z.string().trim().min(8).max(200);
const expectedVersion = z.number().int().nonnegative().safe();
const name = z.string().trim().min(1).max(100);
const description = z.string().trim().max(500).optional().nullable();
const memberIds = z.array(exactId).max(25).default([]);

export const workgroupMutationSchema = z
  .object({
    operation: z.enum(["create", "archive", "add_members", "remove_members"]),
    workgroupId: exactId.optional(),
    name: name.optional(),
    description,
    memberIds,
    expectedVersion,
    idempotencyKey,
    correlationId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((value, refinement) => {
    if (value.operation === "create" && !value.name) {
      refinement.addIssue({ code: "custom", path: ["name"], message: "Workgroup name is required" });
    }
    if (value.operation !== "create" && !value.workgroupId) {
      refinement.addIssue({ code: "custom", path: ["workgroupId"], message: "Workgroup ID is required" });
    }
    if (
      (value.operation === "add_members" || value.operation === "remove_members") &&
      value.memberIds.length === 0
    ) {
      refinement.addIssue({ code: "custom", path: ["memberIds"], message: "At least one member is required" });
    }
  });

export type WorkgroupMutationInput = z.infer<typeof workgroupMutationSchema>;

export const queueMutationSchema = z
  .object({
    operation: z.enum(["create", "archive"]),
    queueId: exactId.optional(),
    key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/).optional(),
    name: name.optional(),
    description,
    entityType: z.enum(["conversation", "order", "confirmation"]).optional(),
    workgroupId: exactId.optional().nullable(),
    expectedVersion,
    idempotencyKey,
    correlationId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((value, refinement) => {
    if (value.operation === "create") {
      if (!value.key) refinement.addIssue({ code: "custom", path: ["key"], message: "Queue key is required" });
      if (!value.name) refinement.addIssue({ code: "custom", path: ["name"], message: "Queue name is required" });
      if (!value.entityType) refinement.addIssue({ code: "custom", path: ["entityType"], message: "Queue entity type is required" });
    } else if (!value.queueId) {
      refinement.addIssue({ code: "custom", path: ["queueId"], message: "Queue ID is required" });
    }
  });

export type QueueMutationInput = z.infer<typeof queueMutationSchema>;

export type WorkgroupMutationResult = Readonly<{
  workgroupId: string;
  operation: WorkgroupMutationInput["operation"];
  name: string;
  state: "active" | "archived";
  activeMemberIds: readonly string[];
  version: number;
}>;

export type QueueMutationResult = Readonly<{
  queueId: string;
  operation: QueueMutationInput["operation"];
  key: string;
  name: string;
  entityType: "conversation" | "order" | "confirmation";
  workgroupId: string | null;
  state: "active" | "archived";
  version: number;
}>;

function assertExecutionContext(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  action: "workgroups.manage" | "queues.manage",
): PersonActor {
  if (!isTrustedActorContext(actorContext) || actorContext.actor.kind !== "person") {
    throw new SahelFlowError(
      "Collaboration administration requires a server-minted person actor",
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
      "Collaboration administration context does not match the trusted shop",
      "TRUSTED_ACTOR_SHOP_MISMATCH",
      409,
    );
  }
  assertTrustedAction(actorContext, action, { shopId: context.shop.shopId });
  return actorContext.actor;
}

function deterministicId(kind: string, shop: ShopContext, requestKey: string): string {
  return createHash("sha256")
    .update(`${kind}:${shop.workspaceId}:${shop.installationId}:${shop.shopId}:${requestKey}`, "utf8")
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
        "Only the same durable person may replay this collaboration command",
        "BUSINESS_COMMAND_REPLAY_FORBIDDEN",
        403,
      );
    }
  };
}

export async function executeWorkgroupMutation(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  input: unknown,
): Promise<BusinessCommandResult<WorkgroupMutationResult>> {
  const actor = assertExecutionContext(context, actorContext, "workgroups.manage");
  const data = workgroupMutationSchema.parse(input);
  const workgroupId = data.operation === "create"
    ? deterministicId("workgroup", context.shop, data.idempotencyKey)
    : data.workgroupId!;
  const correlationId = data.correlationId ?? randomUUID();
  const businessContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };

  return executeBusinessCommand(
    businessContext,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `collaboration.workgroup.${data.operation}.v1`,
      aggregate: {
        type: "collaboration-workgroup",
        id: workgroupId,
        expectedVersion: data.expectedVersion,
      },
      actor: `workspace-member:${actor.workspaceMemberId}`,
      correlationId,
      payload: {
        operation: data.operation,
        workgroupId,
        name: data.name ?? null,
        description: data.description ?? null,
        memberIds: data.memberIds,
      },
    },
    async ({ tx, aggregateVersion }) => {
      const members =
        data.operation === "create" || data.operation === "add_members"
          ? await resolveCollaborationMembers(
              actor,
              data.memberIds,
              context.shop,
              { allowViewer: true },
            )
          : [];
      const now = new Date();
      if (data.operation === "create") {
        const duplicate = await tx.collaborationWorkgroup.findUnique({
          where: { name: data.name! },
          select: { id: true },
        });
        if (duplicate) throw new ConflictError("A workgroup with this name already exists");
        await tx.collaborationWorkgroup.create({
          data: {
            id: workgroupId,
            name: data.name!,
            description: data.description ?? null,
            createdByMemberId: actor.workspaceMemberId,
            memberships: {
              create: members.map((member) => ({
                memberId: member.memberId,
                role: "member",
                addedByMemberId: actor.workspaceMemberId,
              })),
            },
          },
        });
      } else {
        const existing = await tx.collaborationWorkgroup.findUnique({
          where: { id: workgroupId },
          include: { memberships: true },
        });
        if (!existing) throw new NotFoundError("CollaborationWorkgroup", workgroupId);
        if (existing.state === "archived") {
          throw new ConflictError("Archived workgroups cannot be changed");
        }

        if (data.operation === "archive") {
          const [activeQueues, openAssignments] = await Promise.all([
            tx.collaborationQueue.count({ where: { workgroupId, state: "active" } }),
            tx.collaborationAssignment.count({ where: { workgroupId, state: "open" } }),
          ]);
          if (activeQueues > 0 || openAssignments > 0) {
            throw new ConflictError(
              "Move or archive active queues and assignments before archiving this workgroup",
            );
          }
          await tx.collaborationWorkgroup.update({
            where: { id: workgroupId },
            data: {
              state: "archived",
              archivedAt: now,
              archivedByMemberId: actor.workspaceMemberId,
            },
          });
        } else if (data.operation === "add_members") {
          for (const member of members) {
            const current = existing.memberships.find(
              (entry) => entry.memberId === member.memberId,
            );
            if (current?.removedAt === null) {
              throw new ConflictError(`Member '${member.memberId}' is already active in the workgroup`);
            }
            await tx.collaborationWorkgroupMember.upsert({
              where: {
                workgroupId_memberId: { workgroupId, memberId: member.memberId },
              },
              create: {
                workgroupId,
                memberId: member.memberId,
                role: "member",
                addedByMemberId: actor.workspaceMemberId,
              },
              update: {
                role: "member",
                addedByMemberId: actor.workspaceMemberId,
                removedAt: null,
                removedByMemberId: null,
                createdAt: now,
              },
            });
          }
        } else {
          for (const memberId of [...new Set(data.memberIds)]) {
            const updated = await tx.collaborationWorkgroupMember.updateMany({
              where: { workgroupId, memberId, removedAt: null },
              data: {
                removedAt: now,
                removedByMemberId: actor.workspaceMemberId,
              },
            });
            if (updated.count !== 1) {
              throw new ConflictError(`Member '${memberId}' is not active in the workgroup`);
            }
            const blockingAssignments = await tx.collaborationAssignment.count({
              where: {
                workgroupId,
                assigneeMemberId: memberId,
                state: "open",
              },
            });
            if (blockingAssignments > 0) {
              throw new ConflictError(
                `Member '${memberId}' still owns open work in this workgroup`,
              );
            }
          }
        }
      }

      const final = await tx.collaborationWorkgroup.findUnique({
        where: { id: workgroupId },
        include: { memberships: true },
      });
      if (!final) throw new NotFoundError("CollaborationWorkgroup", workgroupId);
      const activeMemberIds = final.memberships
        .filter((entry) => entry.removedAt === null)
        .map((entry) => entry.memberId)
        .sort();
      const result: WorkgroupMutationResult = Object.freeze({
        workgroupId,
        operation: data.operation,
        name: final.name,
        state: final.state as "active" | "archived",
        activeMemberIds: Object.freeze(activeMemberIds),
        version: aggregateVersion,
      });

      return {
        result,
        audit: {
          action: "collaboration.workgroup.changed",
          entity: "collaboration-workgroup",
          entityId: workgroupId,
          after: {
            operation: data.operation,
            name: final.name,
            state: final.state,
            activeMemberIds,
          },
        },
        events: [
          {
            key: `${workgroupId}:${aggregateVersion}`,
            type: "collaboration.workgroup.changed",
            payload: {
              operation: data.operation,
              workgroupId,
              state: final.state,
              activeMemberIds,
            },
          },
        ],
        projectionInvalidations: ["collaboration:administration", `workgroup:${workgroupId}`],
      };
    },
    { authorizeReplay: samePersonReplay(actor.personId) },
  );
}

export async function executeQueueMutation(
  context: CollaborationContext,
  actorContext: TrustedActorContext,
  input: unknown,
): Promise<BusinessCommandResult<QueueMutationResult>> {
  const actor = assertExecutionContext(context, actorContext, "queues.manage");
  const data = queueMutationSchema.parse(input);
  const queueId = data.operation === "create"
    ? deterministicId("queue", context.shop, data.idempotencyKey)
    : data.queueId!;
  const correlationId = data.correlationId ?? randomUUID();
  const businessContext: BusinessPrincipalContext = {
    ...context,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };

  return executeBusinessCommand(
    businessContext,
    {
      idempotencyKey: data.idempotencyKey,
      commandType: `collaboration.queue.${data.operation}.v1`,
      aggregate: {
        type: "collaboration-queue",
        id: queueId,
        expectedVersion: data.expectedVersion,
      },
      actor: `workspace-member:${actor.workspaceMemberId}`,
      correlationId,
      payload: {
        operation: data.operation,
        queueId,
        key: data.key ?? null,
        name: data.name ?? null,
        description: data.description ?? null,
        entityType: data.entityType ?? null,
        workgroupId: data.workgroupId ?? null,
      },
    },
    async ({ tx, aggregateVersion }) => {
      const now = new Date();
      if (data.operation === "create") {
        if (data.workgroupId) {
          const workgroup = await tx.collaborationWorkgroup.findFirst({
            where: { id: data.workgroupId, state: "active" },
            select: { id: true },
          });
          if (!workgroup) {
            throw new ValidationError(
              "The selected workgroup is missing or archived",
              "workgroupId",
            );
          }
        }
        const duplicate = await tx.collaborationQueue.findUnique({
          where: { key: data.key! },
          select: { id: true },
        });
        if (duplicate) throw new ConflictError("A queue with this key already exists");
        await tx.collaborationQueue.create({
          data: {
            id: queueId,
            key: data.key!,
            name: data.name!,
            description: data.description ?? null,
            entityType: data.entityType!,
            workgroupId: data.workgroupId ?? null,
            createdByMemberId: actor.workspaceMemberId,
          },
        });
      } else {
        const existing = await tx.collaborationQueue.findUnique({
          where: { id: queueId },
        });
        if (!existing) throw new NotFoundError("CollaborationQueue", queueId);
        if (existing.state === "archived") {
          throw new ConflictError("Queue is already archived");
        }
        const openAssignments = await tx.collaborationAssignment.count({
          where: { queueId, state: "open" },
        });
        if (openAssignments > 0) {
          throw new ConflictError("Move open assignments before archiving this queue");
        }
        await tx.collaborationQueue.update({
          where: { id: queueId },
          data: {
            state: "archived",
            archivedAt: now,
            archivedByMemberId: actor.workspaceMemberId,
          },
        });
      }

      const final = await tx.collaborationQueue.findUnique({ where: { id: queueId } });
      if (!final) throw new NotFoundError("CollaborationQueue", queueId);
      const result: QueueMutationResult = Object.freeze({
        queueId,
        operation: data.operation,
        key: final.key,
        name: final.name,
        entityType: final.entityType as QueueMutationResult["entityType"],
        workgroupId: final.workgroupId,
        state: final.state as "active" | "archived",
        version: aggregateVersion,
      });

      return {
        result,
        audit: {
          action: "collaboration.queue.changed",
          entity: "collaboration-queue",
          entityId: queueId,
          after: {
            operation: data.operation,
            key: final.key,
            entityType: final.entityType,
            workgroupId: final.workgroupId,
            state: final.state,
          },
        },
        events: [
          {
            key: `${queueId}:${aggregateVersion}`,
            type: "collaboration.queue.changed",
            payload: {
              operation: data.operation,
              queueId,
              entityType: final.entityType,
              workgroupId: final.workgroupId,
              state: final.state,
            },
          },
        ],
        projectionInvalidations: ["collaboration:administration", `queue:${queueId}`],
      };
    },
    { authorizeReplay: samePersonReplay(actor.personId) },
  );
}

export async function getCollaborationAdministrationView(
  context: CollaborationContext,
): Promise<Readonly<{
  workgroups: readonly unknown[];
  queues: readonly unknown[];
}>> {
  const [workgroups, queues] = await Promise.all([
    context.prisma.collaborationWorkgroup.findMany({
      orderBy: [{ state: "asc" }, { name: "asc" }],
      include: {
        memberships: {
          where: { removedAt: null },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    context.prisma.collaborationQueue.findMany({
      orderBy: [{ state: "asc" }, { entityType: "asc" }, { name: "asc" }],
    }),
  ]);
  return Object.freeze({
    workgroups: Object.freeze(workgroups),
    queues: Object.freeze(queues),
  });
}
