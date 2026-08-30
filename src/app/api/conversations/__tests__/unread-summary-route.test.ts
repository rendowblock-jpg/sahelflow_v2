import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const projectFullContact = (conversation: unknown) => ({
    ...(conversation as Record<string, unknown>),
    contactName: (conversation as { contactName: string | null }).contactName,
    contactPhone: (conversation as { contactPhone: string | null })
      .contactPhone,
    sourceId: null,
    fieldAccess: { contact: true },
  });
  return {
    requireAction: vi.fn(),
    project: vi.fn(projectFullContact),
    projectFullContact,
    aggregate: vi.fn(),
    findMany: vi.fn(),
  };
});

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
}));

vi.mock("@/lib/identity/conversation-projection", () => ({
  projectConversationForTrustedActor: harness.project,
}));

vi.mock("@/lib/db", () => ({
  db: {
    conversation: {
      aggregate: harness.aggregate,
      findMany: harness.findMany,
    },
  },
  shopContext: { shopId: "default" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET } from "@/app/api/conversations/unread-summary/route";

const latestRow = (overrides: Record<string, unknown> = {}) => ({
  id: "conversation-1",
  contactName: "Amina",
  contactPhone: "0555000000",
  unreadCount: 4,
  lastMessageAt: new Date("2026-01-01T10:00:00Z"),
  messages: [{ body: "Salam, is the parcel ready?" }],
  ...overrides,
});

describe("GET /api/conversations/unread-summary", () => {
  beforeEach(() => {
    harness.requireAction.mockReset().mockResolvedValue({
      actor: { kind: "person" },
      shop: { shopId: "default" },
    });
    harness.aggregate.mockReset().mockResolvedValue({
      _sum: { unreadCount: 7 },
      _count: 3,
    });
    harness.findMany.mockReset().mockResolvedValue([latestRow()]);
    harness.project
      .mockReset()
      .mockImplementation(harness.projectFullContact);
  });

  it("requires the conversations.read authority before any read", async () => {
    harness.requireAction.mockRejectedValue(new Error("forbidden"));

    await expect(
      GET(new NextRequest("http://localhost/api/conversations/unread-summary")),
    ).rejects.toThrow("forbidden");
    expect(harness.aggregate).not.toHaveBeenCalled();
    expect(harness.findMany).not.toHaveBeenCalled();
  });

  it("sums unread messages and counts unread conversations", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );
    const payload = (await response.json()) as {
      total: number;
      conversations: number;
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ total: 7, conversations: 3, latest: expect.any(Object) });
    expect(harness.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unreadCount: { gt: 0 } } }),
    );
  });

  it("reads the same unreadCount column the inbox renders", async () => {
    await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );

    const summaryWhere = harness.aggregate.mock.calls[0]?.[0]?.where;
    expect(summaryWhere).toEqual({ unreadCount: { gt: 0 } });
    const latestWhere = harness.findMany.mock.calls[0]?.[0]?.where;
    expect(latestWhere).toEqual({ unreadCount: { gt: 0 } });
  });

  it("builds the latest preview from inbound messages only", async () => {
    await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );

    const messages = harness.findMany.mock.calls[0]?.[0]?.select?.messages;
    expect(messages).toEqual({
      where: { direction: "inbound" },
      orderBy: { timestamp: "desc" },
      take: 1,
      select: { body: true },
    });
  });

  it("projects the latest conversation through the trusted-actor contact policy", async () => {
    await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );

    expect(harness.project).toHaveBeenCalledTimes(1);
    expect(harness.project).toHaveBeenCalledWith(
      expect.objectContaining({ contactName: "Amina" }),
      expect.anything(),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );
    const payload = (await response.json()) as {
      latest: { name: string | null; preview: string | null };
    };
    expect(payload.latest?.name).toBe("Amina");
    expect(payload.latest?.preview).toBe("Salam, is the parcel ready?");
  });

  it("returns a title-only summary when contact identity is restricted", async () => {
    harness.project.mockImplementation((conversation: unknown) => ({
      ...(conversation as Record<string, unknown>),
      contactName: null,
      contactPhone: null,
      sourceId: null,
      fieldAccess: { contact: false },
    }));

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );
    const payload = (await response.json()) as {
      total: number;
      latest: { name: string | null; preview: string | null } | null;
    };

    expect(payload.total).toBe(7);
    expect(payload.latest?.name).toBeNull();
    expect(payload.latest?.preview).toBeNull();
  });

  it("collapses whitespace and truncates long previews on a code-point boundary", async () => {
    harness.findMany.mockResolvedValue([
      latestRow({
        messages: [
          {
            body: `Salam,\n\nI want   two parcels\tplease — ${"شكرا جزيلا ".repeat(20)}`,
          },
        ],
      }),
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );
    const payload = (await response.json()) as {
      latest: { preview: string | null };
    };

    expect(payload.latest?.preview).not.toBeNull();
    expect(payload.latest?.preview).not.toMatch(/\s{2,}/);
    expect(payload.latest?.preview).not.toMatch(/\n|\t/);
    const withoutEllipsis = payload.latest?.preview?.slice(0, -1) ?? "";
    expect(Array.from(withoutEllipsis)).toHaveLength(80);
    expect(payload.latest?.preview?.endsWith("…")).toBe(true);
  });

  it("reports a clean zero state when everything is read", async () => {
    harness.aggregate.mockResolvedValue({
      _sum: { unreadCount: 0 },
      _count: 0,
    });
    harness.findMany.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/conversations/unread-summary"),
    );
    const payload = (await response.json()) as {
      total: number;
      conversations: number;
      latest: unknown;
    };

    expect(payload).toEqual({ total: 0, conversations: 0, latest: null });
    expect(harness.project).not.toHaveBeenCalled();
  });
});
