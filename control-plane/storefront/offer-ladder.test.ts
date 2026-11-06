import { describe, expect, it } from "vitest";

import {
  MAX_OFFER_QUANTITY, MAX_OFFER_TIERS, parseOfferLadder, percentOffTotal, priceForQuantity, readOfferLadder, serialiseOfferLadder,
} from "./offer-ladder";

const UNIT = 3000;
const LADDER = [{ q: 2, t: 5500 }, { q: 3, t: 7500 }];

describe("parseOfferLadder: what a seller may publish", () => {
  it("pins the limits the checkout also has", () => {
    expect(MAX_OFFER_TIERS).toBe(5);
    expect(MAX_OFFER_QUANTITY).toBe(100);
  });

  it("an absent or empty ladder is 'no offers', even on a price of 0", () => {
    expect(parseOfferLadder(UNIT, undefined)).toEqual([]);
    expect(parseOfferLadder(UNIT, [])).toEqual([]);
    expect(parseOfferLadder(0, [])).toEqual([]);
  });

  it("keeps a valid ladder and always writes the keys in the order q, t", () => {
    const out = parseOfferLadder(UNIT, [{ t: 5500, q: 2 }, { t: 7500, q: 3 }]);
    expect(out).toEqual(LADDER);
    expect(JSON.stringify(out)).toBe('[{"q":2,"t":5500},{"q":3,"t":7500}]');
  });

  it.each([
    ["one tier", [{ q: 2, t: 5500 }]],
    ["a free bundle (t = 0 is allowed)", [{ q: 2, t: 0 }]],
    ["one dinar under the single price", [{ q: 2, t: 5999 }]],
    ["five tiers", [2, 3, 4, 5, 6].map((q) => ({ q, t: q * 2900 }))],
    ["the checkout cap q = 100", [{ q: 100, t: 299_999 }]],
  ])("accepts %s", (_name, value) => {
    expect(parseOfferLadder(UNIT, value)).toEqual(value);
  });

  it.each<[string, number, unknown]>([
    ["not sorted", UNIT, [{ q: 3, t: 7500 }, { q: 2, t: 5500 }]],
    ["a duplicate q", UNIT, [{ q: 2, t: 5500 }, { q: 2, t: 5400 }]],
    ["a bundle that costs the same as buying singly", UNIT, [{ q: 2, t: 6000 }]],
    ["a bundle dearer than buying singly", UNIT, [{ q: 2, t: 6001 }]],
    ["q = 1", UNIT, [{ q: 1, t: 2000 }]],
    ["q = 0", UNIT, [{ q: 0, t: 0 }]],
    ["q = 101 (over the checkout cap)", UNIT, [{ q: 101, t: 1 }]],
    ["a float q", UNIT, [{ q: 2.5, t: 5000 }]],
    ["six tiers", UNIT, [2, 3, 4, 5, 6, 7].map((q) => ({ q, t: q * 2900 }))],
    ["a float t", UNIT, [{ q: 2, t: 5500.5 }]],
    ["a negative t", UNIT, [{ q: 2, t: -1 }]],
    ["a NaN t", UNIT, [{ q: 2, t: Number.NaN }]],
    ["an infinite t", UNIT, [{ q: 2, t: Number.POSITIVE_INFINITY }]],
    ["a NaN q", UNIT, [{ q: Number.NaN, t: 100 }]],
    ["a string t", UNIT, [{ q: 2, t: "5500" }]],
    ["a string q", UNIT, [{ q: "2", t: 5500 }]],
    ["an extra key", UNIT, [{ q: 2, t: 5500, label: "x" }]],
    ["a missing t", UNIT, [{ q: 2 }]],
    ["a tier that is null", UNIT, [null]],
    ["a tier that is a number", UNIT, [7]],
    ["a tier that is an array", UNIT, [[2, 5500]]],
    ["a ladder that is an object", UNIT, { q: 2, t: 5500 }],
    ["a ladder that is a string", UNIT, "[]"],
    ["a ladder that is null", UNIT, null],
    ["a ladder on a price of 0", 0, [{ q: 2, t: 0 }]],
    ["a ladder on a negative price", -5, [{ q: 2, t: 0 }]],
    ["a ladder on a float price", 2999.5, [{ q: 2, t: 100 }]],
  ])("refuses %s", (_name, unit, value) => {
    expect(parseOfferLadder(unit, value)).toBeNull();
  });

  it("a bundle is checked against THIS price: the same tiers fail when the unit price drops", () => {
    expect(parseOfferLadder(3000, LADDER)).toEqual(LADDER);
    expect(parseOfferLadder(2000, LADDER)).toBeNull();
  });
});

