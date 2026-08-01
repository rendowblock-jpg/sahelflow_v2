import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  requireAction: vi.fn(),
  assertAction: vi.fn(),
  actionAllowed: vi.fn(),
  assertCreateFields: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  search: vi.fn(),
  count: vi.fn(),
  projectCustomer: vi.fn((_: unknown, customer: unknown) => customer),
  projectCustomers: vi.fn((_: unknown, customers: unknown) => customers),
  projectSearchCustomer: vi.fn((_: unknown, customer: unknown) => customer),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
  assertTrustedAction: harness.assertAction,
  trustedActionAllowed: harness.actionAllowed,
}));

vi.mock("@/lib/identity/customer-authorization", () => ({
  assertCustomerCreateFieldAuthority: harness.assertCreateFields,
}));

vi.mock("@/lib/identity/customer-projection", () => ({
  projectCustomerForTrustedActor: harness.projectCustomer,
  projectCustomersForTrustedActor: harness.projectCustomers,
  projectCustomerListItemForTrustedActor: harness.projectSearchCustomer,
}));

vi.mock("@/lib/data", () => ({
  customerService: {
    list: harness.list,
    create: harness.create,
  },
  customerServiceExtensions: {
    search: harness.search,
  },
}));

vi.mock("@/lib/db", () => ({
  db: { customer: { count: harness.count } },
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { GET, POST } from "@/app/api/customers/route";
import { GET as SEARCH } from "@/app/api/customers/search/route";

const actorContext = {
  actor: { kind: "person" },
  shop: { shopId: "shop-a" },
};

describe("customer route authority", () => {
  beforeEach(() => {
    harness.requireAction.mockReset().mockResolvedValue(actorContext);
    harness.assertAction.mockReset();
    harness.actionAllowed.mockReset().mockReturnValue(true);
    harness.assertCreateFields.mockReset();
    harness.list.mockReset().mockResolvedValue([]);
    harness.create.mockReset().mockResolvedValue({ id: "customer-1" });
    harness.search.mockReset().mockResolvedValue([]);
    harness.count.mockReset().mockResolvedValue(0);
    harness.projectCustomer.mockClear();
    harness.projectCustomers.mockClear();
    harness.projectSearchCustomer.mockClear();
  });

  it("denies a list before any customer read", async () => {
    harness.requireAction.mockRejectedValue(new Error("forbidden"));

    await expect(
      GET(new NextRequest("http://localhost/api/customers")),
    ).rejects.toThrow("forbidden");
    expect(harness.requireAction).toHaveBeenCalledWith("customers.read");
    expect(harness.list).not.toHaveBeenCalled();
    expect(harness.count).not.toHaveBeenCalled();
  });

  it("denies protected creation before the customer mutation", async () => {
    harness.assertCreateFields.mockImplementation(() => {
      throw new Error("contact forbidden");
    });

    await expect(
      POST(
        new NextRequest("http://localhost/api/customers", {
          method: "POST",
          body: JSON.stringify({ name: "Amina", phone: "0555000000" }),
        }),
      ),
    ).rejects.toThrow("contact forbidden");
    expect(harness.requireAction).toHaveBeenCalledWith("customers.manage");
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("does not use protected contact search as an existence oracle", async () => {
    harness.actionAllowed.mockReturnValue(false);

    const response = await SEARCH(
      new NextRequest("http://localhost/api/customers/search?q=0555000000"),
    );

    expect(response.status).toBe(200);
    expect(harness.search).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      customers: [],
      total: 0,
      fieldAccess: { contact: false },
    });
  });
});
