import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: vi.fn(async () => ({
    actor: { kind: "person", personId: "owner-1" },
    shop: { shopId: "shop-a" },
  })),
  assertTrustedAction: vi.fn(),
  trustedActionAllowed: vi.fn(() => true),
  trustedActorAuditIdentity: () => "person:owner-1",
}));
vi.mock("@/lib/identity/customer-authorization", () => ({
  assertCustomerCreateFieldAuthority: vi.fn(),
  assertCustomerUpdateFieldAuthority: vi.fn(),
}));
vi.mock("@/lib/identity/customer-projection", () => ({
  projectCustomerForTrustedActor: (_: unknown, customer: unknown) => customer,
}));
vi.mock("@/lib/data", () => ({
  customerService: {
    create: harness.create,
    update: harness.update,
    delete: harness.remove,
  },
}));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: { shopId: "shop-a" } }));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { POST } from "@/app/api/customers/route";
import { DELETE, PATCH } from "@/app/api/customers/[id]/route";

const audit = { auditActor: "person:owner-1" };
const params = { params: Promise.resolve({ id: "customer-1" }) };

describe("customer routes hand the trusted actor to the audited service call", () => {
  beforeEach(() => {
    harness.create.mockReset().mockResolvedValue({ id: "customer-1" });
    harness.update.mockReset().mockResolvedValue({ id: "customer-1" });
    harness.remove.mockReset().mockResolvedValue(undefined);
  });

  it("POST create", async () => {
    await POST(
      new NextRequest("http://localhost/api/customers", {
        method: "POST",
        body: JSON.stringify({ name: "Amina", phone: "0555000000" }),
      }),
    );
    expect(harness.create).toHaveBeenCalledWith(expect.anything(), expect.anything(), audit);
  });

  it("PATCH update", async () => {
    await PATCH(
      new NextRequest("http://localhost/api/customers/customer-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Amina B" }),
      }),
      params,
    );
    expect(harness.update).toHaveBeenCalledWith(
      expect.anything(),
      "customer-1",
      expect.anything(),
      audit,
    );
  });

  it("DELETE passes the actor into the service so the delete and its audit commit together", async () => {
    await DELETE(new NextRequest("http://localhost/api/customers/customer-1", { method: "DELETE" }), params);
    expect(harness.remove).toHaveBeenCalledWith(expect.anything(), "customer-1", audit);
  });
});
