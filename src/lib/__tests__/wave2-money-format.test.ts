import { describe, expect, it } from "vitest";

import { formatDZDShort } from "../utils";

describe("Wave 2 compact money localization", () => {
  it("preserves the approved local currency suffix for compact values", () => {
    expect(formatDZDShort(1_250_000, "ar")).toContain("دج");
    expect(formatDZDShort(1_250_000, "fr")).toContain("DA");
    expect(formatDZDShort(1_250_000, "en")).toContain("DA");
  });

  it("uses Intl compact notation rather than hardcoded K/M suffixes", () => {
    const arabic = formatDZDShort(1_250_000, "ar");
    const english = formatDZDShort(1_250_000, "en");
    const expectedEnglishCompact = new Intl.NumberFormat("en-GB", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(1_250_000);

    expect(arabic).not.toBe(english);
    expect(english).toContain(expectedEnglishCompact);
  });
});
