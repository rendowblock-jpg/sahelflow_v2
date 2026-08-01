import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actorContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "current-session",
      role: "operator" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
  requireAction: vi.fn(),
  assertAction: vi.fn(),
  ensureConversation: vi.fn(),
  executeAssignment: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
  assertTrustedAction: harness.assertAction,
}));

vi.mock("@/lib/data/conversation-service", () => ({
  ensureConversationForJid: harness.ensureConversation,
}));

vi.mock("@/lib/inbox/conversation-assignment", () => ({
  executeConversationAssignment: harness.executeAssignment,
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: harness.actorContext.shop,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (
      handler: (
        request: NextRequest,
        context: { params: Promise<{ id: string }> },
      ) => Promise<Response>,
    ) =>
    async (
      request: NextRequest,
      context: { params: Promise<{ id: string }> },
    ): Promise<Response> => {
      try {
        return await handler(request, context);
      } catch (error) {
        const typed = error as {
          message?: string;
          code?: string;
          statusCode?: number;
        };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { PATCH } from "@/app/api/conversations/[id]/assign/route";

const routeContext = (id: string) => ({ params: Promise.resolve({ id }) });

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/conversations/raw/assign", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  harness.requireAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertAction.mockReset();
  harness.ensureConversation
    .mockReset()
    .mockResolvedValue("canonical-conversation");
  harness.executeAssignment.mockReset().mockResolvedValue({
    commandId: "command-1",
    aggregateVersion: 1,
    replayed: false,
    result: {
      conversationId: "canonical-conversation",
      operation: "claim",
      previousAssigneeId: null,
      assignee: {
        memberId: "6".repeat(32),
        personId: "5".repeat(32),
        displayName: "Amina",
        role: "operator",
      },
      activityType: "assignment_claimed",
      version: 1,
    },
  });
});

describe("PATCH /api/conversations/[id]/assign", () => {
  it("establishes durable read authority before parsing input or creating a JID row", async () => {
    harness.requireAction.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        code: "IDENTITY_SESSION_BINDING_REQUIRED",
        statusCode: 401,
      }),
    );
    const json = vi.fn();

    const response = await PATCH(
      { json } as unknown as NextRequest,
      routeContext("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(401);
    expect(harness.requireAction).toHaveBeenCalledWith("conversations.read");
    expect(json).not.toHaveBeenCalled();
    expect(harness.assertAction).not.toHaveBeenCalled();
    expect(harness.ensureConversation).not.toHaveBeenCalled();
    expect(harness.executeAssignment).not.toHaveBeenCalled();
  });

  it("checks self-claim permission before canonical JID normalization", async () => {
    const response = await PATCH(
      request({
        operation: "claim",
        expectedVersion: 0,
        idempotencyKey: "claim-route-1",
      }),
      routeContext("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(200);
    expect(harness.assertAction).toHaveBeenCalledWith(
      harness.actorContext,
      "conversations.claim",
      { shopId: "default" },
    );
    expect(harness.assertAction.mock.invocationCallOrder[0]).toBeLessThan(
      harness.ensureConversation.mock.invocationCallOrder[0]!,
    );
    expect(harness.ensureConversation).toHaveBeenCalledWith(
      expect.objectContaining({ shop: harness.actorContext.shop }),
      "213555000000@s.whatsapp.net",
    );
  });

  it("checks manager assignment permission and binds the path conversation", async () => {
    const body = {
      conversationId: "caller-controlled-id",
      operation: "assign",
      targetMemberId: "9".repeat(32),
      expectedVersion: 4,
      idempotencyKey: "assign-route-1",
    };

    const response = await PATCH(
      request(body),
      routeContext("route-conversation"),
    );

    expect(response.status).toBe(200);
    expect(harness.assertAction).toHaveBeenCalledWith(
      harness.actorContext,
      "conversations.assign",
      { shopId: "default" },
    );
    expect(harness.executeAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ shop: harness.actorContext.shop }),
      harness.actorContext,
      {
        ...body,
        conversationId: "canonical-conversation",
      },
    );
    await expect(response.json()).resolves.toMatchObject({
      assignment: { conversationId: "canonical-conversation", version: 1 },
      command: { id: "command-1", aggregateVersion: 1, replayed: false },
    });
  });

  it("does not create a conversation for malformed operation input", async () => {
    const response = await PATCH(
      request({
        operation: "steal",
        expectedVersion: 0,
        idempotencyKey: "invalid-route-1",
      }),
      routeContext("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(500);
    expect(harness.ensureConversation).not.toHaveBeenCalled();
    expect(harness.executeAssignment).not.toHaveBeenCalled();
  });
});
