import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EXPECTED_AI_TOOL_NAMES } from "@/lib/ai/actions/contracts";

/**
 * Ledger AI-01 drift guard: every tool name seeded into demo AI conversations
 * MUST exist in the real 30-tool registry. The original demo seed shipped
 * fictional names (`get_operational_brief`, `get_order`) that rendered as raw
 * IDs and a ghost table — this test makes that class of drift impossible.
 */
const demoSource = readFileSync(
  new URL("../algerian-demo.ts", import.meta.url),
  "utf8",
);

const seededToolNames = [
  ...demoSource.matchAll(/name:\s*"([a-z][a-z_]+)"/g),
]
  .map((match) => match[1] ?? "")
  .filter((name) => name.startsWith("get_") || name.startsWith("list_") || name.startsWith("search_"));

describe("demo AI seed ↔ tool registry contract", () => {
  it("seeds at least one tool call to guard against a silent regex break", () => {
    expect(seededToolNames.length).toBeGreaterThan(0);
  });

  it("only seeds tool names that exist in the real registry", () => {
    for (const name of seededToolNames) {
      expect(
        EXPECTED_AI_TOOL_NAMES,
        `demo seed references unknown tool "${name}"`,
      ).toContain(name);
    }
  });
});
