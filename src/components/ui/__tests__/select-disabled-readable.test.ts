import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 (Modal full sweep b6509a98, /onboarding en dark desktop): the disabled
 * "Choose a wilaya first" select faded its own explanation to 2.55:1 with
 * opacity-50. A disabled control is exempt from the contrast rule, but this
 * text tells the person WHY it is disabled, so the control now reads as
 * disabled through a muted fill, muted text and the not-allowed cursor, and
 * keeps its words at full strength.
 */
describe("disabled select trigger", () => {
  it("does not fade its text with opacity and says 'disabled' with a muted fill", () => {
    const source = readFileSync(join(process.cwd(), "src/components/ui/select.tsx"), "utf8");
    const trigger = source.split("\n").find((line) => line.includes("min-h-(--control-height)") && line.includes("w-fit")) ?? "";
    expect(trigger).toContain("disabled:opacity-100");
    expect(trigger).toContain("disabled:bg-muted/40");
    expect(trigger).toContain("disabled:text-muted-foreground");
    expect(trigger).toContain("disabled:cursor-not-allowed");
    expect(trigger).not.toContain("disabled:opacity-50");
  });
});
