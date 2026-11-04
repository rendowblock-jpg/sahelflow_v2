import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * R50 (Modal full sweep b6509a98): the automation title link was 307x24 on a
 * phone, 20 hits on /automations. The link also carries the stretched layer
 * that makes the whole card tappable, but the rule is a 40 px link box on a
 * phone, the same as the card title in the data-table cards.
 */
describe("automation card title link on a phone", () => {
  it("keeps a 40 px link box under sm and the stretched card layer", () => {
    const source = readFileSync(join(process.cwd(), "src/components/automations/automation-card.tsx"), "utf8");
    const heading = source.split("\n").find((line) => line.includes("<h2 ") && line.includes("font-semibold")) ?? "";
    const link = source.split("\n").find((line) => line.includes("data-automation-edit={data.id}") && line.includes("<Link")) ?? "";
    // The phone floor sits on the heading (it reaches the link below it) so it never edits the same line as the Arabic-run wrapper.
    expect(heading).toContain("max-sm:[&_a]:min-h-10");
    expect(heading).toContain("max-sm:[&_a]:leading-10");
    expect(link).toContain("after:absolute");
    expect(link).toContain("after:inset-0");
  });
});