describe("priceForQuantity", () => {
  it("a quantity equal to a tier is that tier's fixed total; any other quantity is unit x quantity", () => {
    expect(priceForQuantity(UNIT, 1, LADDER)).toBe(3000);
    expect(priceForQuantity(UNIT, 2, LADDER)).toBe(5500);
    expect(priceForQuantity(UNIT, 3, LADDER)).toBe(7500);
    expect(priceForQuantity(UNIT, 4, LADDER)).toBe(12_000);
    expect(priceForQuantity(UNIT, 10, LADDER)).toBe(30_000);
  });

  it("without tiers it is plain unit x quantity", () => {
    expect(priceForQuantity(UNIT, 7, [])).toBe(21_000);
  });

  it("is null for what is not a safe amount, never a wrong price", () => {
    expect(priceForQuantity(Number.MAX_SAFE_INTEGER, 2, [])).toBeNull();
    expect(priceForQuantity(UNIT, 0, LADDER)).toBeNull();
    expect(priceForQuantity(UNIT, 1.5, LADDER)).toBeNull();
    expect(priceForQuantity(UNIT, Number.NaN, LADDER)).toBeNull();
    expect(priceForQuantity(-1, 2, [])).toBeNull();
  });
});

describe("percentOffTotal: integer maths, half up", () => {
  it("fills a fixed total from a percentage", () => {
    expect(percentOffTotal(3000, 2, 10)).toBe(5400);
    expect(percentOffTotal(1000, 3, 15)).toBe(2550);
  });

  it("rounds an exact half up", () => {
    expect(percentOffTotal(333, 2, 25)).toBe(500); // 499.5
    expect(percentOffTotal(5, 3, 10)).toBe(14); // 13.5
    expect(percentOffTotal(1001, 2, 50)).toBe(1001); // exactly 1001.0
  });

  it("can return the full price on tiny prices, so the validator (not this function) is what refuses it", () => {
    expect(percentOffTotal(1, 2, 1)).toBe(2);
    expect(parseOfferLadder(1, [{ q: 2, t: 2 }])).toBeNull();
  });

  it.each([[0], [100], [-5], [10.5], [Number.NaN]])("refuses percent %s", (percent) => {
    expect(percentOffTotal(3000, 2, percent)).toBeNull();
  });

  it("refuses a bad quantity, a bad unit and an unsafe product", () => {
    expect(percentOffTotal(3000, 1, 10)).toBeNull();
    expect(percentOffTotal(3000, 101, 10)).toBeNull();
    expect(percentOffTotal(0, 2, 10)).toBeNull();
    expect(percentOffTotal(Number.MAX_SAFE_INTEGER, 2, 10)).toBeNull();
  });
});

describe("serialiseOfferLadder / readOfferLadder: the offers_json column", () => {
  it("an empty or absent ladder is NULL", () => {
    expect(serialiseOfferLadder([])).toBeNull();
    expect(serialiseOfferLadder(undefined)).toBeNull();
  });

  it("writes canonical JSON (keys q, t; no spaces)", () => {
    expect(serialiseOfferLadder(LADDER)).toBe('[{"q":2,"t":5500},{"q":3,"t":7500}]');
    expect(serialiseOfferLadder([{ t: 5500, q: 2 } as { q: number; t: number }])).toBe('[{"q":2,"t":5500}]');
  });

  it("a NULL, an absent or an old row means 'no offers'", () => {
    expect(readOfferLadder(UNIT, null)).toEqual([]);
    expect(readOfferLadder(UNIT, undefined)).toEqual([]);
    expect(readOfferLadder(UNIT, "")).toEqual([]);
  });

  it("reads back what was written", () => {
    expect(readOfferLadder(UNIT, serialiseOfferLadder(LADDER))).toEqual(LADDER);
  });

  it("a damaged cell or a ladder that no longer fits the price reads as no offers (never a wrong bundle price)", () => {
    expect(readOfferLadder(UNIT, "{not json")).toEqual([]);
    expect(readOfferLadder(UNIT, '[{"q":2,"t":5500,"x":1}]')).toEqual([]);
    expect(readOfferLadder(2000, serialiseOfferLadder(LADDER))).toEqual([]);
  });
});
