import { describe, expect, it } from "vitest";

import {
  EXPECTED_AI_TOOL_NAMES,
  getAiToolPolicy,
} from "@/lib/ai/actions/contracts";
import { aiCapabilityGroups } from "@/lib/ai/chat/tools/capability-groups";

/**
 * Ledger F-06 — the page's capability surface is derived from the SAME policy
 * map the registry and proposal runtime enforce. These pins make drift
 * impossible: a tool added to the policy map without a page group fails here
 * AND at runtime (the route throws fail-closed), so the Agents page can never
 * silently drift from the agent's real surface.
 */
describe("AI capability groups (F-06)", () => {
  const groups = aiCapabilityGroups();
  const grouped = groups.flatMap((group) =>
    group.tools.map((tool) => tool.name),
  );

  it("groups every expected tool exactly once — nothing missing, nothing duplicated", () => {
    const blocked = EXPECTED_AI_TOOL_NAMES.filter(
      (name) => getAiToolPolicy(name).executionClass === "blocked",
    );
    const presentable = EXPECTED_AI_TOOL_NAMES.filter(
      (name) => !blocked.includes(name),
    );

    expect([...grouped].sort()).toEqual([...presentable].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("never presents a blocked tool as an ability", () => {
    for (const name of grouped) {
      expect(getAiToolPolicy(name).executionClass).not.toBe("blocked");
    }
  });

  it("marks exactly the central sensitive policies as needing approval", () => {
    for (const group of groups) {
      for (const tool of group.tools) {
        const policy = getAiToolPolicy(tool.name);
        expect(tool.executionClass).toBe(policy.executionClass);
      }
    }
    const sensitiveOnPage = groups
      .flatMap((group) => group.tools)
      .filter((tool) => tool.executionClass === "sensitive")
      .map((tool) => tool.name)
      .sort();
    const sensitiveInPolicy = EXPECTED_AI_TOOL_NAMES.filter(
      (name) => getAiToolPolicy(name).executionClass === "sensitive",
    ).sort();
    expect(sensitiveOnPage).toEqual(sensitiveInPolicy);
  });

  it("keeps the six operational job groups non-empty", () => {
    expect(groups.map((group) => group.id)).toEqual([
      "orders",
      "customers",
      "products",
      "delivery",
      "insights",
      "conversations",
    ]);
  });
});
