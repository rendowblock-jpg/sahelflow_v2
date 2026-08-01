import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/inbox/conversation-collaboration-panel.tsx",
  "utf8",
);
const inbox = readFileSync("src/components/inbox/inbox-live.tsx", "utf8");
const commentsRoute = readFileSync(
  "src/app/api/collaboration/comments/route.ts",
  "utf8",
);

describe("conversation collaboration workspace", () => {
  it("integrates governed queue routing, internal comments and exact mentions", () => {
    expect(inbox).toContain("<ConversationCollaborationPanel conversationId={activeChat.id} />");
    expect(source).toContain('fetch("/api/collaboration/routing"');
    expect(source).toContain('fetch("/api/collaboration/comments"');
    expect(source).toContain("mentionMemberIds: [...mentions].sort()");
    expect(source).toContain("expectedVersion: routing.version");
    expect(source).toContain("expectedVersion: comments.version");
    expect(source).toContain("idempotencyKey: keyFor(commentRequest, fingerprint)");
  });

  it("contains complete English, French and Arabic failure and recovery states", () => {
    expect(source).toContain("You are offline. No collaboration change was submitted.");
    expect(source).toContain("Vous êtes hors ligne. Aucun changement de collaboration n’a été envoyé.");
    expect(source).toContain("أنت غير متصل. لم يتم إرسال أي تغيير.");
    expect(source).toContain('type WorkspaceMode = "idle" | "loading" | "ready" | "offline" | "stale" | "permission" | "error"');
    expect(source).toContain("route-conflict");
    expect(source).toContain("comment-conflict");
    expect(source).toContain("Retry safely");
    expect(source).toContain("Réessayer en sécurité");
    expect(source).toContain("إعادة المحاولة بأمان");
  });

  it("keeps durable command keys stable across retryable submissions", () => {
    expect(source).toContain("if (ref.current?.fingerprint === fingerprint)");
    expect(source).toContain("keyFor(routeRequest, fingerprint)");
    expect(source).toContain("keyFor(commentRequest, fingerprint)");
    expect(source).toContain("globalThis.crypto.randomUUID()");
  });

  it("projects only the member fields required for mentions", () => {
    expect(commentsRoute).toContain("memberId: member.memberId");
    expect(commentsRoute).toContain("displayName: member.displayName");
    expect(commentsRoute).toContain("role: member.role");
    expect(commentsRoute).not.toContain("personId: member.personId");
  });
});
