/** Every tool definition the Gemini path offers must also be a valid OpenAI-compatible `parameters` object. */
import { describe, expect, it } from "vitest";

import "@/lib/ai/chat/tools/core-tools";
import "@/lib/ai/chat/tools/extended-tools";
import "@/lib/ai/chat/tools/advanced-tools";

import { getAllToolDefinitions } from "../../tools/registry";
import { definitionsToNeutral, sanitizeParameters, validateOpenAiParameters } from "../openai-compat";

// Definitions the converter must repair (pinned once measured; a new tool with a
// problem makes this list change on purpose, and the next test still guards it).
const KNOWN_NEEDS_CARE: string[] = [];

describe("the tool definitions as OpenAI-compatible parameters", () => {
  const definitions = getAllToolDefinitions();

  it("offers 29 tools (policy-blocked ones are not offered)", () => {
    expect(definitions).toHaveLength(29);
    expect(definitions.map((d) => d.name)).not.toContain("assign_order_to_delivery");
  });

  it("lists the raw definitions that are NOT valid as they are (they need converter care)", () => {
    const raw = definitions
      .map((d) => ({ name: d.name, problems: validateOpenAiParameters(d.parameters) }))
      .filter((entry) => entry.problems.length > 0);
    // The numbers travel in the assertion message (the test writes no file).
    const message = `RAW-INVALID ${raw.length}/${definitions.length}: ${JSON.stringify(raw)}`;
    expect(raw.map((entry) => entry.name), message).toEqual(KNOWN_NEEDS_CARE);
  });

  it("every converted definition is valid and the original definition is left untouched", () => {
    const before = JSON.stringify(definitions);
    const converted = definitionsToNeutral(definitions);
    expect(converted).toHaveLength(definitions.length);
    const bad = converted
      .map((t) => ({ name: t.name, problems: validateOpenAiParameters(t.parameters) }))
      .filter((entry) => entry.problems.length > 0);
    expect(bad).toEqual([]);
    expect(JSON.stringify(definitions)).toBe(before);
  });

  it("sanitizeParameters strips format/nullable, lowercases and fixes missing or array types", () => {
    const fixed = sanitizeParameters({
      type: "OBJECT",
      properties: {
        when: { type: "string", format: "date-time" },
        note: { type: ["string", "null"], nullable: true },
        tags: { type: "array" },
        mode: { enum: ["a", "b"] },
        nested: { properties: { x: { type: "number" } } },
      },
      required: ["when", "ghost"],
    });
    expect(validateOpenAiParameters(fixed)).toEqual([]);
    expect(fixed.properties.when).toEqual({ type: "string" });
    expect(fixed.properties.note).toEqual({ type: "string" });
    expect(fixed.properties.mode).toEqual({ type: "string", enum: ["a", "b"] });
    expect(fixed.required).toEqual(["when"]); // a required name with no property is dropped
  });
});
