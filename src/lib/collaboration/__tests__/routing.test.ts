process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { db, shopContext } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

const harness = vi.hoisted(() => ({
  resolveMember: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

vi.mock("@/lib/identity/collaboration-member", () => ({
  resolveCollaborationMember: harness.resolveMember,
}));

import {
  executeCollaborationRouting,
  getCollaborationRoutingVersion,
} from "../assignment";

const SHOP = shopContext;
const CONTEXT = Object.freeze({ prisma: db, shop: SHOP });

function actorContext(options?: {
  sessionId?: string;
  role?: "owner" | "manager";
}): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: options?.sessionId ?? "session-1",
      role: options?.role ?? "manager",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const TARGET = Object.freeze({
  personId: "8".repeat(32),
  memberId: "9".repeat(32),
  displayName: "Amina",
  role: "operator" as const,
});

async function seedConversation() {
  return rawDb.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Customer",
      sourceId: `routing-${Math.random()}@s.whatsapp.net`,
    },
  });
}

async function seedOrder() {
  const suffix = Math.random().toString().slice(2);
  const customer = await rawDb.customer.create({
    data: {
      name: `Customer ${suffix}`,
      phone: `routing-phone-${suffix}`,
    },
  });
  return rawDb.order.create({
    data: {
      orderNumber: `ROUTING-${suffix}`,
      customerId: customer.id,
      totalPrice: 2500,
      wilaya: "Alger",
      commune: "Alger Centre",
      address: "Test address",
      phone: `0555${suffix.slice(0, 6)}`,
      source: "manual",
    },
  });
}

async function seedGroupAndQueue(entityType: "conversation" | "order") {
  const workgroup = await rawDb.collaborationWorkgroup.create({
    data: {
      id: Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32),
      name: `Group ${Math.random()}`,
      createdByMemberId: "6".repeat(32),
      memberships: {
        create: {
          memberId: TARGET.memberId,
          role: "member",
          addedByMemberId: "6".repeat(32),
        },
      },
    },
  });
  const queue = await rawDb.collaborationQueue.create({
    data: {
      id: Math.random().toString(16).slice(2).padEnd(32, "1").slice(0, 32),
      key: `queue-${Math.random()}`.replace(".", "-"),
      name: `Queue ${Math.random()}`,
      entityType,
      workgroupId: workgroup.id,
      createdByMemberId: "6".repeat(32),
    },
  });
  return { workgroup, queue };
}

beforeEach(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  harness.resolveMember.mockReset().mockResolvedValue(TARGET);
});

