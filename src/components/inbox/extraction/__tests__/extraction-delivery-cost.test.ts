import { describe, expect, it } from "vitest";

import { MAX_MONEY_DZD } from "@/lib/orders/money-limits";

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
    ["999999999", 999_999_999],
  ])("reads %j as %i", (text, expected) => {
    expect(parseDeliveryCost(text)).toBe(expected);
  });

  // The create route answers 400 above MAX_MONEY_DZD, so the field must refuse
  // the same amounts before the seller presses Create.
  it.each([
    "",
    "  ",
    "-5",
    "12.5",
    "1e3",
    "abc",
    "6 00",
    "+5",
    "1000000000",
    "9007199254740991",
    String(Number.MAX_SAFE_INTEGER + 2),
    "9".repeat(400),
  ])("rejects %j", (text) => {
    expect(parseDeliveryCost(text)).toBeNull();
  });

  it("stops at the same ceiling as the server", () => {
    expect(parseDeliveryCost(String(MAX_MONEY_DZD))).toBe(MAX_MONEY_DZD);
    expect(parseDeliveryCost(String(MAX_MONEY_DZD + 1))).toBeNull();
  });
});
