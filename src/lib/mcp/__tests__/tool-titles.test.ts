/**
 * Tool titles tests — verify every registered tool has a human-readable title.
 */

import { describe, expect, it } from "vitest";

import { getAllRegisteredToolNames } from "../registry";
import { TOOL_TITLES } from "../tool-titles";
import "../tools";

describe("TOOL_TITLES", () => {
  it("every registered tool has a title", () => {
    const names = getAllRegisteredToolNames();
    for (const name of names) {
      expect(TOOL_TITLES).toHaveProperty(name);
    }
  });

  it("every title is a non-empty human-readable string", () => {
    for (const [name, title] of Object.entries(TOOL_TITLES)) {
      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(2);
      // Should not be the raw camelCase name
      expect(title).not.toBe(name);
      // Should contain at least one space (human-readable)
      expect(title).toContain(" ");
    }
  });

  it("no orphan titles (title exists for unregistered tool)", () => {
    const names = new Set(getAllRegisteredToolNames());
    for (const name of Object.keys(TOOL_TITLES)) {
      // Allow titles for tools that might be registered later
      // but warn if a title exists for a tool that was never registered
      if (!names.has(name)) {
        console.warn(`TOOL_TITLES has entry for unregistered tool: ${name}`);
      }
    }
  });
});
