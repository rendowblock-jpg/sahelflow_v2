import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const harness = vi.hoisted(() => {
  const actor = {
    kind: "person" as const,
    personId: "1".repeat(32),
    workspaceMemberId: "2".repeat(32),
    deviceId: "3".repeat(32),
    sessionId: "session-owner",
    role: "owner" as const,
    policyVersion: 1,
    revocationEpoch: 0,
  };
  return {
    actor,
    assertTrustedAction: vi.fn(),
    trustedActorAuditIdentity: vi.fn(() => `person:${actor.personId}`),
    resolveDurableIdentityActor: vi.fn(async () => actor),
    executeApprovedAiAction: vi.fn(async () => ({
      commandId: "command-task5",
      aggregateVersion: 1,
      replayed: false,
      result: { ok: true, mutationId: "mut-1" },
    })),
    getLicenseAuthorityProjection: vi.fn(async () => ({
      status: "valid" as const,
      message: "valid",
      licenseId: "license-test",
      type: "permanent" as const,
      expiresAt: null,
      supportEndsAt: null,
      shopSlots: 10,
      memberLimit: 10,
      deviceLimit: 10,
      features: ["ai_chat", "sahelflow.complete"],
      minimumPermanentRecoveryEpoch: null,
    })),
  };
});

vi.mock("@/lib/identity/authorization", () => ({
  assertTrustedAction: harness.assertTrustedAction,
  trustedActorAuditIdentity: harness.trustedActorAuditIdentity,
}));

vi.mock("@/lib/identity/control-authority", () => ({
  resolveDurableIdentityActor: harness.resolveDurableIdentityActor,
}));

vi.mock("@/lib/license/license-authority", () => ({
  FEATURE_KEYS: {
    AI_CHAT: "ai_chat",
    COMPLETE: "sahelflow.complete",
  },
  getLicenseAuthorityProjection: harness.getLicenseAuthorityProjection,
}));

vi.mock("../executor", () => ({
  executeApprovedAiAction: harness.executeApprovedAiAction,
}));

import { approveAiActionProposal, createAiActionProposal } from "../service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedProduct,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

function actorContext(): TrustedActorContext {
  return {
    version: 1,
    actor: harness.actor,
    shop: TEST_SHOP_CONTEXT,
  } as TrustedActorContext;
}

async function requestMessage(): Promise<{
  sessionId: string;
  messageId: string;
}> {
  const session = await db.aiChatSession.create({
    data: { title: "Task 5 test" },
  });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Create the proposed action",
      createdAt: new Date(),
    },
  });
  return { sessionId: session.id, messageId: message.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  harness.resolveDurableIdentityActor.mockResolvedValue(harness.actor);
  harness.getLicenseAuthorityProjection.mockResolvedValue({
    status: "valid",
    message: "valid",
    licenseId: "license-test",
    type: "permanent",
    expiresAt: null,
    supportEndsAt: null,
    shopSlots: 10,
    memberLimit: 10,
    deviceLimit: 10,
    features: ["ai_chat", "sahelflow.complete"],
    minimumPermanentRecoveryEpoch: null,
  });
  harness.executeApprovedAiAction.mockResolvedValue({
    commandId: "command-task5",
    aggregateVersion: 1,
    replayed: false,
    result: { ok: true, mutationId: "mut-1" },
  });
  db = await createTestPrisma();
});

afterEach(async () => {
  vi.useRealTimers();
  await disconnectTestPrisma(db);
});

describe("proposal-bound AI action service", () => {
  it("encrypts proposal payloads and replays duplicate approval once", async () => {
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: actorContext(),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: {
        name: "Private Widget",
        price: 4200,
        stock: 7,
        sku: "PRIVATE-SKU",
      },
    });

    const stored = await db.$queryRaw<
      Array<{ argsJson: string; summaryJson: string; status: string }>
    >`
      SELECT "argsJson", "summaryJson", "status"
      FROM "AiActionProposal"
      WHERE "id" = ${created.proposal.id}
    `;
    expect(stored[0]?.status).toBe("pending");
    expect(stored[0]?.argsJson).not.toContain("Private Widget");
    expect(stored[0]?.argsJson).not.toContain("PRIVATE-SKU");
    expect(stored[0]?.summaryJson).not.toContain("Private Widget");

    const first = await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
    });
    const second = await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
    });

    expect(first.result).toEqual({ ok: true, mutationId: "mut-1" });
    expect(first.replayed).toBe(false);
    expect(second.result).toEqual(first.result);
    expect(second.replayed).toBe(true);
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(1);

    const counts = await db.$queryRaw<
      Array<{ approvals: bigint; executions: bigint }>
    >`
      SELECT
        (SELECT COUNT(*) FROM "AiActionApproval") AS "approvals",
        (SELECT COUNT(*) FROM "AiActionExecution") AS "executions"
    `;
    expect(Number(counts[0]?.approvals)).toBe(1);
    expect(Number(counts[0]?.executions)).toBe(1);

    await expect(
      db.$executeRaw`
        UPDATE "AiActionExecution"
        SET "state" = 'failed'
        WHERE "proposalId" = ${created.proposal.id}
      `,
    ).rejects.toThrow(/terminal/i);
  });

  it("fails closed when encrypted proposal arguments are tampered", async () => {
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: actorContext(),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: { name: "Widget", price: 1000, stock: 1 },
    });

    await db.$executeRaw`
      UPDATE "AiActionProposal"
      SET "argsJson" = 'tampered'
      WHERE "id" = ${created.proposal.id}
    `;

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_ARGUMENT_TAMPERED" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("expires an unapproved proposal after its exact TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: actorContext(),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: { name: "Widget", price: 1000, stock: 1 },
    });

    vi.setSystemTime(new Date("2026-08-03T12:11:00.000Z"));
    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_PROPOSAL_EXPIRED" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("refuses approval when the exact business target changed", async () => {
    const product = await seedProduct(db, { price: 2500 });
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: actorContext(),
      sessionId,
      requestMessageId: messageId,
      toolName: "update_product_price",
      rawArgs: { productId: product.id, newPrice: 3000 },
    });

    await db.product.update({
      where: { id: product.id },
      data: { price: 2750 },
    });

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_TARGET_CONFLICT" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });
});
