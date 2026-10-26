import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two safety valves of the indexed conversation search, through the REAL runtime wiring with a stand-in `db`:
 * the env off switch (SF_CONVERSATION_SEARCH_INDEX=off, read at call time) and the circuit breaker (3 failures in a
 * row in one process: the old way until restart; one success resets the count). The spy counts every raw SQL call,
 * the only way the runtime reaches the index.
 */
const h = vi.hoisted(() => ({ raw: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const helpers = await import("@/lib/data/__tests__/helpers");
  const row = (id: string, name: string, bodies: string[]) => ({
    id,
    channel: "whatsapp",
    contactName: name,
    contactPhone: null,
    sourceId: `source-${id}`,
    lastMessageAt: new Date("2026-10-20T10:00:00Z"),
    unreadCount: 0,
    status: "open",
    assigneeId: null,
    priority: null,
    labels: null,
    snoozedUntil: null,
    waitingSince: null,
    firstReplyAt: null,
    messages: bodies.map((body, at) => ({ id: `${id}:${at}`, conversationId: id, body, direction: "inbound", timestamp: new Date(Date.UTC(2026, 9, 20, 10) - at * 60_000) })),
  });
  const shop = [row("a", "Amine Benali", ["salam", "livraison à Oran"]), row("b", "Karim Bensalem", ["merci", "colis arrivé"])];
  return {
    shopContext: helpers.TEST_SHOP_CONTEXT,
    db: {
      $queryRawUnsafe: h.raw,
      conversation: {
        findMany: async (args: { select?: unknown; where?: { id: { in: string[] } } }) =>
          args.select ? shop.map(({ id }) => ({ id })) : shop.filter((entry) => args.where!.id.in.includes(entry.id)),
      },
      message: { findMany: async () => [] },
    },
  };
});

const SWITCH = "SF_CONVERSATION_SEARCH_INDEX";
let search: typeof import("@/lib/search/conversation-search-runtime").searchConversationsIndexed;
const ask = async () => (await search({ query: "livraison", canReadContact: false })).map((row) => row.id);
const failing = () => h.raw.mockRejectedValue(new Error("index is busy"));
const working = () => h.raw.mockResolvedValue([]);

beforeEach(async () => {
  delete process.env[SWITCH];
  h.raw.mockReset();
  working();
  vi.resetModules(); // a fresh breaker for each test
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  search = (await import("@/lib/search/conversation-search-runtime")).searchConversationsIndexed;
});
afterEach(() => {
  delete process.env[SWITCH];
  vi.restoreAllMocks();
});

describe("SF_CONVERSATION_SEARCH_INDEX=off", () => {
  it("is read at call time, answers the old way over the window and asks the index nothing", async () => {
    expect(await ask()).toEqual(["a"]);
    expect(h.raw).toHaveBeenCalled(); // the spy does see the index when it is on
    h.raw.mockClear();
    process.env[SWITCH] = "off"; // set AFTER the module was imported
    expect(await ask()).toEqual(["a"]);
    expect(h.raw).not.toHaveBeenCalled();
    process.env[SWITCH] = " OFF ";
    expect(await ask()).toEqual(["a"]);
    expect(h.raw).not.toHaveBeenCalled();
    delete process.env[SWITCH];
    expect(await ask()).toEqual(["a"]);
    expect(h.raw).toHaveBeenCalled();
  });

  it("beats a breaker that is closed, a working index and an index that would answer", async () => {
    process.env[SWITCH] = "off";
    working();
    for (let round = 0; round < 4; round += 1) expect(await ask()).toEqual(["a"]);
    expect(h.raw).not.toHaveBeenCalled();
  });
});

describe("the circuit breaker", () => {
  it("opens after exactly 3 failures in a row and stays open, and every answer stays right", async () => {
    failing();
    const calls: number[] = [];
    for (let round = 0; round < 5; round += 1) {
      expect(await ask()).toEqual(["a"]);
      calls.push(h.raw.mock.calls.length);
    }
    expect(calls[0]).toBeGreaterThan(0);
    expect(calls[1]).toBeGreaterThan(calls[0]!);
    expect(calls[2]).toBeGreaterThan(calls[1]!); // the third search still asks the index (and fails)
    expect(calls[3]).toBe(calls[2]); // open: the old way
    expect(calls[4]).toBe(calls[2]);
    working(); // even an index that works again is not asked until restart
    expect(await ask()).toEqual(["a"]);
    expect(h.raw.mock.calls.length).toBe(calls[2]);
  });

  it("is reset by one success before the third failure", async () => {
    failing();
    await ask();
    await ask(); // 2 failures
    working();
    await ask(); // a success resets the count
    failing();
    await ask();
    await ask(); // 2 failures again: still closed
    const before = h.raw.mock.calls.length;
    await ask(); // the third in a row: asks, fails, opens
    expect(h.raw.mock.calls.length).toBeGreaterThan(before);
    const opened = h.raw.mock.calls.length;
    await ask();
    expect(h.raw.mock.calls.length).toBe(opened);
  });
});
