import { describe, expect, it } from "vitest";

import { percentChange, roundedPercentChange } from "@/lib/data/percent-change";

/*
 * One rule for "change versus a baseline" (F-0048, F-0049). The dashboard used to answer 0 for a missing baseline
 * and the analytics page answered null (shown as a dash); two rules for one idea. Growth from nothing has no
 * meaningful percentage ("+100 %" would be false), so it is null for both.
 */
describe("percentChange", () => {
  it("is a plain percentage when there is a baseline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
  });

  it("is null (a dash) for growth from nothing", () => {
    expect(percentChange(5, 0)).toBeNull();
  });

  it("is 0 when both sides are zero: nothing happened on either side", () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it("keeps a real -100 % when something existed and now there is nothing", () => {
    expect(percentChange(0, 4)).toBe(-100);
  });

  it("does not round (analytics keeps its decimals)", () => {
    expect(percentChange(2, 3)).toBeCloseTo(-33.3333, 3);
  });
});

describe("roundedPercentChange (the dashboard card)", () => {
  it("rounds to a whole percent", () => {
    expect(roundedPercentChange(2, 3)).toBe(-33);
    expect(roundedPercentChange(5, 3)).toBe(67);
  });

  it("passes the dash through", () => {
    expect(roundedPercentChange(1, 0)).toBeNull();
  });

  it("is 0 for 0 against 0", () => {
    expect(roundedPercentChange(0, 0)).toBe(0);
  });
});