afterAll(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("generic collaboration routing", () => {
  it("routes a conversation to an exact queue/member and preserves projections", async () => {
    const conversation = await seedConversation();
    const { workgroup, queue } = await seedGroupAndQueue("conversation");

    const command = await executeCollaborationRouting(
      CONTEXT,
      actorContext(),
      {
        entityType: "conversation",
        entityId: conversation.id,
        targetQueueId: queue.id,
        targetMemberId: TARGET.memberId,
        expectedVersion: 0,
        idempotencyKey: "routing-conversation-1",
        reason: "Evening shift handover",
      },
    );

    expect(command).toMatchObject({
      replayed: false,
      aggregateVersion: 1,
      result: {
        entityType: "conversation",
        entityId: conversation.id,
        queueId: queue.id,
        workgroupId: workgroup.id,
        assigneeMemberId: TARGET.memberId,
        state: "open",
        version: 1,
      },
    });
    expect(
      await rawDb.collaborationAssignment.findUnique({
        where: {
          entityType_entityId: {
            entityType: "conversation",
            entityId: conversation.id,
          },
        },
      }),
    ).toMatchObject({
      queueId: queue.id,
      workgroupId: workgroup.id,
      assigneeMemberId: TARGET.memberId,
      generation: 1,
    });
    expect(
      await rawDb.conversation.findUnique({
        where: { id: conversation.id },
      }),
    ).toMatchObject({
      assigneeId: TARGET.memberId,
      teamId: workgroup.id,
    });
    const handover = await rawDb.collaborationHandover.findFirst({
      where: { entityId: conversation.id },
    });
    expect(handover).toMatchObject({
      toMemberId: TARGET.memberId,
      toQueueId: queue.id,
      toWorkgroupId: workgroup.id,
      fromState: "open",
      toState: "open",
    });
    expect(handover?.reasonJson).not.toContain("Evening shift");
    await expect(
      rawDb.collaborationHandover.update({
        where: { id: handover!.id },
        data: { toMemberId: null },
      }),
    ).rejects.toThrow();
  });

  it("replays across session rotation without a second handover", async () => {
    const conversation = await seedConversation();
    const { queue } = await seedGroupAndQueue("conversation");
    const input = {
      entityType: "conversation" as const,
      entityId: conversation.id,
      targetQueueId: queue.id,
      targetMemberId: TARGET.memberId,
      expectedVersion: 0,
      idempotencyKey: "routing-replay-1",
    };

    const first = await executeCollaborationRouting(
      CONTEXT,
      actorContext({ sessionId: "old-session" }),
      input,
    );
    harness.resolveMember.mockRejectedValue(
      new Error("Replay must not resolve the target again"),
    );
    const replay = await executeCollaborationRouting(
      CONTEXT,
      actorContext({ sessionId: "new-session" }),
      input,
    );

    expect(replay).toMatchObject({
      commandId: first.commandId,
      replayed: true,
      result: first.result,
    });
    expect(await rawDb.collaborationHandover.count()).toBe(1);
    expect(
      await rawDb.message.count({
        where: { conversationId: conversation.id },
      }),
    ).toBe(1);
  });

  it("rejects wrong queue type and a non-member assignee atomically", async () => {
    const conversation = await seedConversation();
    const order = await seedOrder();
    const { workgroup, queue } = await seedGroupAndQueue("order");

    await expect(
      executeCollaborationRouting(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        targetQueueId: queue.id,
        expectedVersion: 0,
        idempotencyKey: "routing-wrong-type",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await rawDb.collaborationWorkgroupMember.deleteMany({
      where: { workgroupId: workgroup.id },
    });
    await expect(
      executeCollaborationRouting(CONTEXT, actorContext(), {
        entityType: "order",
        entityId: order.id,
        targetQueueId: queue.id,
        targetMemberId: TARGET.memberId,
        expectedVersion: 0,
        idempotencyKey: "routing-non-member",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await rawDb.collaborationAssignment.count()).toBe(0);
    expect(await rawDb.collaborationHandover.count()).toBe(0);
  });

  it("allows only one concurrent route for one aggregate version", async () => {
    const conversation = await seedConversation();
    const firstQueue = await seedGroupAndQueue("conversation");
    const secondQueue = await seedGroupAndQueue("conversation");

    const outcomes = await Promise.allSettled([
      executeCollaborationRouting(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        targetQueueId: firstQueue.queue.id,
        targetMemberId: TARGET.memberId,
        expectedVersion: 0,
        idempotencyKey: "routing-concurrent-a",
      }),
      executeCollaborationRouting(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        targetQueueId: secondQueue.queue.id,
        targetMemberId: TARGET.memberId,
        expectedVersion: 0,
        idempotencyKey: "routing-concurrent-b",
      }),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(await rawDb.collaborationHandover.count()).toBe(1);
    expect(
      await getCollaborationRoutingVersion(
        CONTEXT,
        "conversation",
        conversation.id,
      ),
    ).toBe(1);
  });

  it("persists a state-only transition as durable handover history", async () => {
    const order = await seedOrder();

    const command = await executeCollaborationRouting(
      CONTEXT,
      actorContext(),
      {
        entityType: "order",
        entityId: order.id,
        targetState: "closed",
        expectedVersion: 0,
        idempotencyKey: "routing-state-only-close",
        reason: "Operational work completed",
      },
    );

    expect(command.result).toMatchObject({
      entityType: "order",
      entityId: order.id,
      state: "closed",
      version: 1,
    });
    expect(
      await rawDb.collaborationHandover.findFirst({
        where: { entityType: "order", entityId: order.id },
      }),
    ).toMatchObject({
      fromState: "open",
      toState: "closed",
      fromMemberId: null,
      toMemberId: null,
      fromQueueId: null,
      toQueueId: null,
    });
  });
});
