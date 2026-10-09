import { describe, expect, it } from "vitest";

import { displayWilaya } from "@/lib/wilaya-display";

describe("displayWilaya", () => {
  it("shows the wilaya in the interface language whatever the stored spelling", () => {
    expect(displayWilaya("Alger", "ar")).toBe("الجزائر");
    expect(displayWilaya("الجزائر", "fr")).toBe("Alger");
    expect(displayWilaya("setif", "ar")).toBe("سطيف");
    expect(displayWilaya("16", "en")).toBe("Alger");
    expect(displayWilaya("وهران", "ar")).toBe("وهران");
  });

  it("leaves unknown values and empties untouched", () => {
    expect(displayWilaya("Paris", "ar")).toBe("Paris");
    expect(displayWilaya(null, "fr")).toBe("");
  });
});
