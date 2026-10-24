/**
 * MNY-09: the COD workspace routes need `customers.contact.read` before they
 * show a customer name, and the customers API redacts the name without it.
 * The per-order position route only needed `orders.read` + `orders.financials.read`,
 * so a member with a custom allowlist could read the name there. The real
 * authorization module runs here; only the actor lookup and the data are faked.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Phase2Action } from "@/lib/identity/permissions";

const harness = vi.hoisted(() => ({
  actorContext: null as unknown,
  position: vi.fn(),
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  isTrustedActorContext: () => true,
  requireTrustedActor: async () => harness.actorContext,
}));

vi.mock("@/lib/business-truth/principal", () => ({
  businessPrincipalFromTrustedActor: () => ({ kind: "test-principal" }),
}));

vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));

vi.mock("@/lib/accounting/canonical-cod-projections", () => ({
  getCanonicalCodOrderPosition: harness.position,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; statusCode?: number };
        return Response.json(
          { error: typed.message },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { GET } from "@/app/api/orders/[id]/cod/position/route";

type Actor =
  | { role: "owner" | "manager" | "operator" | "viewer" }
  | { role: "manager"; permissions: readonly Phase2Action[] };

function actAs(actor: Actor): void {
  harness.actorContext = {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      policyVersion: 1,
      revocationEpoch: 0,
      ...actor,
    },
    shop: { shopId: "shop-a" },
  };
}

async function readPosition(): Promise<Response> {
  return GET(new NextRequest("http://localhost/api/orders/order-a/cod/position"), {
    params: Promise.resolve({ id: "order-a" }),
  });
}

beforeEach(() => {
  harness.position.mockReset().mockResolvedValue({
    orderId: "order-a",
    orderNumber: "ORD-0001",
    customerName: "Amina Benali",
    expectedReceivable: 5000,
  });
});

describe("COD position customer name (MNY-09)", () => {
  it("withholds the name from a member who has financials but not customers.contact.read", async () => {
    actAs({ role: "manager", permissions: ["orders.read", "orders.financials.read"] });

    const response = await readPosition();

    expect(response.status).toBe(200);
    const { position } = await response.json();
    expect(position.customerName).toBeNull();
    expect(position).toMatchObject({
      orderNumber: "ORD-0001",
      expectedReceivable: 5000,
    });
  });

  it("returns the name to a member who also has customers.contact.read", async () => {
    actAs({
      role: "manager",
      permissions: ["orders.read", "orders.financials.read", "customers.contact.read"],
    });

    const response = await readPosition();

    expect(response.status).toBe(200);
    expect((await response.json()).position.customerName).toBe("Amina Benali");
  });

  it("keeps the name for the owner and manager presets", async () => {
    for (const role of ["owner", "manager"] as const) {
      actAs({ role });
      const response = await readPosition();
      expect(response.status, role).toBe(200);
      expect((await response.json()).position.customerName, role).toBe(
        "Amina Benali",
      );
    }
  });

  it("still refuses a member without orders.financials.read", async () => {
    actAs({ role: "operator" });

    const response = await readPosition();

    expect(response.status).toBe(403);
    expect(harness.position).not.toHaveBeenCalled();
  });
});
