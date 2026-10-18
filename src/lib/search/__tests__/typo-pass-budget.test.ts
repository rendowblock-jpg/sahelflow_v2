import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mayStartTypoPass,
  TYPO_PASS_BUDGET_MS,
  typoBackoffQueries,
} from "@/lib/search/universal-search";

// S09b-06: typo tolerance used to switch itself off whenever the first pass
// took more than 350 ms (slow hardware) and otherwise re-ran the whole search
// for every shorter spelling. The rule is now one fixed budget for the widened
// phase: the first shorter spelling always runs, the next one only while the
// budget is not spent.

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
const TYPED = "belkacem";
// typoBackoffQueries("belkacem"): the longest word cut to 7 and to 5 letters.
const FIRST = "belkace";
const SECOND = "belka";

const customer = {
  id: "customer:c1",
  entityId: "c1",
  kind: "customer" as const,
  label: "Belkacen Said",
  sublabel: "0555 12 34 56",
  href: "/customers/c1",
};

const emptyFamilies = [
  mocks.searchProjectedProducts,
  mocks.searchProjectedConversations,
  mocks.searchProjectedDeliveries,
  mocks.searchProjectedReturns,
  mocks.searchProjectedOrders,
];

let clock = 0;

// One search pass = one call of the customers family; it is the only mock that
// moves the fake clock, so "ms per pass" is exact.
function passCosts(msPerPass: number, hitFor?: string, row = customer): void {
  mocks.searchProjectedCustomers.mockImplementation(
    async (_shop: string, query: string) => {
      clock += msPerPass;
      return hitFor !== undefined && query === hitFor ? [row] : [];
    },
  );
}

function passQueries(): string[] {
  return mocks.searchProjectedCustomers.mock.calls.map((call) => String(call[1]));
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  mocks.requireTrustedActor.mockResolvedValue({ shop: { shopId: SHOP } });
  mocks.trustedActionAllowed.mockReturnValue(true);
  for (const family of emptyFamilies) family.mockResolvedValue([]);
  mocks.projectedConversationContacts.mockResolvedValue(new Map());
  mocks.projectedCustomerNames.mockResolvedValue(new Map());
  mocks.projectedOrdersForCustomers.mockResolvedValue([]);
  mocks.conversationFindMany.mockResolvedValue([]);
  mocks.orderFindMany.mockResolvedValue([]);
  mocks.deriveExistingShopBlindIndex.mockResolvedValue(null);
});

describe("mayStartTypoPass", () => {
  it("always allows the first widened pass, however slow the machine is", () => {
    expect(mayStartTypoPass(0, 0)).toBe(true);
    expect(mayStartTypoPass(0, 60_000)).toBe(true);
  });

  it("allows a further pass only while the fixed budget is not spent", () => {
    expect(TYPO_PASS_BUDGET_MS).toBeGreaterThan(0);
    expect(TYPO_PASS_BUDGET_MS).toBeLessThanOrEqual(500);
    expect(mayStartTypoPass(1, 0)).toBe(true);
    expect(mayStartTypoPass(1, TYPO_PASS_BUDGET_MS - 1)).toBe(true);
    expect(mayStartTypoPass(1, TYPO_PASS_BUDGET_MS)).toBe(false);
    expect(mayStartTypoPass(2, TYPO_PASS_BUDGET_MS * 10)).toBe(false);
  });

  it("is bounded by construction: a query never has more than two spellings", () => {
    for (const word of ["mohamad", "abderrahmane", "belkacem ali", "x"]) {
      expect(typoBackoffQueries(word).length).toBeLessThanOrEqual(2);
    }
  });
});

describe("searchUniversalRecords typo passes", () => {
  it("still widens once when the first pass was slow (no self-disable on slow hardware)", async () => {
    passCosts(600, FIRST);

    const response = await searchUniversalRecords(TYPED, 16);

    expect(passQueries()).toEqual([TYPED, FIRST]);
    expect(response.results.map((row) => row.id)).toEqual(["customer:c1"]);
  });

  it("stops after the first widened pass once the budget is spent", async () => {
    passCosts(TYPO_PASS_BUDGET_MS + 50);

    const response = await searchUniversalRecords(TYPED, 16);

    expect(passQueries()).toEqual([TYPED, FIRST]);
    expect(response.results).toEqual([]);
  });

  it("on fast hardware tries both spellings and never a third", async () => {
    passCosts(10);

    const response = await searchUniversalRecords(TYPED, 16);

    expect(passQueries()).toEqual([TYPED, FIRST, SECOND]);
    expect(response.results).toEqual([]);
  });

  it("stops at the first spelling that finds something", async () => {
    passCosts(10, FIRST);

    const response = await searchUniversalRecords(TYPED, 16);

    expect(passQueries()).toEqual([TYPED, FIRST]);
    expect(response.results.map((row) => row.id)).toEqual(["customer:c1"]);
  });

  it("does not widen a query the strict pass answered", async () => {
    passCosts(10, TYPED, { ...customer, label: "Belkacem Said" });

    const response = await searchUniversalRecords(TYPED, 16);

    expect(passQueries()).toEqual([TYPED]);
    expect(response.results.map((row) => row.id)).toEqual(["customer:c1"]);
  });

  it("does not start a widened pass for a request that was cancelled", async () => {
    const controller = new AbortController();
    mocks.searchProjectedCustomers.mockImplementation(async () => {
      clock += 10;
      controller.abort();
      return [];
    });

    await searchUniversalRecords(TYPED, 16, controller.signal);

    expect(passQueries()).toEqual([TYPED]);
  });
});
