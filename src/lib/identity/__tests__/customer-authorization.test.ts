import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import {
  assertCustomerCreateFieldAuthority,
  assertCustomerUpdateFieldAuthority,
} from "../customer-authorization";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";

function context(permissions: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "1".repeat(32),
      workspaceMemberId: "2".repeat(32),
      deviceId: "3".repeat(32),
      sessionId: "session-1",
      role: "operator",
      permissions,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: { shopId: "shop-a" },
  } as TrustedActorContext;
}

describe("customer protected-field authority", () => {
  it("blocks customer creation without contact-update authority", () => {
    expect(() =>
      assertCustomerCreateFieldAuthority(context(["customers.manage"])),
    ).toThrow(/customers\.contact\.update/);
  });

  it("blocks protected customer updates without the exact field grant", () => {
    expect(() =>
      assertCustomerUpdateFieldAuthority(context(["customers.manage"]), {
        phone: "0555000000",
      }),
    ).toThrow(/customers\.contact\.update/);
  });

  it("accepts protected updates with contact-update authority", () => {
    expect(() =>
      assertCustomerUpdateFieldAuthority(
        context(["customers.manage", "customers.contact.update"]),
        { address: "Street 2" },
      ),
    ).not.toThrow();
  });
});
