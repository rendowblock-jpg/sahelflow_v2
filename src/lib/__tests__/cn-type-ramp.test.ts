import { describe, expect, it } from "vitest";

import { TYPE_RAMP_SIZES, cn } from "@/lib/utils";

describe("cn keeps the system type ramp", () => {
  it("never lets a text colour erase a ramp size", () => {
    for (const size of TYPE_RAMP_SIZES) {
      expect(cn(`text-${size}`, "text-muted-foreground")).toBe(
        `text-${size} text-muted-foreground`,
      );
      expect(cn("text-success", `text-${size}`)).toBe(`text-success text-${size}`);
    }
  });

  it("still resolves one ramp size against another", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
    expect(cn("text-sm", "text-body-sm")).toBe("text-body-sm");
  });
});
