import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getAiWorkspaceCopy } from "@/lib/i18n/ai-workspace";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const LOCALES = ["en", "fr", "ar"] as const;

/**
 * Ledger AI-13 — thumbs feedback feeding the quality loop: one durable row
 * per assistant answer, the opposite thumb overwrites, the active thumb
 * deletes; ownership is enforced; nothing changes the conversation content.
 */
describe("AI thumbs feedback (AI-13)", () => {
  it("stores one feedback row per answer with cascade and quality-loop indexes", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("model AiMessageFeedback");
    expect(schema).toContain("@@unique([messageId])");
    expect(schema).toContain("@@index([value, createdAt])");
    expect(schema).toContain("onDelete: Cascade");

    const migration = source(
      "prisma/migrations/20260902000000_ai_message_feedback/migration.sql",
    );
    expect(migration).toContain('CREATE TABLE "AiMessageFeedback"');
    expect(migration).toContain('REFERENCES "AiChatMessage" ("id")');
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "AiMessageFeedback_messageId_key"',
    );
  });

  it("gates the route by auth and session ownership with coded errors", () => {
    const route = source(
      "src/app/api/ai/sessions/[id]/messages/[messageId]/feedback/route.ts",
    );
    expect(route).toContain('await requireAuth("ai.use")');
    expect(route).toContain('value: z.enum(["up", "down", "none"])');
    // Cross-session messageIds are 404s, never writes.
    expect(route).toContain("sessionId: id");
    expect(route).toContain('code: "AI_SESSION_NOT_FOUND"');
    expect(route).toContain("deleteMany");
    expect(route).toContain("upsert");
    expect(route).toContain("withErrorHandler");
  });

  it("toggles honestly on the live view with optimistic rollback", () => {
    const hook = source("src/hooks/use-ai-workspace.ts");
    const canvas = source("src/components/ai/ai-decision-canvas.tsx");

    expect(hook).toContain("const sendFeedback = useCallback(");
    expect(hook).toContain('body: JSON.stringify({ value })');
    expect(hook).toContain("feedback: previous ?? null");
    expect(canvas).toContain('data-ai-feedback-up="true"');
    expect(canvas).toContain('data-ai-feedback-down="true"');
    expect(canvas).toContain("aria-pressed={message.feedback === \"up\"}");
    expect(canvas).toContain("onFeedback={sendFeedback}");
    // The thumbs never decorate streaming or empty bubbles.
    expect(canvas).toContain("!message.streaming && message.content");
  });

  it("ships the feedback labels in en/fr/ar", () => {
    expect(getAiWorkspaceCopy("en", "feedbackUp")).toBe("Helpful response");
    expect(getAiWorkspaceCopy("fr", "feedbackUp")).toBe("Réponse utile");
    expect(getAiWorkspaceCopy("ar", "feedbackDown")).toBe("إجابة غير مفيدة");
    for (const key of ["feedbackUp", "feedbackDown"] as const) {
      for (const locale of LOCALES) {
        expect(getAiWorkspaceCopy(locale, key), `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
