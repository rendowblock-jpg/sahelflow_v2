import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/inbox/conversation-controls.tsx"),
  "utf8",
);

describe("governed conversation assignment UI contract", () => {
  it("removes the legacy free-text assignee mutation", () => {
    expect(source).not.toContain("AssigneeControl (free-text");
    expect(source).not.toContain('placeholder={t("inbox.assignee.placeholder")}');
    expect(source).not.toContain("JSON.stringify({ assignee:");
  });

  it("submits exact governed command fields with optimistic authority", () => {
    expect(source).toContain('operation: "claim" | "release" | "assign" | "unassign"');
    expect(source).toContain("targetMemberId");
    expect(source).toContain("expectedVersion: version");
    expect(source).toContain("idempotencyKey: idempotencyKey(fingerprint)");
    expect(source).toContain('response.status === 409');
    expect(source).toContain("await hydrate()");
  });

  it("derives controls from server-projected actions and exact targets", () => {
    expect(source).toContain('includes("conversations.claim")');
    expect(source).toContain('includes("conversations.assign")');
    expect(source).toContain("assignableMembers");
    expect(source).toContain("member.memberId");
  });

  it("contains Arabic, French and English assignment/recovery states", () => {
    expect(source).toContain("Claim conversation");
    expect(source).toContain("Prendre la conversation");
    expect(source).toContain("استلام المحادثة");
    expect(source).toContain("Conversation handed over to");
    expect(source).toContain("Conversation transférée à");
    expect(source).toContain("تم تسليم المحادثة إلى");
  });
});
