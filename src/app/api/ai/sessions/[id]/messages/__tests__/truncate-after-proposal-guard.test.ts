/**
 * truncate-after must not delete the message a live proposal is bound to
 * (audit S06a-11).
 *
 * `AiActionProposal.requestMessageId` is a plain string with no relation and no
 * cascade. Regenerate / edit-and-resend truncated the conversation tail by
 * message id, so it could delete the user message that a still-actionable
 * proposal (pending, approved, executing or failed-and-retryable) was created
 * for, leaving the approval card without the request that justified it. The
 * route now refuses with a coded 409 and deletes nothing. Proposals that are
 * final (succeeded, rejected, expired, conflict), and pending ones past their
 * expiry, never block.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type MessageRow = { id: string; sessionId: string; createdAt: Date };
type ProposalRow = {
  id: string;
  sessionId: string;
  requestMessageId: string;
  status: string;
  expiresAt: Date;
};

const store = vi.hoisted(() => ({
  messages: [] as MessageRow[],
  proposals: [] as ProposalRow[],
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  shopContext: {
    workspaceId: "a".repeat(32),
    installationId: "b".repeat(32),
    shopId: "test",
    shopIncarnationId: "c".repeat(32),
    registryRevision: 1,
    databaseFileId: "test.db",
    migrationSetSha256: "0".repeat(64),
  },
  db: {
    aiChatSession: {
      findUnique: vi.fn(async () => ({ id: "sess-1" })),
    },
    aiChatMessage: {
      findFirst: vi.fn(
        async (args: { where: { id: string; sessionId: string } }) =>
          store.messages.find(
            (row) =>
              row.id === args.where.id && row.sessionId === args.where.sessionId,
          ) ?? null,
      ),
      findMany: vi.fn(async () => [...store.messages]),
      deleteMany: vi.fn(
        async (args: { where: { id: { in: string[] } } }) => {
          const ids = args.where.id.in;
          store.messages = store.messages.filter((row) => !ids.includes(row.id));
          return { count: ids.length };
        },
      ),
    },
    aiActionProposal: {
      findMany: vi.fn(
        async (args: {
          where: { sessionId?: string; requestMessageId?: { in: string[] } };
        }) =>
          store.proposals.filter(
            (row) =>
              (args.where.sessionId === undefined ||
                row.sessionId === args.where.sessionId) &&
              (args.where.requestMessageId?.in === undefined ||
                args.where.requestMessageId.in.includes(row.requestMessageId)),
          ),
      ),
    },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "../truncate-after/route";

const HOUR_MS = 60 * 60 * 1000;

function message(id: string, minute: number): MessageRow {
  return {
    id,
    sessionId: "sess-1",
    createdAt: new Date(Date.UTC(2026, 9, 17, 12, minute)),
  };
}

function proposal(
  requestMessageId: string,
  status: string,
  expiresInMs = HOUR_MS,
): ProposalRow {
  return {
    id: `prop-${requestMessageId}-${status}`,
    sessionId: "sess-1",
    requestMessageId,
    status,
    expiresAt: new Date(Date.now() + expiresInMs),
  };
}

async function truncate(body: {
  afterMessageId: string;
  includeMessage?: boolean;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await POST(
    new NextRequest(
      "http://localhost/api/ai/sessions/sess-1/messages/truncate-after",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ id: "sess-1" }) },
  );
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

beforeEach(() => {
  // u1 -> a1 -> u2 -> a2 (u = user message, a = assistant message)
  store.messages = [
    message("u1", 1),
    message("a1", 2),
    message("u2", 3),
    message("a2", 4),
  ];
  store.proposals = [];
});

describe("POST truncate-after — proposal-bound messages", () => {
  it.each(["pending", "approved", "executing", "failed"])(
    "refuses with 409 and deletes nothing while a %s proposal is bound to a doomed message",
    async (status) => {
      store.proposals = [proposal("u2", status)];

      const result = await truncate({ afterMessageId: "u2" });

      expect(result.status).toBe(409);
      expect(result.json).toMatchObject({ code: "AI_PROPOSAL_PENDING" });
      expect(store.messages.map((row) => row.id)).toEqual([
        "u1",
        "a1",
        "u2",
        "a2",
      ]);
    },
  );

  it("refuses when the bound message lies after the anchor (tail truncation)", async () => {
    store.proposals = [proposal("u2", "pending")];

    const result = await truncate({ afterMessageId: "a1", includeMessage: false });

    expect(result.status).toBe(409);
    expect(store.messages).toHaveLength(4);
  });

  it("allows truncation when the bound message is kept (anchor kept, proposal on the anchor)", async () => {
    store.proposals = [proposal("u2", "pending")];

    const result = await truncate({ afterMessageId: "u2", includeMessage: false });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ deleted: 1 });
    expect(store.messages.map((row) => row.id)).toEqual(["u1", "a1", "u2"]);
  });

  it.each(["succeeded", "rejected", "expired", "conflict"])(
    "does not block on a final %s proposal",
    async (status) => {
      store.proposals = [proposal("u2", status)];

      const result = await truncate({ afterMessageId: "u2" });

      expect(result.status).toBe(200);
      expect(result.json).toEqual({ deleted: 2 });
    },
  );

  it("does not block on a pending proposal that is already past its expiry", async () => {
    store.proposals = [proposal("u2", "pending", -1_000)];

    const result = await truncate({ afterMessageId: "u2" });

    expect(result.status).toBe(200);
  });

  it("ignores proposals bound to messages outside the deleted tail", async () => {
    store.proposals = [proposal("u1", "pending")];

    const result = await truncate({ afterMessageId: "u2" });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ deleted: 2 });
  });
});
