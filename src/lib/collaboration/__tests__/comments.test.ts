process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { db, shopContext } from "@/lib/db";
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
  executeInternalComment,
  getInternalCommentVersion,
  listInternalComments,
} from "../comments";

const SHOP = shopContext;
const CONTEXT = Object.freeze({ prisma: db, shop: SHOP });

function actorContext(sessionId = "session-1"): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId,
      role: "operator",
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const MENTION = Object.freeze({
  personId: "8".repeat(32),
  memberId: "9".repeat(32),
  displayName: "Nadia",
  role: "viewer" as const,
});

async function seedConversation() {
  return rawDb.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Customer",
      sourceId: `comment-${Math.random()}@s.whatsapp.net`,
    },
  });
}

beforeEach(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  harness.resolveMembers.mockReset().mockResolvedValue([MENTION]);
});

afterAll(async () => {
  await rawDb.message.deleteMany();
  await rawDb.conversation.deleteMany();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("internal collaboration comments", () => {
  it("encrypts comment text and returns a decrypted append-only timeline", async () => {
    const conversation = await seedConversation();
    const created = await executeInternalComment(CONTEXT, actorContext(), {
      entityType: "conversation",
      entityId: conversation.id,
      body: "Customer requested a call after 18:00",
      mentionMemberIds: [MENTION.memberId],
      expectedVersion: 0,
      idempotencyKey: "comment-create-1",
    });

    expect(created).toMatchObject({
      replayed: false,
      aggregateVersion: 1,
      result: {
        entityId: conversation.id,
        body: "Customer requested a call after 18:00",
        mentionMemberIds: [MENTION.memberId],
        version: 1,
      },
    });
    const raw = await rawDb.collaborationComment.findUnique({
      where: { id: created.result.commentId },
    });
    expect(raw?.bodyJson).not.toContain("requested a call");
    expect(await rawDb.collaborationMention.findMany()).toEqual([
      expect.objectContaining({
        commentId: created.result.commentId,
        memberId: MENTION.memberId,
      }),
    ]);

    const timeline = await listInternalComments(
      CONTEXT,
      "conversation",
      conversation.id,
    );
    expect(timeline).toEqual([
      expect.objectContaining({
        id: created.result.commentId,
        body: "Customer requested a call after 18:00",
        mentionMemberIds: [MENTION.memberId],
      }),
    ]);
    await expect(
      rawDb.collaborationComment.update({
        where: { id: created.result.commentId },
        data: { authorMemberId: "a".repeat(32) },
      }),
    ).rejects.toBeDefined();
    expect(
      await rawDb.collaborationComment.findUnique({
        where: { id: created.result.commentId },
        select: { authorMemberId: true },
      }),
    ).toEqual({ authorMemberId: "6".repeat(32) });
  });

  it("replays across session rotation without duplicating comment or mention", async () => {
    const conversation = await seedConversation();
    const input = {
      entityType: "conversation" as const,
      entityId: conversation.id,
      body: "Verify address before booking",
      mentionMemberIds: [MENTION.memberId],
      expectedVersion: 0,
      idempotencyKey: "comment-replay-1",
    };

    const first = await executeInternalComment(
      CONTEXT,
      actorContext("old-session"),
      input,
    );
    harness.resolveMembers.mockRejectedValue(
      new Error("Replay must not resolve mentions again"),
    );
    const replay = await executeInternalComment(
      CONTEXT,
      actorContext("new-session"),
      input,
    );

    expect(replay).toMatchObject({
      commandId: first.commandId,
      replayed: true,
      result: first.result,
    });
    expect(await rawDb.collaborationComment.count()).toBe(1);
    expect(await rawDb.collaborationMention.count()).toBe(1);
    expect(
      await getInternalCommentVersion(
        CONTEXT,
        "conversation",
        conversation.id,
      ),
    ).toBe(1);
  });

  it("allows only one concurrent comment for the same expected version", async () => {
    const conversation = await seedConversation();
    const outcomes = await Promise.allSettled([
      executeInternalComment(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        body: "First operator note",
        mentionMemberIds: [],
        expectedVersion: 0,
        idempotencyKey: "comment-concurrent-a",
      }),
      executeInternalComment(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        body: "Second operator note",
        mentionMemberIds: [],
        expectedVersion: 0,
        idempotencyKey: "comment-concurrent-b",
      }),
    ]);

    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === "rejected"),
    ).toHaveLength(1);
    expect(await rawDb.collaborationComment.count()).toBe(1);
    expect(
      await rawDb.auditLog.count({
        where: { action: "collaboration.comment.created" },
      }),
    ).toBe(1);
  });

  it("fails before persistence when a mention target is unavailable", async () => {
    const conversation = await seedConversation();
    harness.resolveMembers.mockRejectedValue(
      Object.assign(new Error("Unavailable"), {
        code: "COLLABORATION_MEMBER_UNAVAILABLE",
        statusCode: 409,
      }),
    );

    await expect(
      executeInternalComment(CONTEXT, actorContext(), {
        entityType: "conversation",
        entityId: conversation.id,
        body: "Mention unavailable member",
        mentionMemberIds: [MENTION.memberId],
        expectedVersion: 0,
        idempotencyKey: "comment-invalid-mention",
      }),
    ).rejects.toMatchObject({
      code: "COLLABORATION_MEMBER_UNAVAILABLE",
      statusCode: 409,
    });
    expect(await rawDb.collaborationComment.count()).toBe(0);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });
});
