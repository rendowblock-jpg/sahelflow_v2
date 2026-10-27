import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const harness = vi.hoisted(() => ({
  assertTrustedAction: vi.fn(),
  trustedActorAuditIdentity: vi.fn(() => "person:test"),
  resolveDurableIdentityActor: vi.fn(),
  executeApprovedAiAction: vi.fn(),
  getLicenseAuthorityProjection: vi.fn(),
}));

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
  createAiActionProposal,
  getAiActionProposal,
  listAiActionProposals,
  listPendingAiActionProposalsAcrossSessions,
  listRecentAiActionDecisions,
  rejectAiActionProposal,
} from "../service";
import {
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  TEST_SHOP_CONTEXT,
} from "@/lib/data/__tests__/helpers";
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

let db: PrismaClient;

type TestPersonActor = Extract<
  TrustedActorContext["actor"],
  { kind: "person" }
>;

function person(
  role: TestPersonActor["role"],
  digit: string,
  permissions?: readonly Phase2Action[],
): TestPersonActor {
  return {
    kind: "person",
    personId: digit.repeat(32),
    workspaceMemberId: digit.repeat(31) + "m",
    deviceId: digit.repeat(31) + "d",
    sessionId: `session-${role}-${digit}`,
    role,
    ...(permissions ? { permissions } : {}),
    policyVersion: 1,
    revocationEpoch: 0,
  };
}

const owner = person("owner", "1");
const operatorA = person("operator", "4");
const operatorB = person("operator", "5");

function ctx(actor: TestPersonActor): TrustedActorContext {
  return { version: 1, actor, shop: TEST_SHOP_CONTEXT } as TrustedActorContext;
}

const shopCtx = () => ({ prisma: db as never, shop: TEST_SHOP_CONTEXT });

let customerId: string;

/** One chat session + user message + customer-notes proposal by `requester`. */
async function propose(
  requester: TestPersonActor,
  title: string,
): Promise<{ id: string; sessionId: string }> {
  const session = await db.aiChatSession.create({ data: { title } });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Add a note to the customer",
      createdAt: new Date(),
    },
  });
  const created = await createAiActionProposal({
    context: shopCtx(),
    requester: ctx(requester),
    sessionId: session.id,
    requestMessageId: message.id,
    toolName: "update_customer_notes",
    rawArgs: { customerId, notes: `note from ${title}`, mode: "append" },
  });
  return { id: created.proposal.id, sessionId: session.id };
}

