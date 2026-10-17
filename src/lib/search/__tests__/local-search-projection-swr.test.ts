import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S09b-02: every WhatsApp message bumps the 'conversation' search revision, so
// the next palette search used to AWAIT a full re-read of every conversation.
// Only that slot is stale-while-revalidate: with an index already in memory the
// search answers from it at once and one background rebuild refreshes it.

const state = vi.hoisted(() => ({
  revisions: {} as Record<string, number>,
  conversations: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  conversationFindMany: vi.fn(),
  productFindMany: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    searchProjectionRevision: { findUnique: mocks.findUnique },
    conversation: { findMany: mocks.conversationFindMany },
    product: { findMany: mocks.productFindMany },
  },
  shopContext: { shopId: "shop-1" },
}));
vi.mock("@/lib/crypto/protected-record", () => ({
  deriveExistingShopBlindIndexes: vi.fn(),
  deriveShopBlindIndexes: vi.fn(),
}));
vi.mock("@/lib/shared", () => ({ deliveryProviderConfig: {} }));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  projectedConversationContacts,
  searchProjectedConversations,
  searchProjectedProducts,
  warmLocalSearchProjection,
} from "@/lib/search/local-search-projection";

const SHOP = "shop-1";

function conversation(id: string, contactName: string) {
  return {
    id,
    channel: "whatsapp",
    contactName,
    contactPhone: null,
    lastMessageAt: new Date("2026-10-01T10:00:00Z"),
    updatedAt: new Date("2026-10-01T10:00:00Z"),
  };
}

function product(id: string, name: string) {
  return {
    id,
    name,
    sku: null,
    updatedAt: new Date("2026-10-01T10:00:00Z"),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Mock promises settle in microtasks, so a few macrotask turns drain everything
// a search can do without a pending gate.
async function flush(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function settles<T>(
  promise: Promise<T>,
): Promise<{ done: boolean; value?: T }> {
  const outcome: { done: boolean; value?: T } = { done: false };
  promise.then(
    (value) => {
      outcome.done = true;
      outcome.value = value;
    },
    () => {
      outcome.done = true;
    },
  );
  await flush();
  return outcome;
}

function labels(rows: ReadonlyArray<{ label: string }>): string[] {
  return rows.map((row) => row.label);
}

const globalCache = globalThis as unknown as {
  sahelflowLocalSearchProjection?: unknown;
};

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  delete globalCache.sahelflowLocalSearchProjection;
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  state.revisions = { conversation: 1, product: 1, delivery: 1, return: 1 };
  state.conversations = [conversation("c1", "Amina Benali")];
  state.products = [product("p1", "Bracelet argent")];
  mocks.findUnique.mockReset();
  mocks.conversationFindMany.mockReset();
  mocks.productFindMany.mockReset();
  mocks.loggerWarn.mockReset();
  mocks.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => ({
      revision: state.revisions[where.id] ?? 1,
    }),
  );
  mocks.conversationFindMany.mockImplementation(async () => [
    ...state.conversations,
  ]);
  mocks.productFindMany.mockImplementation(async () => [...state.products]);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  delete globalCache.sahelflowLocalSearchProjection;
});

