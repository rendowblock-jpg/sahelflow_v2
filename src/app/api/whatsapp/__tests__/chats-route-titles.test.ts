import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// F-0028: GET /api/whatsapp/chats used to answer `name: contactName || sourceId`, so a conversation with no name was titled
// with the raw WhatsApp id. The answer now carries only a real name ("" when there is none); the inbox forms the title.
// Stand-ins as in chats-route-sidecar-probe.test.ts (error wrapper, permission checks, assignment lookup, sidecar, database).
const h = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/api/with-error-handler", () => ({ withErrorHandler: (handler: unknown) => handler }));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({ shop: { shopId: "shop-a" } })),
  assertTrustedAction: vi.fn(),
}));
vi.mock("@/lib/identity/conversation-projection", () => ({ projectTrustedActorActions: () => [] }));
vi.mock("@/lib/identity/team-directory", () => ({ listTeamMembers: vi.fn(async () => []) }));
vi.mock("@/lib/inbox/conversation-assignment", () => ({
  getConversationAssignmentVersions: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>()),
  sidecar: { status: vi.fn(async () => ({ status: "connected" })) },
}));
vi.mock("@/lib/db", () => ({ db: { conversation: { findMany: h.findMany } }, shopContext: { shopId: "shop-a" } }));

import { GET } from "@/app/api/whatsapp/chats/route";

function row(id: string, sourceId: string, contactName: string) {
  return {
    id,
    sourceId,
    contactName,
    contactPhone: null,
    unreadCount: 1,
    status: "open",
    assigneeId: null,
    priority: "normal",
    labels: null,
    snoozedUntil: null,
    waitingSince: null,
    firstReplyAt: null,
    pinnedAt: null,
    mutedUntil: null,
    archivedAt: null,
    messages: [],
  };
}

describe("GET /api/whatsapp/chats names (F-0028)", () => {
  beforeEach(() => {
    h.findMany.mockReset().mockResolvedValue([
      row("c1", "202460866064562@lid", "202460866064562@lid"),
      row("c2", "54783113175105@lid", "54783113175105"),
      row("c3", "213791999157@s.whatsapp.net", "Amel"),
      row("c4", "213791999158@s.whatsapp.net", "213791999158"),
    ]);
  });

  it("answers a real name, and an empty name instead of the raw id", async () => {
    const response = await (GET as unknown as (request: NextRequest) => Promise<Response>)(
      new NextRequest("http://localhost/api/whatsapp/chats"),
    );
    const body = (await response.json()) as { chats: Array<{ conversationId: string; name: string; jid: string }> };
    const names = Object.fromEntries(body.chats.map((chat) => [chat.conversationId, chat.name]));
    expect(names).toEqual({ c1: "", c2: "", c3: "Amel", c4: "" });
    // The address stays available to the client for sending and for classifying the row.
    expect(body.chats.find((chat) => chat.conversationId === "c1")?.jid).toBe("202460866064562@lid");
  });
});
