import { describe, expect, it } from "vitest";

import {
  describeDeleteRejection,
  type DeleteChatsRejection,
} from "../use-inbox-workspace";

describe("describeDeleteRejection (campaign B5 round 3)", () => {
  it("summarizes a schema violation with paths, count and lengths, PII-free", () => {
    const rejection: DeleteChatsRejection = {
      reason: "schema_violation",
      issues: ["ids.0"],
      idCount: 1,
      idLengths: [78],
      bodyLength: 96,
    };
    expect(describeDeleteRejection(rejection)).toBe(
      "failing: ids.0 — 1 id(s) — lengths [78] — body 96B",
    );
  });

  it("summarizes a malformed JSON body with its size", () => {
    expect(
      describeDeleteRejection({ reason: "malformed_json", bodyLength: 12 }),
    ).toBe("malformed JSON body (12 bytes)");
  });

  it("falls back to the bare reason when no shape fields are present", () => {
    expect(describeDeleteRejection({ reason: "schema_violation" })).toBe(
      "schema_violation",
    );
    expect(describeDeleteRejection(null)).toBe(null);
    expect(describeDeleteRejection(undefined)).toBe(null);
  });

  it("never includes id values — callers only pass shape fields", () => {
    const summary = describeDeleteRejection({
      reason: "schema_violation",
      issues: ["ids.0", "ids.1"],
      idCount: 2,
      idLengths: [78, 0],
    });
    expect(summary).not.toContain("conv-");
    expect(summary).toContain("lengths [78, 0]");
  });
});
