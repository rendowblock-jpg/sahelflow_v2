import { describe, expect, it } from "vitest";

import {
  canOpenProtectedOperationalDetail,
  mergeUniversalSearchFamilies,
} from "../universal-search";

describe("universal search result composition", () => {
  it("preserves representation from every matching family before filling deeper ranks", () => {
    const families = [
      ["o1", "o2", "o3", "o4"],
      ["c1", "c2", "c3", "c4"],
      ["p1", "p2", "p3", "p4"],
      ["i1", "i2", "i3", "i4"],
      ["d1", "d2", "d3", "d4"],
      ["r1", "r2", "r3", "r4"],
    ];

    expect(mergeUniversalSearchFamilies(families, 12)).toEqual([
      "o1",
      "c1",
      "p1",
      "i1",
      "d1",
      "r1",
      "o2",
      "c2",
      "p2",
      "i2",
      "d2",
      "r2",
    ]);
  });

  it("redistributes unused capacity when families are empty or exhausted", () => {
    expect(
      mergeUniversalSearchFamilies(
        [["order"], [], ["product-1", "product-2", "product-3"]],
        4,
      ),
    ).toEqual(["order", "product-1", "product-2", "product-3"]);
  });

  it("requires both protected detail dimensions before deep-linking", () => {
    expect(
      canOpenProtectedOperationalDetail({
        contact: true,
        financials: true,
      }),
    ).toBe(true);
    expect(
      canOpenProtectedOperationalDetail({
        contact: true,
        financials: false,
      }),
    ).toBe(false);
    expect(
      canOpenProtectedOperationalDetail({
        contact: false,
        financials: true,
      }),
    ).toBe(false);
  });
});