describe("conversation projection: stale-while-revalidate", () => {
  it("still awaits the build when no index exists yet", async () => {
    const gate = deferred<Array<Record<string, unknown>>>();
    mocks.conversationFindMany.mockImplementationOnce(() => gate.promise);

    const search = searchProjectedConversations(SHOP, "amina");
    const early = await settles(search);
    expect(early.done).toBe(false);

    gate.resolve(state.conversations);
    expect(labels(await search)).toEqual(["Amina Benali"]);
  });

  it("answers from the cached index while the revision is unchanged", async () => {
    await searchProjectedConversations(SHOP, "amina");
    await searchProjectedConversations(SHOP, "amina");
    await searchProjectedConversations(SHOP, "benali");

    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(1);
  });

  it("serves the existing index at once when the revision is stale and rebuilds once in the background", async () => {
    await searchProjectedConversations(SHOP, "amina");
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(1);

    // A WhatsApp message arrives: lastMessageAt moves, the trigger bumps the
    // revision, and a brand new contact exists.
    state.revisions.conversation = 2;
    state.conversations = [
      conversation("c1", "Amina Benali"),
      conversation("c2", "Zohra Khelifi"),
    ];
    const rebuild = deferred<Array<Record<string, unknown>>>();
    mocks.conversationFindMany.mockImplementationOnce(() => rebuild.promise);

    const search = searchProjectedConversations(SHOP, "amina");
    const outcome = await settles(search);

    expect(outcome.done).toBe(true);
    expect(labels(outcome.value ?? [])).toEqual(["Amina Benali"]);
    // Exactly one rebuild was started, and it is still running.
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);

    // The new contact is missing until the rebuild lands (the stated trade-off).
    expect(await searchProjectedConversations(SHOP, "zohra")).toEqual([]);

    rebuild.resolve(state.conversations);
    await flush();
    expect(labels(await searchProjectedConversations(SHOP, "zohra"))).toEqual([
      "Zohra Khelifi",
    ]);
  });

  it("is single flight: searches during a rebuild reuse it instead of starting another", async () => {
    await searchProjectedConversations(SHOP, "amina");
    state.revisions.conversation = 2;
    const rebuild = deferred<Array<Record<string, unknown>>>();
    mocks.conversationFindMany.mockImplementationOnce(() => rebuild.promise);

    const searches = await settles(
      Promise.all([
        searchProjectedConversations(SHOP, "amina"),
        searchProjectedConversations(SHOP, "benali"),
        projectedConversationContacts(SHOP, ["c1"]),
        searchProjectedConversations(SHOP, "ami"),
      ]),
    );

    expect(searches.done).toBe(true);
    expect(searches.value).toHaveLength(4);
    // 1 initial build + exactly 1 background rebuild.
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);

    rebuild.resolve(state.conversations);
    await flush();
    await searchProjectedConversations(SHOP, "amina");
    // The finished rebuild is current: no further read.
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);
  });

  it("hands the contact lookup of the recent-message leg the stale index too", async () => {
    await searchProjectedConversations(SHOP, "amina");
    state.revisions.conversation = 2;
    mocks.conversationFindMany.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );

    const contacts = await settles(projectedConversationContacts(SHOP, ["c1"]));

    expect(contacts.done).toBe(true);
    expect(contacts.value?.get("c1")?.label).toBe("Amina Benali");
  });

  it("lets the warm-up return without waiting for a rebuild", async () => {
    await searchProjectedConversations(SHOP, "amina");
    state.revisions.conversation = 2;
    mocks.conversationFindMany.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );

    const warm = await settles(
      warmLocalSearchProjection(SHOP, {
        customer: false,
        product: false,
        order: false,
        delivery: false,
        return: false,
        conversation: true,
      }),
    );

    expect(warm.done).toBe(true);
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the old index when a background rebuild fails, with no unhandled rejection", async () => {
    await searchProjectedConversations(SHOP, "amina");
    state.revisions.conversation = 2;
    mocks.conversationFindMany.mockImplementationOnce(async () => {
      throw new Error("database is busy");
    });

    const during = await searchProjectedConversations(SHOP, "amina");
    await flush();

    expect(labels(during)).toEqual(["Amina Benali"]);
    expect(unhandled).toEqual([]);
    // Logged by error name only: no message text, no contact data.
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      "search.projection.background-rebuild-failed",
      { slot: "conversation", failure: "Error" },
    );

    // Not poisoned: the old index is still served at once, and the failed
    // rebuild is not stuck "in flight", so this search starts a fresh one.
    state.conversations = [
      conversation("c1", "Amina Benali"),
      conversation("c2", "Zohra Khelifi"),
    ];
    const retry = deferred<Array<Record<string, unknown>>>();
    mocks.conversationFindMany.mockImplementationOnce(() => retry.promise);

    const after = await settles(searchProjectedConversations(SHOP, "amina"));
    expect(after.done).toBe(true);
    expect(labels(after.value ?? [])).toEqual(["Amina Benali"]);
    // initial build + failed rebuild + retry
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(3);

    retry.resolve(state.conversations);
    await flush();
    expect(labels(await searchProjectedConversations(SHOP, "zohra"))).toEqual([
      "Zohra Khelifi",
    ]);
    expect(unhandled).toEqual([]);
  });

  it("survives live traffic that keeps moving the revision during a rebuild", async () => {
    await searchProjectedConversations(SHOP, "amina");
    state.revisions.conversation = 2;
    // Every page read lands while another message arrives: the stable-build
    // check gives up after its attempts ("changed continuously").
    mocks.conversationFindMany.mockImplementation(async () => {
      state.revisions.conversation = (state.revisions.conversation ?? 0) + 1;
      return [...state.conversations];
    });

    const during = await searchProjectedConversations(SHOP, "amina");
    await flush();

    expect(labels(during)).toEqual(["Amina Benali"]);
    expect(unhandled).toEqual([]);
    expect(labels(await searchProjectedConversations(SHOP, "amina"))).toEqual([
      "Amina Benali",
    ]);
  });

  it("still surfaces a failed FIRST build and retries it next time (unchanged behaviour)", async () => {
    mocks.conversationFindMany.mockImplementationOnce(async () => {
      throw new Error("database is busy");
    });

    await expect(searchProjectedConversations(SHOP, "amina")).rejects.toThrow(
      "database is busy",
    );
    expect(labels(await searchProjectedConversations(SHOP, "amina"))).toEqual([
      "Amina Benali",
    ]);
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);
  });

  it("keeps one cache per shop id", async () => {
    await searchProjectedConversations("shop-a", "amina");
    await searchProjectedConversations("shop-b", "amina");
    await searchProjectedConversations("shop-a", "amina");
    await searchProjectedConversations("shop-b", "amina");

    // Each shop id built its own index once; neither borrowed the other's.
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(2);

    state.revisions.conversation = 2;
    const gate = deferred<Array<Record<string, unknown>>>();
    mocks.conversationFindMany.mockImplementationOnce(() => gate.promise);
    const shopA = await settles(searchProjectedConversations("shop-a", "amina"));
    // shop-a started its rebuild; shop-b is stale as well and starts its own.
    mocks.conversationFindMany.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );
    const shopB = await settles(searchProjectedConversations("shop-b", "amina"));
    expect(shopA.done).toBe(true);
    expect(shopB.done).toBe(true);
    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(4);
    gate.resolve(state.conversations);
  });
});

describe("other projection slots are NOT stale-while-revalidate", () => {
  it("a product written after the index was built is visible to the very next search", async () => {
    await searchProjectedProducts(SHOP, "bracelet");
    state.revisions.product = 2;
    state.products = [
      product("p1", "Bracelet argent"),
      product("p2", "Bracelet or"),
    ];

    const results = await searchProjectedProducts(SHOP, "bracelet");

    expect(labels(results).sort()).toEqual(["Bracelet argent", "Bracelet or"]);
    expect(mocks.productFindMany).toHaveBeenCalledTimes(2);
  });
});
