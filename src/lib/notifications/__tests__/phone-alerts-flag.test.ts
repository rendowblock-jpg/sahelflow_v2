import { describe, expect, it } from "vitest";
import { PHONE_ALERTS_AVAILABLE } from "../phone-alerts-flag";

describe("phone alerts switch", () => {
  it("is OFF until the Founder gives his words", () => {
    expect(PHONE_ALERTS_AVAILABLE).toBe(false);
  });
});
