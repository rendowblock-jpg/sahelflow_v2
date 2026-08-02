import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import {
  assertOrderCreateFieldAuthority,
  assertOrderUpdateFieldAuthority,
} from "../order-authorization";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";

const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

function context(permissions: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "session-1",
      role: "operator",
      permissions,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: SHOP,
  } as TrustedActorContext;
}

describe("order update field authorization", () => {
  it("requires both protected field domains for order intake", () => {
    expect(() =>
      assertOrderCreateFieldAuthority(
        context(["orders.read", "orders.create"]),
      ),
    ).toThrow(/customers\.contact\.read/);

    expect(() =>
      assertOrderCreateFieldAuthority(
        context([
          "orders.read",
          "orders.create",
          "customers.contact.read",
          "customers.contact.update",
        ]),
      ),
    ).toThrow(/orders\.financials\.read/);

    expect(() =>
      assertOrderCreateFieldAuthority(
        context([
          "orders.read",
          "orders.create",
          "customers.contact.read",
          "customers.contact.update",
          "orders.financials.read",
          "orders.financials.update",
        ]),
      ),
    ).not.toThrow();
  });

  it("requires contact read and write authority before contact mutation", () => {
    expect(() =>
      assertOrderUpdateFieldAuthority(
        context(["orders.read", "orders.update"]),
        { phone: "0555000000" },
      ),
    ).toThrow(/customers\.contact\.read/);

    expect(() =>
      assertOrderUpdateFieldAuthority(
        context([
          "orders.read",
          "orders.update",
          "customers.contact.read",
        ]),
        { address: "New address" },
      ),
    ).toThrow(/customers\.contact\.update/);
  });

  it("requires financial read and write authority before price mutation", () => {
    expect(() =>
      assertOrderUpdateFieldAuthority(
        context(["orders.read", "orders.update"]),
        { deliveryCost: 700 },
      ),
    ).toThrow(/orders\.financials\.read/);

    expect(() =>
      assertOrderUpdateFieldAuthority(
        context([
          "orders.read",
          "orders.update",
          "orders.financials.read",
        ]),
        { totalPrice: 4_200 },
      ),
    ).toThrow(/orders\.financials\.update/);
  });

  it("accepts only the protected field groups explicitly granted", () => {
    expect(() =>
      assertOrderUpdateFieldAuthority(
        context([
          "orders.read",
          "orders.update",
          "customers.contact.read",
          "customers.contact.update",
        ]),
        { notes: "Call before delivery", commune: "Alger Centre" },
      ),
    ).not.toThrow();

    expect(() =>
      assertOrderUpdateFieldAuthority(
        context([
          "orders.read",
          "orders.update",
          "orders.financials.read",
          "orders.financials.update",
        ]),
        { deliveryCost: 700, totalPrice: 4_900 },
      ),
    ).not.toThrow();
  });
});
