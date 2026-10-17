import { beforeEach, describe, expect, it, vi } from "vitest";

// S09b-01: the browser aborts a palette search the moment the seller types the
// next letter, but the server used to finish every superseded search. The
// signal is only ever CHECKED at phase boundaries here; it is never handed to
// the shared projection builds, because other searches await those promises.

const mocks = vi.hoisted(() => ({
  requireTrustedActor: vi.fn(),
  trustedActionAllowed: vi.fn(),
  deriveExistingShopBlindIndex: vi.fn(),
  conversationFindMany: vi.fn(),
  orderFindMany: vi.fn(),
  searchProjectedCustomers: vi.fn(),
  searchProjectedProducts: vi.fn(),
  searchProjectedConversations: vi.fn(),
  searchProjectedDeliveries: vi.fn(),
  searchProjectedReturns: vi.fn(),
  searchProjectedOrders: vi.fn(),
  projectedConversationContacts: vi.fn(),
  projectedCustomerNames: vi.fn(),
  projectedOrdersForCustomers: vi.fn(),
  warmLocalSearchProjection: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/crypto/protected-record", () => ({
  deriveExistingShopBlindIndex: mocks.deriveExistingShopBlindIndex,
}));
vi.mock("@/lib/db", () => ({
  db: {
    conversation: { findMany: mocks.conversationFindMany },
    order: { findMany: mocks.orderFindMany },
  },
}));
vi.mock("@/lib/identity/authorization", () => ({
  trustedActionAllowed: mocks.trustedActionAllowed,
}));
vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: mocks.requireTrustedActor,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock("@/lib/search/local-search-projection", () => ({
  projectedConversationContacts: mocks.projectedConversationContacts,
  projectedCustomerNames: mocks.projectedCustomerNames,
  projectedOrdersForCustomers: mocks.projectedOrdersForCustomers,
  searchProjectedConversations: mocks.searchProjectedConversations,
  searchProjectedCustomers: mocks.searchProjectedCustomers,
  searchProjectedDeliveries: mocks.searchProjectedDeliveries,
  searchProjectedOrders: mocks.searchProjectedOrders,
  searchProjectedProducts: mocks.searchProjectedProducts,
  searchProjectedReturns: mocks.searchProjectedReturns,
  warmLocalSearchProjection: mocks.warmLocalSearchProjection,
}));

import { searchUniversalRecords } from "@/lib/search/universal-search-server";

const SHOP = "shop-1";

const customer = {
  id: "customer:c1",
  entityId: "c1",
  kind: "customer" as const,
  label: "Mohamed Amine",
  sublabel: "0555 12 34 56",
  href: "/customers/c1",
};

const strangerOrder = {
  id: "order:o9",
  entityId: "o9",
  customerId: "c9",
  kind: "order" as const,
  label: "SF-0009",
  href: "/orders/o9",
};

const familyMocks = [
  mocks.searchProjectedCustomers,
  mocks.searchProjectedProducts,
  mocks.searchProjectedConversations,
  mocks.searchProjectedDeliveries,
  mocks.searchProjectedReturns,
  mocks.searchProjectedOrders,
];

// Every store the search can read. An aborted search must touch none of them.
const everyLookup = [
  mocks.requireTrustedActor,
  mocks.deriveExistingShopBlindIndex,
  mocks.conversationFindMany,
  mocks.orderFindMany,
  ...familyMocks,
  mocks.projectedConversationContacts,
  mocks.projectedCustomerNames,
  mocks.projectedOrdersForCustomers,
];

function expectNoLookups(): void {
  for (const lookup of everyLookup) expect(lookup).not.toHaveBeenCalled();
}

function withoutTiming<T extends { tookMs: number }>(response: T) {
  const { tookMs, ...rest } = response;
  expect(typeof tookMs).toBe("number");
  return rest;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireTrustedActor.mockResolvedValue({ shop: { shopId: SHOP } });
  mocks.trustedActionAllowed.mockReturnValue(true);
  for (const family of familyMocks) family.mockResolvedValue([]);
  mocks.projectedConversationContacts.mockResolvedValue(new Map());
  mocks.projectedCustomerNames.mockResolvedValue(new Map());
  mocks.projectedOrdersForCustomers.mockResolvedValue([]);
  mocks.conversationFindMany.mockResolvedValue([]);
  mocks.orderFindMany.mockResolvedValue([]);
  mocks.deriveExistingShopBlindIndex.mockResolvedValue(null);
});

