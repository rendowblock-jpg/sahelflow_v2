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

function ctx(actor: TestPersonActor): TrustedActorContext {
  return { version: 1, actor, shop: TEST_SHOP_CONTEXT } as TrustedActorContext;
}

const shopCtx = () => ({ prisma: db as never, shop: TEST_SHOP_CONTEXT });
const owner = person("owner", "1");
// Same person as the owner, but a session whose permissions were cut down
// after the proposal was made: still the requester, no longer allowed to read.
const reducedOwner = person("owner", "1", ["ai.use", "approvals.request"]);

async function proposeCustomer(): Promise<{ id: string; sessionId: string }> {
  const session = await db.aiChatSession.create({ data: { title: "details" } });
  const message = await db.aiChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: "Create the customer",
      createdAt: new Date(),
    },
  });
  const created = await createAiActionProposal({
    context: shopCtx(),
    requester: ctx(owner),
    sessionId: session.id,
    requestMessageId: message.id,
    toolName: "create_customer",
    rawArgs: {
      name: "Karim D.",
      phone: "0661234567",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "Cité 5 Juillet, n° 40",
    },
  });
  expect(created.proposal.details).toBeDefined();
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
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

describe("approval details on the proposal projection", () => {
  it("a reader allowed to read the proposal gets the full phone and address", async () => {
    const { id, sessionId } = await proposeCustomer();

    const read = await getAiActionProposal(shopCtx(), ctx(owner), id);
    const phone = read.proposal.details?.find((d) => d.key === "phone");
    const address = read.proposal.details?.find((d) => d.key === "address");
    expect(phone?.value).toBe("0661234567");
    expect(address?.value).toBe("Cité 5 Juillet, n° 40");

    const listed = await listAiActionProposals(shopCtx(), ctx(owner), sessionId);
    expect(listed.map((row) => row.proposal.id)).toContain(id);
    expect(JSON.stringify(listed)).toContain("0661234567");
  });

  it("details are withheld from a reader who lacks the tool's required permissions", async () => {
    const { id, sessionId } = await proposeCustomer();

    await expect(
      getAiActionProposal(shopCtx(), ctx(reducedOwner), id),
    ).rejects.toMatchObject({ code: "AI_ACTION_PROPOSAL_NOT_FOUND" });

    const listed = await listAiActionProposals(
      shopCtx(),
      ctx(reducedOwner),
      sessionId,
    );
    expect(listed).toEqual([]);
    expect(JSON.stringify(listed)).not.toContain("0661234567");
  });
});
