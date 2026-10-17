import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Customers page search (audit S03c-02).
 *
 * In the packaged app Customer.name is a contextual ciphertext envelope and
 * Customer.phone holds the HMAC blind index (the sealed number is in
 * phoneEnc). The protected-data extension only rewrites a top-level string
 * `phone` filter, so a `contains` on name or phone nested in an OR is compared
 * with ciphertext and hex digits: a real name or number never matched.
 *
 * The workbench must resolve a search through the same permission-gated blind
 * index projection the command palette uses, and then filter by id.
 */
const mocks = vi.hoisted(() => ({
  customerFindMany: vi.fn(),
  customerCount: vi.fn(),
  orderGroupBy: vi.fn(),
  searchProjectedCustomers: vi.fn(),
  allowed: new Set<string>(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      findMany: mocks.customerFindMany,
      count: mocks.customerCount,
    },
    order: { groupBy: mocks.orderGroupBy },
  },
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/search/local-search-projection", () => ({
  searchProjectedCustomers: mocks.searchProjectedCustomers,
}));

vi.mock("@/lib/identity/authorization", () => ({
  assertTrustedAction: vi.fn(),
  trustedActionAllowed: (_context: unknown, action: string) =>
    mocks.allowed.has(action),
}));

import { getCustomersWorkbenchPage } from "../customer-workbench";

const actor = { shop: { shopId: "shop-a" } } as never;

function lastWhere(): Record<string, unknown> {
  const call = mocks.customerFindMany.mock.calls.at(-1);
  return (call?.[0] as { where: Record<string, unknown> }).where;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = new Set(["customers.read", "customers.contact.read"]);
  mocks.customerFindMany.mockResolvedValue([]);
  mocks.customerCount.mockResolvedValue(0);
  mocks.orderGroupBy.mockResolvedValue([]);
  mocks.searchProjectedCustomers.mockResolvedValue([]);
});

describe("customers workbench search", () => {
  it("resolves the search through the blind-index projection and filters by id", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([
      { entityId: "c1" },
      { entityId: "c2" },
    ]);

    await getCustomersWorkbenchPage(actor, { q: "  ahmed " });

    expect(mocks.searchProjectedCustomers).toHaveBeenCalledTimes(1);
    expect(mocks.searchProjectedCustomers).toHaveBeenCalledWith(
      "shop-a",
      "ahmed",
      expect.any(Number),
    );
    expect(lastWhere()).toEqual({
      deletedAt: null,
      id: { in: ["c1", "c2"] },
    });
    // The same scope drives the total, so paging stays consistent.
    expect(mocks.customerCount).toHaveBeenCalledWith({
      where: { deletedAt: null, id: { in: ["c1", "c2"] } },
    });
  });

  it("never compares the search text with the protected columns", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([{ entityId: "c1" }]);

    await getCustomersWorkbenchPage(actor, { q: "0661234567" });

    const serialized = JSON.stringify(lastWhere());
    expect(serialized).not.toContain("contains");
    expect(serialized).not.toContain("0661234567");
  });

  it("returns an empty scope when the projection finds no customer", async () => {
    mocks.searchProjectedCustomers.mockResolvedValue([]);

    await getCustomersWorkbenchPage(actor, { q: "nobody" });

    expect(lastWhere()).toEqual({ deletedAt: null, id: { in: [] } });
  });

  it("does not search at all without contact access", async () => {
    mocks.allowed = new Set(["customers.read"]);

    await getCustomersWorkbenchPage(actor, { q: "ahmed" });

    expect(mocks.searchProjectedCustomers).not.toHaveBeenCalled();
    expect(lastWhere()).toEqual({
      deletedAt: null,
      OR: [{ id: "__no-contact-access__" }],
    });
  });

  it("lists every active customer when there is no search text", async () => {
    await getCustomersWorkbenchPage(actor, { q: "   " });

    expect(mocks.searchProjectedCustomers).not.toHaveBeenCalled();
    expect(lastWhere()).toEqual({ deletedAt: null });
  });
});
