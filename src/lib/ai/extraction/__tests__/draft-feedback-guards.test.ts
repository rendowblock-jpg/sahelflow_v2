import { describe, expect, it } from "vitest";
import { averageKnown, checkTotal, summariseConfidence } from "../draft-feedback";

describe("averageKnown", () => {
  it("skips negative, NaN and infinite values, keeps zero", () => {
    expect(averageKnown([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 0.7])).toEqual({ avg: 0.6, unknownCount: 3 });
    expect(averageKnown([])).toEqual({ avg: null, unknownCount: 0 });
    expect(averageKnown([0])).toEqual({ avg: 0, unknownCount: 0 });
    expect(summariseConfidence("regex", [0])).toEqual({ avgConfidence: 0, basis: "rule", unknownCount: 0 });
  });
});
describe("checkTotal, stated above the lines", () => {
  it("is a mismatch, not a match", () => {
    expect(checkTotal({ items: [{ productName: "a", quantity: 2, unitPrice: 3000 }], totalPrice: 7000 })).toEqual({ status: "mismatch", computed: 6000, stated: 7000 });
  });
});
