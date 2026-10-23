import { describe, expect, it } from "vitest";

import { STOP_DESK_ADDRESS, orderAddressFor } from "../stop-desk-address";

describe("orderAddressFor (STORE-DESK-ADDRESS)", () => {
  it("keeps what the buyer typed, trimmed, in either mode", () => {
    expect(orderAddressFor("  Cité 5, rue 3  ", "home")).toBe("Cité 5, rue 3");
    expect(orderAddressFor("  près de la poste  ", "desk")).toBe("près de la poste");
  });

  it("stores the fixed stop-desk text for a desk order with no address", () => {
    expect(orderAddressFor("", "desk")).toBe(STOP_DESK_ADDRESS);
    expect(orderAddressFor("   ", "desk")).toBe(STOP_DESK_ADDRESS);
    expect(orderAddressFor(null, "desk")).toBe(STOP_DESK_ADDRESS);
    expect(orderAddressFor(undefined, "desk")).toBe(STOP_DESK_ADDRESS);
  });

  it("refuses a home order with no address: it cannot be delivered", () => {
    expect(orderAddressFor("", "home")).toBeNull();
    expect(orderAddressFor("   ", "home")).toBeNull();
    expect(orderAddressFor(null, "home")).toBeNull();
    expect(orderAddressFor(undefined, "home")).toBeNull();
  });

  it("never returns an empty string", () => {
    for (const mode of ["home", "desk"] as const) {
      for (const input of ["", " ", "\n\t", null, undefined, "x"]) {
        expect(orderAddressFor(input, mode)).not.toBe("");
      }
    }
  });

  it("uses a text a seller and a courier can read", () => {
    expect(STOP_DESK_ADDRESS).toBe("Stop desk");
  });
});
