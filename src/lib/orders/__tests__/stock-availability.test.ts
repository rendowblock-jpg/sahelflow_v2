import { describe, expect, it } from "vitest";

import {
  availableForManualConfirm,
  holdAlreadyLoweredStock,
  stockHeldAgainstOnHand,
  type ActiveStockHold,
} from "../stock-availability";

/** A hold opened by a manual confirmation: key `<commandId>:reserve:<itemId>` plus its `reserve` movement. */
function manualHold(quantity: number, suffix = "a"): ActiveStockHold {
  return {
    reservationKey: `0b8f6a52-4f0e-4c53-9d3e-1f6a2f6f7a10:reserve:item-${suffix}`,
    quantity,
    reserveMovementRecorded: true,
  };
}

function storefrontProvisional(quantity: number): ActiveStockHold {
  return {
    reservationKey: "storefront-provisional:release_abcdefgh:product-1",
    quantity,
    reserveMovementRecorded: false,
  };
}

function storefrontDelegation(quantity: number): ActiveStockHold {
  return {
    reservationKey: "storefront-delegation:release_abcdefgh:product-1",
    quantity,
    reserveMovementRecorded: false,
  };
}

describe("availableForManualConfirm", () => {
  it("does not subtract confirmed manual holds twice (10 on shelf, 5 confirmed and unshipped)", () => {
    // Product.stock is already 5 because each confirmation decremented it.
    // The old arithmetic (stock - every active hold) returned 5 - 5 = 0.
    expect(
      availableForManualConfirm({ onHand: 5, activeHolds: [manualHold(5)] }),
    ).toBe(5);
    expect(
      availableForManualConfirm({
        onHand: 5,
        activeHolds: [1, 1, 1, 1, 1].map((quantity, index) =>
          manualHold(quantity, String(index)),
        ),
      }),
    ).toBe(5);
  });

  it("returns the on-hand stock when nothing is held", () => {
    expect(availableForManualConfirm({ onHand: 7, activeHolds: [] })).toBe(7);
    expect(availableForManualConfirm({ onHand: 0, activeHolds: [] })).toBe(0);
  });

  it("still subtracts a storefront delegated or provisional hold, which never lowered stock", () => {
    expect(
      availableForManualConfirm({ onHand: 10, activeHolds: [storefrontDelegation(3)] }),
    ).toBe(7);
    expect(
      availableForManualConfirm({ onHand: 10, activeHolds: [storefrontProvisional(3)] }),
    ).toBe(7);
    expect(
      availableForManualConfirm({
        onHand: 10,
        activeHolds: [storefrontDelegation(3), storefrontProvisional(2)],
      }),
    ).toBe(5);
  });

  it("mixes both: manual holds are already out of stock, storefront holds are not", () => {
    // 10 on the shelf, 4 confirmed manually (stock 6), 3 delegated to the storefront.
    expect(
      availableForManualConfirm({
        onHand: 6,
        activeHolds: [manualHold(4), storefrontDelegation(3)],
      }),
    ).toBe(3);
  });

  it("never returns a negative number", () => {
    expect(
      availableForManualConfirm({ onHand: 2, activeHolds: [storefrontDelegation(5)] }),
    ).toBe(0);
    expect(availableForManualConfirm({ onHand: -3, activeHolds: [] })).toBe(0);
    expect(
      availableForManualConfirm({ onHand: -3, activeHolds: [storefrontDelegation(1)] }),
    ).toBe(0);
  });

  it("refuses exactly one unit past the boundary and accepts the exact boundary", () => {
    const available = availableForManualConfirm({
      onHand: 5,
      activeHolds: [storefrontDelegation(2), manualHold(4)],
    });
    expect(available).toBe(3);
    expect(available >= 3).toBe(true); // the exact boundary is sellable
    expect(available >= 4).toBe(false); // an oversell attempt is refused
  });

  it("fails closed: a hold that is not provably a manual reserve still counts in full", () => {
    // No `reserve` movement and an unknown key shape (legacy or future producer).
    const unknown: ActiveStockHold = {
      reservationKey: "legacy-hold-1",
      quantity: 4,
      reserveMovementRecorded: false,
    };
    expect(availableForManualConfirm({ onHand: 10, activeHolds: [unknown] })).toBe(6);
    // A manual-looking key without the reserve movement is not proof either.
    expect(
      availableForManualConfirm({
        onHand: 10,
        activeHolds: [{ ...manualHold(4), reserveMovementRecorded: false }],
      }),
    ).toBe(6);
  });

  it("rejects values outside the supported integer range instead of guessing", () => {
    expect(() => availableForManualConfirm({ onHand: 1.5, activeHolds: [] })).toThrow(
      /integer range/i,
    );
    expect(() =>
      availableForManualConfirm({ onHand: Number.NaN, activeHolds: [] }),
    ).toThrow(/integer range/i);
    expect(() =>
      availableForManualConfirm({ onHand: 5, activeHolds: [manualHold(-1)] }),
    ).toThrow(/integer range/i);
    expect(() =>
      availableForManualConfirm({
        onHand: 5,
        activeHolds: [storefrontDelegation(Number.MAX_SAFE_INTEGER + 1)],
      }),
    ).toThrow(/integer range/i);
  });
});

describe("holdAlreadyLoweredStock", () => {
  it("is true only for a manual reserve: reserve movement recorded and no storefront key prefix", () => {
    expect(holdAlreadyLoweredStock(manualHold(1))).toBe(true);
    expect(holdAlreadyLoweredStock(storefrontProvisional(1))).toBe(false);
    expect(holdAlreadyLoweredStock(storefrontDelegation(1))).toBe(false);
  });

  it("stays false if a storefront-keyed hold ever carries a reserve movement", () => {
    expect(
      holdAlreadyLoweredStock({
        reservationKey: "storefront-delegation:release_abcdefgh:product-1",
        quantity: 1,
        reserveMovementRecorded: true,
      }),
    ).toBe(false);
    expect(
      holdAlreadyLoweredStock({
        reservationKey: "storefront-provisional:release_abcdefgh:product-1",
        quantity: 1,
        reserveMovementRecorded: true,
      }),
    ).toBe(false);
  });

  it("is false without the reserve movement whatever the key looks like", () => {
    expect(
      holdAlreadyLoweredStock({
        reservationKey: "0b8f6a52-4f0e-4c53-9d3e-1f6a2f6f7a10:reserve:item-a",
        quantity: 1,
        reserveMovementRecorded: false,
      }),
    ).toBe(false);
  });
});

describe("stockHeldAgainstOnHand", () => {
  it("sums only the holds that did not already lower on-hand stock", () => {
    expect(stockHeldAgainstOnHand([])).toBe(0);
    expect(stockHeldAgainstOnHand([manualHold(5)])).toBe(0);
    expect(
      stockHeldAgainstOnHand([manualHold(4), storefrontDelegation(3), storefrontProvisional(2)]),
    ).toBe(5);
  });
});
