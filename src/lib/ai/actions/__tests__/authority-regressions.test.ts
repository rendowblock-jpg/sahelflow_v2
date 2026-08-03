import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const harness = vi.hoisted(() => {
  const owner = {
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
    owner,
    assertTrustedAction: vi.fn(),
    trustedActorAuditIdentity: vi.fn(() => `person:${owner.personId}`),
    resolveDurableIdentityActor: vi.fn(),
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
  FEATURE_KEYS: { AI_CHAT: "ai_chat", COMPLETE: "sahelflow.complete" },
  getLicenseAuthorityProjection: harness.getLicenseAuthorityProjection,
}));

vi.mock("../executor", () => ({
  executeApprovedAiAction: harness.executeApprovedAiAction,
}));

import {
  approveAiActionProposal,
  createAiActionProposal,
  listAiActionProposals,
} from "../service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

type TestPersonActor = Extract<
  TrustedActorContext["actor"],
  { kind: "person" }
>;

function licenseProjection() {
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
  };
}

function context(
  actor: TestPersonActor = harness.owner as TestPersonActor,
): TrustedActorContext {
  return {
    version: 1,
    actor,
    shop: TEST_SHOP_CONTEXT,
  } as TrustedActorContext;
}

async function requestMessage() {
  const session = await db.aiChatSession.create({
    data: { title: "Task 5 authority regression" },
  });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Create a product",
      createdAt: new Date(),
    },
  });
  return { sessionId: session.id, messageId: message.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  harness.resolveDurableIdentityActor.mockResolvedValue(harness.owner);
  harness.getLicenseAuthorityProjection.mockResolvedValue(licenseProjection());
  harness.executeApprovedAiAction.mockResolvedValue({
    commandId: "command-task5",
    aggregateVersion: 1,
    replayed: false,
    result: { ok: true },
  });
  db = await createTestPrisma();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("proposal authority regressions", () => {
  it("preserves an exact custom member permission allowlist", async () => {
    const permissions = [
      "ai.use",
      "approvals.request",
      "products.read",
      "products.manage",
      "products.cost.update",
    ] as const satisfies readonly Phase2Action[];
    const member = {
      ...harness.owner,
      role: "manager" as const,
      sessionId: "session-manager",
      permissions,
    } satisfies TestPersonActor;
    harness.resolveDurableIdentityActor.mockResolvedValue({
      personId: member.personId,
      workspaceMemberId: member.workspaceMemberId,
      deviceId: member.deviceId,
      role: member.role,
      permissions,
      policyVersion: member.policyVersion,
      revocationEpoch: member.revocationEpoch,
    });
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: context(member),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: { name: "Widget", price: 1000, stock: 1 },
    });

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: context(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).resolves.toMatchObject({ result: { ok: true } });
  });

  it("never downgrades durable success after a later projection failure", async () => {
    const { sessionId, messageId } = await requestMessage();
    const created = await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: context(),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: { name: "Widget", price: 1000, stock: 1 },
    });
    harness.executeApprovedAiAction.mockImplementationOnce(async () => {
      await db.$executeRaw`
        UPDATE "AiActionProposal"
        SET "argsJson" = 'tampered-after-command'
        WHERE "id" = ${created.proposal.id}
      `;
      return {
        commandId: "command-committed",
        aggregateVersion: 1,
        replayed: false,
        result: { ok: true },
      };
    });

    await expect(
      approveAiActionProposal({
        context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        approver: context(),
        proposalId: created.proposal.id,
        proposalDigest: created.proposalDigest,
      }),
    ).rejects.toMatchObject({ code: "AI_ACTION_ARGUMENT_TAMPERED" });

    const states = await db.$queryRaw<
      Array<{ proposalStatus: string; executionState: string }>
    >`
      SELECT
        p."status" AS "proposalStatus",
        e."state" AS "executionState"
      FROM "AiActionProposal" p
      JOIN "AiActionExecution" e ON e."proposalId" = p."id"
      WHERE p."id" = ${created.proposal.id}
    `;
    expect(states[0]).toEqual({
      proposalStatus: "succeeded",
      executionState: "succeeded",
    });
  });

  it("filters decrypted proposal history by business permissions", async () => {
    const { sessionId, messageId } = await requestMessage();
    await createAiActionProposal({
      context: { prisma: db as never, shop: TEST_SHOP_CONTEXT },
      requester: context(),
      sessionId,
      requestMessageId: messageId,
      toolName: "create_product",
      rawArgs: { name: "Private Widget", price: 1000, stock: 1 },
    });

    const restricted = {
      ...harness.owner,
      role: "operator" as const,
      sessionId: "session-restricted",
      permissions: ["ai.use"] as const,
    } satisfies TestPersonActor;
    await expect(
      listAiActionProposals(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        context(restricted),
        sessionId,
      ),
    ).resolves.toEqual([]);

    await expect(
      listAiActionProposals(
        { prisma: db as never, shop: TEST_SHOP_CONTEXT },
        context(),
        sessionId,
      ),
    ).resolves.toHaveLength(1);
  });
});
