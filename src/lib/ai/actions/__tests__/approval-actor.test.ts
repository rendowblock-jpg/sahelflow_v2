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

import { assertAiActionApprovalActor } from "../approval-actor";
import {
  approveAiActionProposal,
  createAiActionProposal,
} from "../service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

function actorContext(
  actor = harness.actor,
): TrustedActorContext {
  return {
    version: 1,
    actor,
    shop: TEST_SHOP_CONTEXT,
  } as TrustedActorContext;
}

async function createProposal() {
  const session = await db.aiChatSession.create({
    data: { title: "Approval actor test" },
  });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Create a product",
      createdAt: new Date(),
    },
  });
  return createAiActionProposal({
    context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
    requester: actorContext(),
    sessionId: session.id,
    requestMessageId: message.id,
    toolName: "create_product",
    rawArgs: { name: "Widget", price: 1000, stock: 1 },
  });
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
  harness.executeApprovedAiAction.mockRejectedValue(
    new Error("simulated recoverable failure"),
  );
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("exact AI approval actor continuity", () => {
  it("allows the exact durable approver to resume", async () => {
    const created = await createProposal();
    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toThrow(/simulated recoverable failure/);

    await expect(
      assertAiActionApprovalActor(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        actorContext(),
        created.proposal.id,
        created.proposalDigest,
      ),
    ).resolves.toBeUndefined();
  });

  it("refuses another authorized actor from inheriting the approval", async () => {
    const created = await createProposal();
    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: actorContext(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toThrow(/simulated recoverable failure/);

    const otherActor = {
      ...harness.actor,
      personId: "4".repeat(32),
      workspaceMemberId: "5".repeat(32),
      deviceId: "6".repeat(32),
      sessionId: "session-other-owner",
    };
    await expect(
      assertAiActionApprovalActor(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        actorContext(otherActor),
        created.proposal.id,
        created.proposalDigest,
      ),
    ).rejects.toMatchObject({ code: "AI_ACTION_APPROVER_DRIFT" });
  });
});
