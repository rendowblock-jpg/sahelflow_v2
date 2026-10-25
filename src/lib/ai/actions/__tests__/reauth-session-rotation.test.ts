/**
 * Characterization: PIN re-entry versus a waiting AI action proposal.
 *
 * Re-entering the PIN (POST /api/auth/reauthenticate -> reauthenticateCurrentSession)
 * revokes the signed-in session, issues a new one and revokes the old identity
 * binding. A proposal stores the requester's session id and, at approval time,
 * re-resolves the requester from that session. This file pins down what really
 * happens today. It asserts the CURRENT behaviour; it is not a statement that
 * the behaviour is wanted. If a later change makes the proposal survive, these
 * assertions must be flipped on purpose, together with the owner's decision.
 *
 * Real: auth/server (PIN, sessions, cookie rotation), the durable identity
 * authority, trusted-actor, proposal service, approval-actor, test SQLite.
 * Mocked: the cookie store, the licence projection and the business executor
 * (same as the sibling service tests); nothing on the identity path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn((key: string) =>
      map.has(key) ? { value: map.get(key) } : undefined,
    ),
    set: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    reset: () => map.clear(),
  };
});

const harness = vi.hoisted(() => ({
  executeApprovedAiAction: vi.fn(),
  getLicenseAuthorityProjection: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
}));

vi.mock("@/lib/license/license-authority", () => ({
  FEATURE_KEYS: { AI_CHAT: "ai_chat", COMPLETE: "sahelflow.complete" },
  getLicenseAuthorityProjection: harness.getLicenseAuthorityProjection,
}));

vi.mock("../executor", () => ({
  executeApprovedAiAction: harness.executeApprovedAiAction,
}));

delete process.env.AUTH_SECRET;
delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;

import { assertAiActionApprovalActor } from "../approval-actor";
import { approveAiActionProposal, createAiActionProposal } from "../service";
import { dbRaw, db, shopContext } from "@/lib/db";
import {
  createSession,
  reauthenticateCurrentSession,
  setupAuth,
} from "@/lib/auth/server";
import { resolveDurableIdentityActor } from "@/lib/identity/control-authority";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

const PIN = "12345678";
const context = { prisma: db, shop: shopContext };

async function cleanAuthDb(): Promise<void> {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

async function proposeAsCurrentSession() {
  const requester = await requireTrustedActor();
  const chat = await dbRaw.aiChatSession.create({
    data: { title: "reauth characterization" },
  });
  const message = await dbRaw.aiChatMessage.create({
    data: {
      sessionId: chat.id,
      role: "user",
      content: "Create the exact proposal",
      createdAt: new Date(),
    },
  });
  const created = await createAiActionProposal({
    context,
    requester,
    sessionId: chat.id,
    requestMessageId: message.id,
    toolName: "create_product",
    rawArgs: { name: "Widget", price: 1000, stock: 1 },
  });
  const requesterSessionId =
    requester.actor.kind === "person" ? requester.actor.sessionId : "";
  return { created, requesterSessionId };
}

/** The same two calls the approve route makes, with the cookie's current session. */
async function approveAsCurrentSession(created: {
  proposal: { id: string };
  proposalDigest: string;
}) {
  const approver = await requireTrustedActor();
  await assertAiActionApprovalActor(
    context,
    approver,
    created.proposal.id,
    created.proposalDigest,
  );
  return approveAiActionProposal({
    context,
    approver,
    proposalId: created.proposal.id,
    proposalDigest: created.proposalDigest,
  });
}

async function proposalRow(id: string) {
  const rows = await dbRaw.$queryRaw<
    { status: string; lastErrorCode: string | null }[]
  >`SELECT "status", "lastErrorCode" FROM "AiActionProposal" WHERE "id" = ${id}`;
  return rows[0];
}

beforeEach(async () => {
  vi.clearAllMocks();
  cookieJar.reset();
  await cleanAuthDb();
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
    commandId: "command-reauth",
    aggregateVersion: 1,
    replayed: false,
    result: { ok: true, mutationId: "mut-1" },
  });
  await setupAuth(PIN);
  await createSession("10.0.0.1");
});

afterEach(async () => {
  delete process.env.AUTH_SECRET;
  await cleanAuthDb();
});

describe("PIN re-entry while an AI proposal is waiting (current behaviour)", () => {
  it("control: without a PIN re-entry the same session approves its own proposal", async () => {
    const { created } = await proposeAsCurrentSession();

    const result = await approveAsCurrentSession(created);

    expect(result.replayed).toBe(false);
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(1);
  });

  it("PIN re-entry rotates the session and revokes the old identity binding", async () => {
    const { requesterSessionId } = await proposeAsCurrentSession();

    await expect(reauthenticateCurrentSession(PIN, "10.0.0.2")).resolves.toEqual(
      { reauthenticated: true },
    );

    const after = await requireTrustedActor();
    const sessionAfter = after.actor.kind === "person" ? after.actor.sessionId : "";
    expect(sessionAfter).not.toBe("");
    expect(sessionAfter).not.toBe(requesterSessionId);
    // Same person, new session: the old binding no longer resolves. (Vitest
    // and the app both reach the identity-authority facade through the
    // "@/lib/identity/control-authority" alias; it answers null for a revoked
    // binding.)
    await expect(
      resolveDurableIdentityActor(requesterSessionId, shopContext),
    ).resolves.toBeNull();
  });

  it("a proposal made before the PIN re-entry is REFUSED (requester drift) and stays refused", async () => {
    const { created } = await proposeAsCurrentSession();
    await reauthenticateCurrentSession(PIN, "10.0.0.2");

    await expect(approveAsCurrentSession(created)).rejects.toMatchObject({
      code: "AI_ACTION_REQUESTER_DRIFT",
      statusCode: 409,
    });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();

    // The refusal is recorded on the proposal: a second try is also refused.
    expect((await proposalRow(created.proposal.id))?.lastErrorCode).toBe(
      "AI_ACTION_REQUESTER_DRIFT",
    );
    await expect(approveAsCurrentSession(created)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(harness.executeApprovedAiAction).not.toHaveBeenCalled();
  });

  it("a proposal made after the PIN re-entry is approved normally", async () => {
    await reauthenticateCurrentSession(PIN, "10.0.0.2");
    const { created } = await proposeAsCurrentSession();

    const result = await approveAsCurrentSession(created);

    expect(result.replayed).toBe(false);
    expect(harness.executeApprovedAiAction).toHaveBeenCalledTimes(1);
  });
});
