process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { db } from "@/lib/db";
import type { ShopContext } from "@/lib/shops/context";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

const harness = vi.hoisted(() => ({
  resolveMembers: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

vi.mock("@/lib/identity/collaboration-member", () => ({
  resolveCollaborationMembers: harness.resolveMembers,
}));

import {
  executeQueueMutation,
  executeWorkgroupMutation,
} from "../administration";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});
const CONTEXT = Object.freeze({ prisma: db, shop: SHOP });

function actorContext(options?: {
  personId?: string;
  memberId?: string;
  sessionId?: string;
  role?: "owner" | "manager";
}): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: options?.personId ?? "5".repeat(32),
      workspaceMemberId: options?.memberId ?? "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: options?.sessionId ?? "session-1",
      role: options?.role ?? "manager",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const MEMBER_A = Object.freeze({
  personId: "8".repeat(32),
  memberId: "9".repeat(32),
  displayName: "Amina",
  role: "operator" as const,
});
const MEMBER_B = Object.freeze({
  personId: "a".repeat(32),
  memberId: "b".repeat(32),
  displayName: "Nadia",
  role: "viewer" as const,
});

beforeEach(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  harness.resolveMembers.mockReset().mockImplementation(
    async (_actor: unknown, memberIds: readonly string[]) =>
      memberIds.map((memberId) =>
        memberId === MEMBER_A.memberId ? MEMBER_A : MEMBER_B,
      ),
  );
});

afterAll(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("collaboration administration authority", () => {
  it("creates and replays one exact workgroup without duplicate members", async () => {
    const input = {
      operation: "create" as const,
      name: "Confirmation team",
      description: "Handles seller confirmation work",
      memberIds: [MEMBER_A.memberId, MEMBER_B.memberId],
      expectedVersion: 0,
      idempotencyKey: "workgroup-create-1",
    };

    const first = await executeWorkgroupMutation(
      CONTEXT,
      actorContext({ sessionId: "old-session" }),
      input,
    );
    harness.resolveMembers.mockRejectedValue(
      new Error("Replay must not resolve members again"),
    );
    const replay = await executeWorkgroupMutation(
      CONTEXT,
      actorContext({ sessionId: "new-session" }),
      input,
    );

    expect(first).toMatchObject({
      replayed: false,
      aggregateVersion: 1,
      result: {
        operation: "create",
        name: "Confirmation team",
        state: "active",
        activeMemberIds: [MEMBER_A.memberId, MEMBER_B.memberId],
        version: 1,
      },
    });
    expect(replay).toMatchObject({
      commandId: first.commandId,
      replayed: true,
      result: first.result,
    });
    expect(await rawDb.collaborationWorkgroup.count()).toBe(1);
    expect(await rawDb.collaborationWorkgroupMember.count()).toBe(2);
    expect(await rawDb.auditLog.count({
      where: { entityId: first.result.workgroupId },
    })).toBe(1);
  });

  it("blocks workgroup archive until active queues are archived", async () => {
    const actor = actorContext();
    const group = await executeWorkgroupMutation(CONTEXT, actor, {
      operation: "create",
      name: "Inbox team",
      memberIds: [MEMBER_A.memberId],
      expectedVersion: 0,
      idempotencyKey: "workgroup-inbox",
    });
    const queue = await executeQueueMutation(CONTEXT, actor, {
      operation: "create",
      key: "inbox-open",
      name: "Open inbox",
      entityType: "conversation",
      workgroupId: group.result.workgroupId,
      expectedVersion: 0,
      idempotencyKey: "queue-inbox-open",
    });

    await expect(executeWorkgroupMutation(CONTEXT, actor, {
      operation: "archive",
      workgroupId: group.result.workgroupId,
      memberIds: [],
      expectedVersion: 1,
      idempotencyKey: "workgroup-archive-blocked",
    })).rejects.toMatchObject({ statusCode: 409 });

    await executeQueueMutation(CONTEXT, actor, {
      operation: "archive",
      queueId: queue.result.queueId,
      expectedVersion: 1,
      idempotencyKey: "queue-archive-1",
    });
    const archived = await executeWorkgroupMutation(CONTEXT, actor, {
      operation: "archive",
      workgroupId: group.result.workgroupId,
      memberIds: [],
      expectedVersion: 1,
      idempotencyKey: "workgroup-archive-1",
    });
    expect(archived.result.state).toBe("archived");
  });

  it("allows only one concurrent mutation for one workgroup version", async () => {
    const actor = actorContext();
    const group = await executeWorkgroupMutation(CONTEXT, actor, {
      operation: "create",
      name: "Concurrent team",
      memberIds: [MEMBER_A.memberId],
      expectedVersion: 0,
      idempotencyKey: "workgroup-concurrent-create",
    });

    const outcomes = await Promise.allSettled([
      executeWorkgroupMutation(CONTEXT, actor, {
        operation: "add_members",
        workgroupId: group.result.workgroupId,
        memberIds: [MEMBER_B.memberId],
        expectedVersion: 1,
        idempotencyKey: "workgroup-concurrent-add",
      }),
      executeWorkgroupMutation(CONTEXT, actor, {
        operation: "archive",
        workgroupId: group.result.workgroupId,
        memberIds: [],
        expectedVersion: 1,
        idempotencyKey: "workgroup-concurrent-archive",
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await rawDb.auditLog.count({
      where: { entityId: group.result.workgroupId },
    })).toBe(2);
  });

  it("rejects a queue whose entity type does not match routing authority", async () => {
    const queue = await executeQueueMutation(CONTEXT, actorContext(), {
      operation: "create",
      key: "orders-review",
      name: "Orders review",
      entityType: "order",
      workgroupId: null,
      expectedVersion: 0,
      idempotencyKey: "queue-orders-review",
    });
    expect(queue.result).toMatchObject({
      entityType: "order",
      state: "active",
      version: 1,
    });
    await expect(rawDb.$executeRawUnsafe(
      `UPDATE "CollaborationQueue" SET "entityType" = 'invalid' WHERE "id" = '${queue.result.queueId}'`,
    )).rejects.toThrow();
  });
});
