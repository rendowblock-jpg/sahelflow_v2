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
      role: "operator" as "owner" | "manager" | "operator" | "viewer",
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
  findConversation: vi.fn(),
  listMembers: vi.fn(),
  assignmentVersion: vi.fn(),
  executeAssignment: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
  assertTrustedAction: harness.assertAction,
}));

vi.mock("@/lib/data/conversation-service", () => ({
  ensureConversationForJid: harness.ensureConversation,
}));

vi.mock("@/lib/identity/team-directory", () => ({
  listTeamMembers: harness.listMembers,
}));

vi.mock("@/lib/inbox/conversation-assignment", () => ({
  executeConversationAssignment: harness.executeAssignment,
  getConversationAssignmentVersion: harness.assignmentVersion,
}));

vi.mock("@/lib/db", () => ({
  db: {
    conversation: {
      findUnique: harness.findConversation,
    },
  },
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

import { GET, PATCH } from "@/app/api/conversations/[id]/assign/route";

const routeContext = (id: string) => ({ params: Promise.resolve({ id }) });

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/conversations/raw/assign", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const member = (input: {
  memberId: string;
  displayName: string;
  role?: "manager" | "operator" | "viewer";
  shopIds?: string[];
  revokedAt?: string | null;
}) => ({
  personId: input.memberId.replace(/^./, "5"),
  memberId: input.memberId,
  deviceId: input.memberId.replace(/^./, "7"),
  invitationId: input.memberId.replace(/^./, "8"),
  displayName: input.displayName,
  loginId: `${input.displayName.toLowerCase()}.ops`,
  role: input.role ?? ("operator" as const),
  permissions: null,
  shopIds: input.shopIds ?? ["default"],
  policyVersion: 1,
  revocationEpoch: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  revokedAt: input.revokedAt ?? null,
});

beforeEach(() => {
  harness.actorContext.actor.role = "operator";
  delete (harness.actorContext.actor as { permissions?: readonly string[] })
    .permissions;
  harness.requireAction.mockReset().mockResolvedValue(harness.actorContext);
  harness.assertAction.mockReset();
  harness.ensureConversation
    .mockReset()
    .mockResolvedValue("canonical-conversation");
  harness.findConversation.mockReset().mockResolvedValue({
    id: "canonical-conversation",
    assigneeId: null,
  });
  harness.assignmentVersion.mockReset().mockResolvedValue(3);
  harness.listMembers.mockReset().mockResolvedValue([
    member({ memberId: "9".repeat(32), displayName: "Amina" }),
    member({
      memberId: "a".repeat(32),
      displayName: "Viewer",
      role: "viewer",
    }),
    member({
      memberId: "b".repeat(32),
      displayName: "Other",
      shopIds: ["other-shop"],
    }),
    member({
      memberId: "c".repeat(32),
      displayName: "Revoked",
      revokedAt: "2026-08-01T01:00:00.000Z",
    }),
  ]);
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

describe("GET /api/conversations/[id]/assign", () => {
  it("returns claim-only authority without member inventory to an operator", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/conversations/raw/assign"),
      routeContext("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      assignment: { conversationId: string; version: number };
      currentActor: { allowedActions: string[]; memberId: string };
      assignableMembers: unknown[];
    };
    expect(body.assignment).toEqual({
      conversationId: "canonical-conversation",
      assigneeId: null,
      version: 3,
    });
    expect(body.currentActor.allowedActions).toEqual(
      expect.arrayContaining(["conversations.read", "conversations.claim"]),
    );
    expect(body.currentActor.allowedActions).not.toContain(
      "conversations.assign",
    );
    expect(body.assignableMembers).toEqual([]);
    expect(harness.listMembers).not.toHaveBeenCalled();
  });

  it("returns only active current-shop manager/operator targets to a manager", async () => {
    harness.actorContext.actor.role = "manager";

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/raw/assign"),
      routeContext("canonical-conversation"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      currentActor: { allowedActions: string[] };
      assignableMembers: Array<{
        memberId: string;
        displayName: string | null;
        role: string;
      }>;
    };
    expect(body.currentActor.allowedActions).toContain("conversations.assign");
    expect(body.assignableMembers).toEqual([
      {
        memberId: "9".repeat(32),
        displayName: "Amina",
        role: "operator",
      },
    ]);
    expect(harness.listMembers).toHaveBeenCalledWith(
      harness.actorContext.shop,
    );
  });

  it("establishes read authority before creating a live-JID projection", async () => {
    harness.requireAction.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), {
        code: "IDENTITY_SESSION_BINDING_REQUIRED",
        statusCode: 401,
      }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/raw/assign"),
      routeContext("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(401);
    expect(harness.ensureConversation).not.toHaveBeenCalled();
    expect(harness.findConversation).not.toHaveBeenCalled();
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
