import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commentsRoute = readFileSync(
  "src/app/api/collaboration/comments/route.ts",
  "utf8",
);

describe("conversation collaboration workspace", () => {
  it("projects only the member fields required for mentions", () => {
    expect(commentsRoute).toContain("memberId: member.memberId");
    expect(commentsRoute).toContain("displayName: member.displayName");
    expect(commentsRoute).toContain("role: member.role");
    expect(commentsRoute).not.toContain("personId: member.personId");
  });
});
