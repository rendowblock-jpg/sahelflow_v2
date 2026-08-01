import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAction: vi.fn(),
  resolveRead: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  project: vi.fn((conversation: unknown) => conversation),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
}));

vi.mock("@/lib/identity/conversation-projection", () => ({
  projectConversationForTrustedActor: harness.project,
}));

vi.mock("@/lib/data/conversation-service", () => ({
  resolveConversationIdForRead: harness.resolveRead,
}));

vi.mock("@/lib/db", () => ({
  db: {
    conversation: {
      findUnique: harness.findUnique,
      update: harness.update,
    },
  },
  shopContext: { shopId: "default" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET } from "@/app/api/conversations/[id]/route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/conversations/[id] authority", () => {
  beforeEach(() => {
    harness.requireAction.mockReset().mockResolvedValue({
      actor: { kind: "person" },
      shop: { shopId: "default" },
    });
    harness.resolveRead.mockReset().mockResolvedValue("conversation-1");
    harness.findUnique.mockReset().mockResolvedValue({
      id: "conversation-1",
      contactName: "Amina",
      contactPhone: "0555000000",
      sourceId: "213555000000@s.whatsapp.net",
      unreadCount: 4,
      messages: [],
    });
    harness.update.mockReset();
    harness.project.mockClear();
  });

  it("denies before resolving a live JID or reading conversation data", async () => {
    harness.requireAction.mockRejectedValue(new Error("forbidden"));

    await expect(
      GET(
        new NextRequest("http://localhost/api/conversations/raw"),
        context("213555000000@s.whatsapp.net"),
      ),
    ).rejects.toThrow("forbidden");
    expect(harness.resolveRead).not.toHaveBeenCalled();
    expect(harness.findUnique).not.toHaveBeenCalled();
  });

  it("does not create or update state while reading an unread conversation", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/conversations/raw"),
      context("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(200);
    expect(harness.resolveRead).toHaveBeenCalledWith(
      expect.anything(),
      "213555000000@s.whatsapp.net",
    );
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.project).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown live JID without creating it", async () => {
    harness.resolveRead.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/raw"),
      context("213555000000@s.whatsapp.net"),
    );

    expect(response.status).toBe(404);
    expect(harness.findUnique).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
  });
});
