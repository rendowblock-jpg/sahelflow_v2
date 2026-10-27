/**
 * isAiToolBlocked: the lookup for a tool NAME THE MODEL CHOSE. It answers
 * true only for a policy-blocked tool and, unlike getAiToolPolicy, never throws
 * for a name that does not exist.
 */
import { describe, expect, it } from "vitest";

import { EXPECTED_AI_TOOL_NAMES, getAiToolPolicy, isAiToolBlocked } from "../contracts";

describe("isAiToolBlocked", () => {
  it("is true for the policy-blocked tool", () => {
    expect(isAiToolBlocked("assign_order_to_delivery")).toBe(true);
  });

  it("is true exactly for the tools whose policy class is blocked", () => {
    for (const name of EXPECTED_AI_TOOL_NAMES) {
      expect(isAiToolBlocked(name), name).toBe(getAiToolPolicy(name).executionClass === "blocked");
    }
    expect(EXPECTED_AI_TOOL_NAMES.filter(isAiToolBlocked)).toEqual(["assign_order_to_delivery"]);
  });

  it("is false, and does not throw, for names that do not exist", () => {
    for (const name of ["no_such_tool", "", " ", "ASSIGN_ORDER_TO_DELIVERY", "__proto__", "constructor", "toString"]) {
      expect(() => getAiToolPolicy(name)).toThrow(); // the strict lookup still refuses them
      expect(isAiToolBlocked(name), name).toBe(false);
    }
  });
});
