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
    executeApprovedAiAction: vi.fn(),
    getLicenseAuthorityProjection: vi.fn(),
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

import {
  approveAiActionProposal,
  createAiActionProposal,
} from "../service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedProduct,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

function licenseProjection(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function actorContext(
  actor = harness.actor,
  shop = TEST_SHOP_CONTEXT,
): TrustedActorContext {
  return { version: 1, actor, shop } as TrustedActorContext;
}

async function requestMessage() {
  const session = await db.aiChatSession.create({
    data: { title: "Task 5 adversarial test" },
  });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Create the exact proposal",
      createdAt: new Date(),
    },
  });
  return { sessionId: session.id, messageId: message.id };
}

async function createProductProposal() {
  const { sessionId, messageId } = await requestMessage();
  return createAiActionProposal({
    context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
    requester: actorContext(),
    sessionId,
    requestMessageId: messageId,
    toolName: "create_product",
    rawArgs: { name: "Widget", price: 1000, stock: 1 },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  harness.resolveDurableIdentityActor.mockResolvedValue(harness.actor);
  harness.getLicenseAuthorityProjection.mockResolvedValue(licenseProjection());
  harness.executeApprovedAiAction.mockResolvedValue({
    commandId: "command-task5",
    aggregateVersion: 1,
    replayed: false,
    result: { ok: true, mutationId: "mut-1" },
  });
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("proposal-bound AI drift and recovery", () => {
  it("fails closed when the requester device or session authority changes", async () => {
    const created = await createProductProposal();
    harness.resolveDurableIdentityActor.mockResolvedValue({
      ...harness.actor,
      deviceId: "4".repeat(32),
    });

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_REQUESTER_DRIFT" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("fails closed when the exact shop runtime changes", async () => {
    const created = await createProductProposal();
    const otherShop = {
      ...TEST_SHOP_CONTEXT,
      registryRevision: TEST_SHOP_CONTEXT.registryRevision + 1,
      databaseFileId: "other.db",
    };

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: otherShop },
        approver: actorContext(harness.actor, otherShop),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_SHOP_DRIFT" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("fails closed when the signed entitlement binding changes", async () => {
    const created = await createProductProposal();
    harness.getLicenseAuthorityProjection.mockResolvedValue(
      licenseProjection({ licenseId: "license-rotated" }),
    );

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_LICENSE_DRIFT" });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("authenticates the immutable approval before replaying success", async () => {
    const created = await createProductProposal();
    await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
    });
    await db.$executeRaw`
      UPDATE "AiActionApproval"
      SET "approvalDigest" = ${"0".repeat(64)}
      WHERE "proposalId" = ${created.proposal.id}
    `;

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_APPROVAL_TAMPERED" });
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(1);
  });

  it("authenticates the encrypted execution result on duplicate approval", async () => {
    const created = await createProductProposal();
    await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
    });
    await db.$executeRaw`
      UPDATE "AiActionExecution"
      SET "resultJson" = 'tampered'
      WHERE "proposalId" = ${created.proposal.id}
    `;

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({
      code: "AI_ACTION_EXECUTION_RESULT_TAMPERED",
    });
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(1);
  });

  it("requires a reason to recover a failed pre-command execution", async () => {
    const created = await createProductProposal();
    harness.executeApprovedAiAction.mockRejectedValueOnce(
      new Error("simulated pre-command failure"),
    );

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toThrow(/simulated pre-command failure/);

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const recovered = await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
      reason: "Transient local database interruption",
    });
    expect(recovered.result).toEqual({ ok: true, mutationId: "mut-1" });
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(2);
  });

  it("recovers after a committed command without repeating the mutation", async () => {
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

    harness.executeApprovedAiAction.mockImplementationOnce(async (input) => {
      await db.businessCommand.create({
        data: {
          id: "command-committed-before-crash",
          idempotencyKey: `ai-action:${input.proposalId}`,
          commandType: "ai.action.execute.v1",
          aggregateType: "ai-action-proposal",
          aggregateId: input.proposalId,
          requestHash: "a".repeat(64),
          status: "committed",
          resultJson: "sealed-by-real-kernel",
          actor: "authenticated-owner:test",
          correlationId: input.executionKey,
          expectedVersion: 0,
          committedVersion: 1,
          committedAt: new Date(),
        },
      });
      throw new Error("crash after canonical command commit");
    });

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toThrow(/crash after canonical command commit/);

    await db.product.update({
      where: { id: product.id },
      data: { price: 9999 },
    });
    harness.executeApprovedAiAction.mockResolvedValueOnce({
      commandId: "command-committed-before-crash",
      aggregateVersion: 1,
      replayed: true,
      result: { id: product.id, price: 3000 },
    });

    const recovered = await approveAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      approver: actorContext(),
      proposalId: created.proposal.id,
      proposalDigest: created.proposalDigest,
      reason: "Resume committed command result after restart",
    });

    expect(recovered.replayed).toBe(true);
    expect(recovered.result).toEqual({ id: product.id, price: 3000 });
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(2);
    expect(await db.businessCommand.count()).toBe(1);
  });
});
