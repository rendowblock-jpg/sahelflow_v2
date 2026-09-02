import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getTranslations } from "@/lib/i18n";

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
    expect(source).toContain("canUpdate");
  });

  it("keeps assignment and handover copy in the trilingual i18n authority", () => {
    const expected = {
      en: {
        claim: "Claim conversation",
        handedOver: "Conversation handed over to {{target}}",
      },
      fr: {
        claim: "Prendre la conversation",
        handedOver: "Conversation transférée à {{target}}",
      },
      ar: {
        claim: "استلام المحادثة",
        handedOver: "تم تسليم المحادثة إلى {{target}}",
      },
    } as const;
    for (const locale of ["en", "fr", "ar"] as const) {
      const translations = getTranslations(locale);
      expect(translations["inbox.assignment.claim"]).toBe(
        expected[locale].claim,
      );
      expect(translations["inbox.assignmentActivity.handedOver"]).toBe(
        expected[locale].handedOver,
      );
    }
  });

  it("resolves every assignment label through the shared t() chain", () => {
    expect(source).not.toContain("const ASSIGNMENT_COPY");
    expect(source).toContain("const { t } = useI18n();");
    expect(source).toContain('t("inbox.assignment.loadError")');
    expect(source).toContain('t("inbox.assignment.conflict")');
    expect(source).toContain('t("common.refresh")');
    expect(source).toContain("inbox.assignmentActivity.handedOver");
  });
});
