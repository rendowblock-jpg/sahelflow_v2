process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { db } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

const harness = vi.hoisted(() => ({
  resolveAssignee: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return {
    ...actual,
    isTrustedActorContext: vi.fn(() => true),
  };
});

vi.mock("@/lib/identity/conversation-assignee", () => ({
  resolveConversationAssignee: harness.resolveAssignee,
}));

import { executeConversationAssignment } from "../conversation-assignment";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});
const SERVICE_CONTEXT = Object.freeze({ prisma: db, shop: SHOP });

function actorContext(options?: {
  personId?: string;
  memberId?: string;
  sessionId?: string;
  role?: "owner" | "manager" | "operator" | "viewer";
  permissions?: readonly (
    | "conversations.read"
    | "conversations.claim"
    | "conversations.assign"
  )[];
}): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: options?.personId ?? "5".repeat(32),
      workspaceMemberId: options?.memberId ?? "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: options?.sessionId ?? "session-1",
      role: options?.role ?? "operator",
      ...(options?.permissions ? { permissions: options.permissions } : {}),
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const SELF = Object.freeze({
  personId: "5".repeat(32),
  memberId: "6".repeat(32),
  displayName: "Amina",
  role: "operator" as const,
});

const TARGET = Object.freeze({
  personId: "8".repeat(32),
  memberId: "9".repeat(32),
  displayName: "Nadia",
  role: "operator" as const,
});

async function seedConversation(assigneeId: string | null = null) {
  return rawDb.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Customer",
      contactPhone: "0555000111",
      sourceId: `jid-${Math.random()}@s.whatsapp.net`,
      assigneeId,
    },
  });
}

beforeEach(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  harness.resolveAssignee.mockReset().mockImplementation(
    async (_actor: unknown, memberId: string) =>
      memberId === SELF.memberId ? SELF : TARGET,
  );
});

