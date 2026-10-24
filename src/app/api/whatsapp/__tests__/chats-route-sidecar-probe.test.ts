import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/whatsapp/chats answers from the shop database; the sidecar is only asked for its status as a side note. S05a-09: the
// answer used to wait for that status after the database work, so a slow sidecar delayed the whole chat list by up to the client's
// 8 s default. The status is now asked in parallel with the database work and gets about 1.5 s; a sidecar that does not answer
// in time reads as "not reachable" (the same answer as a sidecar that is down).
//
// Real code under test: the route and the real error classes of the sidecar client (so instanceof works). Stand-ins: the error
// wrapper (passes the handler through), the permission checks, the assignment-version lookup, the sidecar status call and the
// database handle. What this file does NOT test: the real sidecar request, its own abort timer, or the rows Prisma would return.
const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  sidecarStatus: vi.fn(),
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({ shop: { shopId: "shop-a" } })),
  assertTrustedAction: vi.fn(),
}));
vi.mock("@/lib/identity/conversation-projection", () => ({
  projectTrustedActorActions: () => [],
}));
vi.mock("@/lib/identity/team-directory", () => ({ listTeamMembers: vi.fn(async () => []) }));
vi.mock("@/lib/inbox/conversation-assignment", () => ({
  getConversationAssignmentVersions: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/whatsapp/sidecar-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/sidecar-client")>()),
  sidecar: { status: h.sidecarStatus },
}));
vi.mock("@/lib/db", () => ({
  db: { conversation: { findMany: h.findMany } },
  shopContext: { shopId: "shop-a" },
}));

import { GET } from "@/app/api/whatsapp/chats/route";
import { SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

const PROBE_BOUND_MS = 1_500;

function conversationRow() {
  return {
    id: "conv-1",
    sourceId: "213550000000@s.whatsapp.net",
    contactName: "Amel",
    contactPhone: "213550000000",
    unreadCount: 2,
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

function call() {
  return (GET as unknown as (request: NextRequest) => Promise<Response>)(
    new NextRequest("http://localhost/api/whatsapp/chats"),
  );
}

describe("GET /api/whatsapp/chats sidecar status probe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.findMany.mockReset().mockResolvedValue([conversationRow()]);
    h.sidecarStatus.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the chats within the bound when the sidecar never answers", async () => {
    h.sidecarStatus.mockReturnValue(new Promise(() => {}));
    const settled = vi.fn();
    const pending = call().then(settled);

    await vi.advanceTimersByTimeAsync(PROBE_BOUND_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
  });

  it("reads a sidecar that does not answer in time as not reachable, with the chats intact", async () => {
    h.sidecarStatus.mockReturnValue(new Promise(() => {}));
    const pending = call();
    await vi.advanceTimersByTimeAsync(PROBE_BOUND_MS);
    const body = await (await pending).json();
    expect(body.sidecarReachable).toBe(false);
    expect(body.sidecarStatus).toBeNull();
    expect(body.source).toBe("database");
    expect(body.chats).toHaveLength(1);
    expect(body.chats[0].conversationId).toBe("conv-1");
  });

  it("asks the sidecar while the database is still working, with the short timeout", async () => {
    let releaseDatabase: (rows: unknown[]) => void = () => {};
    h.findMany.mockReturnValue(new Promise((resolve) => (releaseDatabase = resolve)));
    h.sidecarStatus.mockResolvedValue({ status: "connected" });
    const pending = call();

    await vi.advanceTimersByTimeAsync(0);
    expect(h.sidecarStatus).toHaveBeenCalledTimes(1);
    expect(h.sidecarStatus).toHaveBeenCalledWith(PROBE_BOUND_MS);

    releaseDatabase([conversationRow()]);
    const body = await (await pending).json();
    expect(body.sidecarReachable).toBe(true);
    expect(body.sidecarStatus).toBe("connected");
    expect(body.chats).toHaveLength(1);
  });

  it("keeps a sidecar that is down as not reachable", async () => {
    h.sidecarStatus.mockRejectedValue(new SidecarUnavailableError("sidecar down"));
    const body = await (await call()).json();
    expect(body.sidecarReachable).toBe(false);
    expect(body.sidecarStatus).toBeNull();
    expect(body.chats).toHaveLength(1);
  });

  it("still fails the request for an error that is not a sidecar error", async () => {
    h.sidecarStatus.mockRejectedValue(new TypeError("bug"));
    await expect(call()).rejects.toThrow("bug");
  });

  it("does not leave an unhandled rejection when the database fails first", async () => {
    h.findMany.mockRejectedValue(new Error("database down"));
    h.sidecarStatus.mockRejectedValue(new SidecarUnavailableError("sidecar down"));
    await expect(call()).rejects.toThrow("database down");
    await vi.advanceTimersByTimeAsync(PROBE_BOUND_MS * 2);
  });
});
