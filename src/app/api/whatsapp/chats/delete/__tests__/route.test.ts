import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  actorContext: {
    shop: { shopId: "shop-a", shopIncarnationId: "3".repeat(32) },
  },
  deleteChats: vi.fn(),
  db: {},
}));

vi.mock("@/lib/db", () => ({
  db: harness.db,
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => harness.actorContext),
}));

vi.mock("@/lib/whatsapp/chat-delete", () => ({
  deleteWhatsAppChats: harness.deleteChats,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; code?: string; statusCode?: number };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { POST } from "@/app/api/whatsapp/chats/delete/route";

function deleteRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/whatsapp/chats/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.deleteChats.mockReset().mockResolvedValue({
    deletedConversationIds: ["conv-1"],
    deletedMessageCount: 4,
  });
});

describe("POST /api/whatsapp/chats/delete — self-diagnosing rejections (campaign B5 round 3)", () => {
  it("deletes with a valid canonical id payload", async () => {
    const response = await POST(
      deleteRequest(JSON.stringify({ ids: ["conv-1"] })),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; deleted: number };
    expect(body).toMatchObject({ ok: true, deleted: 1 });
    expect(harness.deleteChats).toHaveBeenCalledWith(expect.anything(), [
      "conv-1",
    ]);
  });

  it("rejects a malformed JSON body with the code plus the PII-free shape", async () => {
    const response = await POST(deleteRequest("{not json"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      code: string;
      rejection: { reason: string; bodyLength: number };
    };
    expect(body.code).toBe("INVALID_DELETE_REQUEST");
    expect(body.rejection).toMatchObject({
      reason: "malformed_json",
      bodyLength: "{not json".length,
    });
  });

  it("rejects an oversized id with the failing schema path and id lengths", async () => {
    const longId = "x".repeat(78);
    const rawBody = JSON.stringify({ ids: [longId] });
    const response = await POST(deleteRequest(rawBody));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      code: string;
      rejection: {
        reason: string;
        issues: string[];
        idCount: number;
        idLengths: number[];
        bodyLength: number;
      };
    };
    expect(body.code).toBe("INVALID_DELETE_REQUEST");
    expect(body.rejection.reason).toBe("schema_violation");
    expect(body.rejection.issues).toContain("ids.0");
    expect(body.rejection.idCount).toBe(1);
    expect(body.rejection.idLengths).toEqual([78]);
    expect(body.rejection.bodyLength).toBe(rawBody.length);
    // Ids are never echoed — only their shape.
    expect(JSON.stringify(body)).not.toContain(longId);
  });

  it("rejects an empty ids array naming the ids path", async () => {
    const response = await POST(deleteRequest(JSON.stringify({ ids: [] })));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      rejection: { reason: string; issues: string[] };
    };
    expect(body.rejection.reason).toBe("schema_violation");
    expect(body.rejection.issues).toContain("ids");
  });

  it("rejects non-string ids with lengths recorded as -1 and no id values", async () => {
    const rawBody = JSON.stringify({ ids: [12345] });
    const response = await POST(deleteRequest(rawBody));
    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      rejection: { idLengths: number[] };
    };
    expect(body.rejection.idLengths).toEqual([-1]);
    expect(JSON.stringify(body)).not.toContain("12345");
  });

  it("never echoes id values in any rejection payload", async () => {
    const secretishId = "conv-with-possibly-sensitive-reference-000";
    const response = await POST(
      deleteRequest(JSON.stringify({ ids: [secretishId, ""] })),
    );
    expect(response.status).toBe(400);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain(secretishId);
  });

  it("names ids that resolved to nothing instead of silently absorbing them (audit S3-20)", async () => {
    harness.deleteChats.mockResolvedValueOnce({
      deletedConversationIds: ["conv-1"],
      deletedMessageCount: 4,
    });
    const response = await POST(
      deleteRequest(JSON.stringify({ ids: ["conv-1", "conv-ghost"] })),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      deleted: number;
      notFoundIds: string[];
    };
    expect(body).toMatchObject({ ok: true, deleted: 1 });
    expect(body.notFoundIds).toEqual(["conv-ghost"]);
  });

  it("returns an empty notFoundIds list when every id resolved", async () => {
    const response = await POST(
      deleteRequest(JSON.stringify({ ids: ["conv-1"] })),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { notFoundIds: string[] };
    expect(body.notFoundIds).toEqual([]);
  });
});