afterAll(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("conversation assignment command", () => {
  it("claims an unassigned conversation atomically with trusted audit and activity", async () => {
    const conversation = await seedConversation();
    const actor = actorContext();

    const command = await executeConversationAssignment(
      SERVICE_CONTEXT,
      actor,
      {
        conversationId: conversation.id,
        operation: "claim",
        expectedVersion: 0,
        idempotencyKey: "claim-conversation-1",
      },
    );

    expect(command).toMatchObject({
      aggregateVersion: 1,
      replayed: false,
      result: {
        conversationId: conversation.id,
        operation: "claim",
        previousAssigneeId: null,
        assignee: { memberId: SELF.memberId },
        activityType: "assignment_claimed",
        version: 1,
      },
    });
    expect(
      await rawDb.conversation.findUnique({ where: { id: conversation.id } }),
    ).toMatchObject({ assigneeId: SELF.memberId });
    const activity = await rawDb.message.findFirst({
      where: { conversationId: conversation.id },
    });
    expect(activity).toMatchObject({
      messageType: "activity",
      activityType: "assignment_claimed",
      direction: "system",
    });
    expect(JSON.parse(activity!.body)).toMatchObject({
      kind: "conversation_assignment",
      fromMemberId: null,
      toMemberId: SELF.memberId,
    });
    const audit = await rawDb.auditLog.findFirst({
      where: { entityId: conversation.id },
    });
    expect(audit).toMatchObject({
      action: "conversation.assignment.changed",
      actor: expect.stringContaining(`person:${SELF.personId}:session:`),
    });
    expect(
      await rawDb.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count FROM "DomainEvent"
        WHERE "aggregateId" = ${conversation.id}
          AND "eventType" = 'conversation.assignment.changed'
      `,
    ).toEqual([{ count: 1n }]);
  });

  it("replays once across session rotation without duplicate facts", async () => {
    const conversation = await seedConversation();
    const input = {
      conversationId: conversation.id,
      operation: "claim" as const,
      expectedVersion: 0,
      idempotencyKey: "claim-conversation-replay",
    };

    const first = await executeConversationAssignment(
      SERVICE_CONTEXT,
      actorContext({ sessionId: "session-old" }),
      input,
    );
    harness.resolveAssignee.mockRejectedValue(
      new Error("Replay must not re-resolve the target"),
    );
    const replay = await executeConversationAssignment(
      SERVICE_CONTEXT,
      actorContext({ sessionId: "session-new" }),
      input,
    );

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({
      commandId: first.commandId,
      aggregateVersion: 1,
      replayed: true,
      result: first.result,
    });
    expect(
      await rawDb.message.count({ where: { conversationId: conversation.id } }),
    ).toBe(1);
    expect(
      await rawDb.auditLog.count({ where: { entityId: conversation.id } }),
    ).toBe(1);
  });

  it("allows a manager to hand over to one exact active member", async () => {
    const conversation = await seedConversation(SELF.memberId);
    const manager = actorContext({
      personId: "a".repeat(32),
      memberId: "b".repeat(32),
      role: "manager",
    });

    const command = await executeConversationAssignment(
      SERVICE_CONTEXT,
      manager,
      {
        conversationId: conversation.id,
        operation: "assign",
        targetMemberId: TARGET.memberId,
        reason: "Shift handover",
        expectedVersion: 0,
        idempotencyKey: "handover-conversation-1",
      },
    );

    expect(command.result).toMatchObject({
      previousAssigneeId: SELF.memberId,
      assignee: { memberId: TARGET.memberId, displayName: "Nadia" },
      activityType: "assignment_handed_over",
      version: 1,
    });
    expect(
      await rawDb.conversation.findUnique({ where: { id: conversation.id } }),
    ).toMatchObject({ assigneeId: TARGET.memberId });
  });

  it("lets an operator release only their own assignment", async () => {
    const conversation = await seedConversation(SELF.memberId);

    const released = await executeConversationAssignment(
      SERVICE_CONTEXT,
      actorContext(),
      {
        conversationId: conversation.id,
        operation: "release",
        expectedVersion: 0,
        idempotencyKey: "release-conversation-1",
      },
    );
    expect(released.result).toMatchObject({
      assignee: null,
      activityType: "assignment_released",
    });

    const another = await seedConversation(TARGET.memberId);
    await expect(
      executeConversationAssignment(
        SERVICE_CONTEXT,
        actorContext(),
        {
          conversationId: another.id,
          operation: "release",
          expectedVersion: 0,
          idempotencyKey: "release-conversation-forbidden",
        },
      ),
    ).rejects.toMatchObject({
      code: "CONVERSATION_RELEASE_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("denies operator assignment before target resolution or mutation", async () => {
    const conversation = await seedConversation();

    await expect(
      executeConversationAssignment(
        SERVICE_CONTEXT,
        actorContext(),
        {
          conversationId: conversation.id,
          operation: "assign",
          targetMemberId: TARGET.memberId,
          expectedVersion: 0,
          idempotencyKey: "operator-assign-forbidden",
        },
      ),
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN", statusCode: 403 });
    expect(harness.resolveAssignee).not.toHaveBeenCalled();
    expect(
      await rawDb.conversation.findUnique({ where: { id: conversation.id } }),
    ).toMatchObject({ assigneeId: null });
  });

  it("allows exactly one concurrent command for the same expected version", async () => {
    const conversation = await seedConversation();
    const manager = actorContext({ role: "manager" });

    const outcomes = await Promise.allSettled([
      executeConversationAssignment(
        SERVICE_CONTEXT,
        manager,
        {
          conversationId: conversation.id,
          operation: "assign",
          targetMemberId: TARGET.memberId,
          expectedVersion: 0,
          idempotencyKey: "concurrent-assignment-a",
        },
      ),
      executeConversationAssignment(
        SERVICE_CONTEXT,
        manager,
        {
          conversationId: conversation.id,
          operation: "unassign",
          expectedVersion: 0,
          idempotencyKey: "concurrent-assignment-b",
        },
      ),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(
      await rawDb.message.count({ where: { conversationId: conversation.id } }),
    ).toBe(1);
    expect(
      await rawDb.auditLog.count({ where: { entityId: conversation.id } }),
    ).toBe(1);
  });
});