describe("searchUniversalRecords with an AbortSignal", () => {
  it("returns an empty answer without touching any store when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const response = await searchUniversalRecords("mohamed", 16, controller.signal);

    expect(response).toMatchObject({
      query: "mohamed",
      results: [],
      degradedFamilies: [],
    });
    expectNoLookups();
  });

  it("answers exactly as before when the signal is live or absent", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([customer]);
    mocks.projectedOrdersForCustomers.mockResolvedValue([
      {
        id: "order:o1",
        entityId: "o1",
        customerId: "c1",
        kind: "order",
        label: "SF-0001",
        href: "/orders/o1",
      },
    ]);

    const withoutSignal = await searchUniversalRecords("mohamed", 16);
    const callsWithoutSignal = familyMocks.map((mock) => mock.mock.calls);
    for (const mock of Object.values(mocks)) mock.mockClear();

    const live = new AbortController();
    const withSignal = await searchUniversalRecords("mohamed", 16, live.signal);

    expect(withoutTiming(withSignal)).toEqual(withoutTiming(withoutSignal));
    expect(withSignal.results.map((row) => row.id)).toEqual([
      "customer:c1",
      "order:o1",
    ]);
    expect(familyMocks.map((mock) => mock.mock.calls)).toEqual(callsWithoutSignal);
    expect(mocks.requireTrustedActor).toHaveBeenCalledTimes(1);
    expect(mocks.projectedOrdersForCustomers).toHaveBeenCalledWith(SHOP, ["c1"]);
    for (const family of familyMocks) {
      expect(family).toHaveBeenCalledWith(SHOP, "mohamed", 48);
    }
  });

  it("keeps permission gating identical under a live signal", async () => {
    mocks.trustedActionAllowed.mockImplementation(
      (_actor: unknown, action: string) =>
        action !== "products.read" && action !== "conversations.read",
    );
    // A hit in the first pass, so the typo back-off does not run.
    mocks.searchProjectedCustomers.mockResolvedValue([customer]);

    await searchUniversalRecords("mohamed", 16, new AbortController().signal);

    expect(mocks.searchProjectedProducts).not.toHaveBeenCalled();
    expect(mocks.searchProjectedConversations).not.toHaveBeenCalled();
    expect(mocks.conversationFindMany).not.toHaveBeenCalled();
    expect(mocks.searchProjectedCustomers).toHaveBeenCalledTimes(1);
    expect(mocks.searchProjectedOrders).toHaveBeenCalledTimes(1);
  });

  it("stops before the customer-linked order lookup when aborted during the fan-out", async () => {
    const controller = new AbortController();
    mocks.searchProjectedCustomers.mockImplementation(async () => {
      controller.abort();
      return [customer];
    });

    const response = await searchUniversalRecords("mohamed", 16, controller.signal);

    expect(response.results).toEqual([]);
    expect(mocks.projectedOrdersForCustomers).not.toHaveBeenCalled();
    expect(mocks.projectedCustomerNames).not.toHaveBeenCalled();
  });

  it("runs the customer-linked order lookup when the signal stays live (control)", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([customer]);

    await searchUniversalRecords("mohamed", 16, new AbortController().signal);

    expect(mocks.projectedOrdersForCustomers).toHaveBeenCalledTimes(1);
  });

  it("stops before the order-owner name lookup when aborted during the linked order lookup", async () => {
    const controller = new AbortController();
    mocks.searchProjectedCustomers.mockResolvedValue([customer]);
    mocks.searchProjectedOrders.mockResolvedValue([strangerOrder]);
    mocks.projectedOrdersForCustomers.mockImplementation(async () => {
      controller.abort();
      return [];
    });

    await searchUniversalRecords("mohamed", 16, controller.signal);

    expect(mocks.projectedOrdersForCustomers).toHaveBeenCalledTimes(1);
    expect(mocks.projectedCustomerNames).not.toHaveBeenCalled();
  });

  it("looks the order owner up when the signal stays live (control)", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([customer]);
    mocks.searchProjectedOrders.mockResolvedValue([strangerOrder]);

    await searchUniversalRecords("mohamed", 16, new AbortController().signal);

    expect(mocks.projectedCustomerNames).toHaveBeenCalledWith(SHOP, ["c9"]);
  });

  it("skips the contact lookup of the recent-message leg when aborted after its conversation read", async () => {
    const controller = new AbortController();
    mocks.conversationFindMany.mockImplementation(async () => {
      controller.abort();
      return [
        {
          id: "conv1",
          channel: "whatsapp",
          lastMessageAt: null,
          updatedAt: new Date("2026-10-01T00:00:00Z"),
          messages: [{ body: "salam mohamed" }],
        },
      ];
    });

    await searchUniversalRecords("mohamed", 16, controller.signal);

    expect(mocks.conversationFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.projectedConversationContacts).not.toHaveBeenCalled();
  });

  it("reads the contacts of recent conversations when the signal stays live (control)", async () => {
    mocks.conversationFindMany.mockResolvedValue([
      {
        id: "conv1",
        channel: "whatsapp",
        lastMessageAt: null,
        updatedAt: new Date("2026-10-01T00:00:00Z"),
        messages: [{ body: "salam mohamed" }],
      },
    ]);

    await searchUniversalRecords("mohamed", 16, new AbortController().signal);

    expect(mocks.projectedConversationContacts).toHaveBeenCalledTimes(1);
  });

  it("does not start the typo back-off when aborted during the first pass", async () => {
    const controller = new AbortController();
    mocks.searchProjectedProducts.mockImplementationOnce(async () => {
      controller.abort();
      return [];
    });

    const response = await searchUniversalRecords("mohamad", 16, controller.signal);

    expect(response.results).toEqual([]);
    expect(mocks.searchProjectedProducts).toHaveBeenCalledTimes(1);
    expect(mocks.requireTrustedActor).toHaveBeenCalledTimes(1);
  });

  it("does not start the second back-off spelling when aborted during the first one", async () => {
    const controller = new AbortController();
    mocks.searchProjectedProducts
      .mockResolvedValueOnce([])
      .mockImplementationOnce(async () => {
        controller.abort();
        return [];
      });

    await searchUniversalRecords("mohamad", 16, controller.signal);

    // strict pass + the first shorter spelling, and nothing after the abort.
    expect(mocks.searchProjectedProducts).toHaveBeenCalledTimes(2);
  });

  it("still tries both shorter spellings of a miss when the signal stays live (control, PR 507 behaviour)", async () => {
    await searchUniversalRecords("mohamad", 16, new AbortController().signal);

    expect(mocks.searchProjectedProducts).toHaveBeenCalledTimes(3);
    expect(
      mocks.searchProjectedProducts.mock.calls.map((call) => call[1]),
    ).toEqual(["mohamad", "mohama", "moham"]);
  });
});
