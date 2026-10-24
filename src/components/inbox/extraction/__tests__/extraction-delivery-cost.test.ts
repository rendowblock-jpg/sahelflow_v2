import { describe, expect, it } from "vitest";

import {
  EXTRACTION_DELIVERY_COST,
  initialExtractionDeliveryCost,
  parseDeliveryCost,
} from "../extraction-delivery-cost";

describe("initialExtractionDeliveryCost", () => {
  // No per-wilaya price is readable in the inbox without a request (the order
  // form starts at 600 too), so every wilaya starts at the same 600.
  it("is 600 whatever the wilaya", () => {
    expect(EXTRACTION_DELIVERY_COST).toBe(600);
    for (const wilaya of [undefined, "", "Alger", "Tamanrasset"]) {
      expect(initialExtractionDeliveryCost(wilaya)).toBe(600);
    }
  });
});

describe("parseDeliveryCost", () => {
  it.each([
    ["0", 0],
    ["600", 600],
    [" 900 ", 900],
    ["٧٥٠", 750],
    ["۱۲۰۰", 1200],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("reads %j as %i", (text, expected) => {
    expect(parseDeliveryCost(text)).toBe(expected);
  });

  it.each(["", "  ", "-5", "12.5", "1e3", "abc", "6 00", "+5", String(Number.MAX_SAFE_INTEGER + 2)])(
    "rejects %j",
    (text) => {
      expect(parseDeliveryCost(text)).toBeNull();
    },
  );
});