beforeEach(async () => {
  vi.clearAllMocks();
  harness.getLicenseAuthorityProjection.mockResolvedValue({
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
  });
  db = await createTestPrisma();
  customerId = (await seedCustomer(db)).id;
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("AI action proposal visibility per member", () => {
  it("operator B does not list operator A's pending proposal", async () => {
    const a = await propose(operatorA, "A chat");

    const inbox = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(operatorB),
    );

    expect(inbox.map((row) => row.proposal.id)).not.toContain(a.id);
    expect(inbox).toEqual([]);
  });

  it("owner lists both", async () => {
    const a = await propose(operatorA, "A chat");
    const b = await propose(operatorB, "B chat");

    const inbox = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(owner),
    );

    expect(inbox.map((row) => row.proposal.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("B gets A's proposal by id => AI_ACTION_PROPOSAL_NOT_FOUND, same answer as an unknown id", async () => {
    const a = await propose(operatorA, "A chat");

    const hidden = await getAiActionProposal(
      shopCtx(),
      ctx(operatorB),
      a.id,
    ).then(
      () => null,
      (error: unknown) => error as Error & { code?: string; statusCode?: number },
    );
    const unknown = await getAiActionProposal(
      shopCtx(),
      ctx(operatorB),
      "aip_does_not_exist",
    ).then(
      () => null,
      (error: unknown) => error as Error & { code?: string; statusCode?: number },
    );

    expect(hidden).not.toBeNull();
    expect(hidden?.code).toBe("AI_ACTION_PROPOSAL_NOT_FOUND");
    expect(hidden?.statusCode).toBe(404);
    expect(unknown?.code).toBe(hidden?.code);
    expect(unknown?.statusCode).toBe(hidden?.statusCode);
    expect(unknown?.message).toBe(hidden?.message);
  });

  it("A still sees own proposal (inbox, by id, and in its session)", async () => {
    const a = await propose(operatorA, "A chat");
    await propose(operatorB, "B chat");

    const inbox = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(operatorA),
    );
    const byId = await getAiActionProposal(shopCtx(), ctx(operatorA), a.id);
    const inSession = await listAiActionProposals(
      shopCtx(),
      ctx(operatorA),
      a.sessionId,
    );

    expect(inbox.map((row) => row.proposal.id)).toEqual([a.id]);
    expect(byId.proposal.id).toBe(a.id);
    expect(inSession.map((row) => row.proposal.id)).toEqual([a.id]);
  });

  it("the per-session list hides other members' proposals from a non-approver", async () => {
    const a = await propose(operatorA, "A chat");

    await expect(
      listAiActionProposals(shopCtx(), ctx(operatorB), a.sessionId),
    ).resolves.toEqual([]);
    await expect(
      listAiActionProposals(shopCtx(), ctx(owner), a.sessionId),
    ).resolves.toHaveLength(1);
  });

  it("recent decisions hide other members' decisions from a non-approver", async () => {
    const a = await propose(operatorA, "A chat");
    const b = await propose(operatorB, "B chat");
    await rejectAiActionProposal({ context: shopCtx(), proposalId: a.id });
    await rejectAiActionProposal({ context: shopCtx(), proposalId: b.id });

    const forB = await listRecentAiActionDecisions(shopCtx(), ctx(operatorB));
    const forA = await listRecentAiActionDecisions(shopCtx(), ctx(operatorA));
    const forOwner = await listRecentAiActionDecisions(shopCtx(), ctx(owner));

    expect(forB.map((row) => row.id)).toEqual([b.id]);
    expect(forA.map((row) => row.id)).toEqual([a.id]);
    expect(forOwner.map((row) => row.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("inbox row still carries sessionTitle only for visible rows", async () => {
    const a = await propose(operatorA, "A secret chat title");
    const b = await propose(operatorB, "B own chat title");

    const forB = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(operatorB),
    );
    const forOwner = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(owner),
    );

    expect(forB).toHaveLength(1);
    expect(forB[0]).toMatchObject({
      sessionId: b.sessionId,
      sessionTitle: "B own chat title",
    });
    expect(JSON.stringify(forB)).not.toContain("A secret chat title");
    expect(
      Object.fromEntries(forOwner.map((r) => [r.proposal.id, r.sessionTitle])),
    ).toEqual({
      [a.id]: "A secret chat title",
      [b.id]: "B own chat title",
    });
  });

  it("the requester filter is applied before the row limit", async () => {
    const a = await propose(operatorA, "A chat");
    const b1 = await propose(operatorB, "B chat 1");
    const b2 = await propose(operatorB, "B chat 2");
    // B's rows are the newest; a limit applied before the filter would
    // return nothing for A.
    const later = new Date(Date.now() + 60_000);
    await db.$executeRaw`
      UPDATE "AiActionProposal" SET "createdAt" = ${later}
      WHERE "id" IN (${b1.id}, ${b2.id})
    `;

    const inbox = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(operatorA),
      1,
    );

    expect(inbox.map((row) => row.proposal.id)).toEqual([a.id]);
  });

  it("approvals.approve decides who sees everyone's proposals, not the role name", async () => {
    const a = await propose(operatorA, "A chat");
    // Owner role with a custom allowlist that lacks approvals.approve.
    const ownerWithoutApprove = person("owner", "6", [
      "ai.use",
      "approvals.request",
      "customers.read",
      "customers.manage",
      "customers.contact.update",
    ]);
    // Manager role with a custom allowlist that includes approvals.approve.
    const approver = person("manager", "7", [
      "ai.use",
      "approvals.approve",
      "customers.read",
      "customers.manage",
      "customers.contact.update",
    ]);

    await expect(
      listPendingAiActionProposalsAcrossSessions(
        shopCtx(),
        ctx(ownerWithoutApprove),
      ),
    ).resolves.toEqual([]);
    const forApprover = await listPendingAiActionProposalsAcrossSessions(
      shopCtx(),
      ctx(approver),
    );
    expect(forApprover.map((row) => row.proposal.id)).toEqual([a.id]);
  });
});
