import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI Class-AAA decision workspace contract", () => {
  it("routes Agents through the Founder-approved decision workspace", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");
    const target = read("documentation/product/AI_AGENTS_CLASS_AAA_TARGET.md");

    expect(page).toContain("AiWorkspaceShell");
    expect(page).toContain('requireTrustedAction("ai.use")');
    expect(page).toContain('<FeatureGate feature="ai_chat">');
    expect(shell).toContain("AiDecisionWorkspace");
    expect(shell).not.toContain("AiOperationalLaunchpad");
    expect(shell).not.toContain("<AiWorkspace");
    expect(target).toContain("FOUNDER-APPROVED");
    expect(target).toContain("seller decision workspace");
  });

  it("uses two panes at common desktop width and progressive review evidence", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    expect(workspace).toContain('useMediaQuery("(min-width: 1500px)")');
    expect(workspace).toContain('grid-cols-[17.5rem_minmax(0,1fr)]');
    expect(workspace).toContain(
      'grid-cols-[17.5rem_minmax(0,1fr)_20rem]',
    );
    expect(workspace).toContain("AiWorkHistory");
    expect(workspace).toContain("AiDecisionCanvas");
    expect(workspace).toContain("AiReviewEvidence");
    expect(canvas).toContain('data-ai-inline-proposals="true"');
    expect(canvas).toContain('<SheetContent side="end"');
    expect(canvas).not.toContain('locale === "ar" ? "left" : "right"');
  });

  it("keeps mobile on deliberate history to canvas drill-in", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    expect(workspace).toContain('useState<"history" | "canvas">("history")');
    expect(workspace).toContain('setMobilePane("canvas")');
    expect(workspace).toContain('mobilePane === "history"');
    expect(canvas).toContain("onBack");
    expect(canvas).toContain('aria-label={workspace.copy("backToSessions")}');
  });

  it("loads the most recent durable AI history and returns it chronologically", () => {
    const history = read("src/lib/ai/chat/session-history.ts");
    expect(history).toContain('orderBy: [{ createdAt: "desc" }, { id: "desc" }]');
    expect(history).toContain("take: boundedLimit");
    expect(history).toContain("return rows.reverse()");
  });

  it("keeps session creation locale-neutral and previews the latest message", () => {
    const sessions = read("src/app/api/ai/sessions/route.ts");
    expect(sessions).toContain('orderBy: [{ createdAt: "desc" }, { id: "desc" }]');
    expect(sessions).toContain("data: { title: input.title ?? null }");
    expect(sessions).not.toContain('title: "Nouvelle conversation"');
  });

  it("projects AI setup without decrypting or exposing the provider key", () => {
    const status = read("src/app/api/ai/status/route.ts");
    expect(status).toContain("hasSecret");
    expect(status).toContain("geminiConsentAccepted");
    expect(status).toContain("keyConfigured");
    expect(status).not.toContain("getSecret");
  });

  it("keeps locale guidance in system context and the seller user turn exact", () => {
    const context = read("src/lib/ai/chat/locale-context.ts");
    const agent = read("src/lib/ai/chat/agent.ts");
    const route = read("src/app/api/ai/sessions/[id]/messages/route.ts");
    const stream = read(
      "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
    );
    expect(context).toContain("not action authority");
    expect(context).toContain("exact tool/action arguments");
    expect(context).toContain("aiChatSystemPrompt");
    expect(context).toContain("أنت المساعد الذكي");
    expect(context).toContain("You are SahelFlow's AI assistant");
    expect(agent).toContain('aiChatSystemPrompt(locale ?? "fr")');
    expect(agent).toContain('{ role: "user", parts: [{ text: userMessage }] }');
    expect(route).toContain("input.message,");
    expect(route).toContain("input.locale,");
    expect(stream).toContain("input.message,");
    expect(stream).toContain("input.locale,");
    expect(route).not.toContain("withAiChatLocaleContext");
    expect(stream).not.toContain("withAiChatLocaleContext");
  });

  it("does not persist streamed provider errors as assistant history", () => {
    const stream = read(
      "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
    );
    expect(stream).toContain("shouldPersistAssistant = false");
    expect(stream).toContain('type: "persistence_warning"');
    expect(stream).toContain('code: "AI_RESPONSE_NOT_PERSISTED"');
    expect(stream).not.toContain('content: "(erreur)"');
  });

  it("keeps degraded setup and action-history truth distinct from empty states", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const review = read("src/components/ai/ai-review-evidence.tsx");
    expect(hook).toContain("AiSetupState | null");
    expect(hook).toContain("setupError");
    expect(hook).toContain("actionHistoryError");
    expect(canvas).toContain('workspace.copy("setupUnavailable")');
    expect(review).toContain("actionHistoryError");
    expect(review).toContain('getAiDecisionCopy(locale, "actionHistoryIssue")');
    expect(review).toContain("proposals.length === 0");
  });

  it("keeps client state authority separate from presentation", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const resultCard = read("src/components/ai/ai-tool-result-card.tsx");
    expect(hook).toContain("conversationGenerationRef");
    expect(hook).toContain("conversationAbortRef");
    expect(hook).toContain('eventType === "persistence_warning"');
    expect(hook).toContain('tool.state !== "running"');
    expect(workspace).toContain('data-ai-decision-workspace="true"');
    expect(canvas).toContain('role="log"');
    expect(canvas).toContain("followTailRef");
    expect(resultCard).not.toContain("JSON.stringify");
  });

  it("keeps sensitive approval bound to the server-issued exact proposal digest", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const card = read("src/components/ai/ai-action-proposal-card.tsx");
    const approval = read(
      "src/app/api/ai/actions/[proposalId]/approve/route.ts",
    );
    expect(hook).toContain("proposalDigest: handle.proposalDigest");
    expect(hook).toContain("/approve");
    expect(card).toContain("proposal.proposalDigestPrefix");
    expect(card).toContain("TechnicalValue");
    expect(card).toContain('copy("exactApprovalNotice")');
    expect(approval).toContain('requireAuth("approvals.approve")');
    expect(approval).toContain("assertAiActionApprovalActor");
  });

  it("keeps active decision surfaces above legacy microcopy sizes", () => {
    const paths = [
      "src/components/ai/ai-work-history.tsx",
      "src/components/ai/ai-decision-canvas.tsx",
      "src/components/ai/ai-review-evidence.tsx",
      "src/components/ai/ai-tool-result-card.tsx",
      "src/components/ai/ai-action-proposal-card.tsx",
    ];
    for (const path of paths) {
      const source = read(path);
      expect(source).not.toContain('text-[9px]');
      expect(source).not.toContain('text-[10px]');
      expect(source).not.toContain('text-[11px]');
    }
  });

  it("centralizes equal-depth AR/FR/EN workspace copy", () => {
    const copy = read("src/lib/i18n/ai-workspace.ts");
    const decisionCopy = read("src/lib/i18n/ai-decision-workspace.ts");
    expect(copy).toContain("en:");
    expect(copy).toContain("fr:");
    expect(copy).toContain("ar:");
    expect(decisionCopy).toContain('reviewEvidence: "Review & evidence"');
    expect(decisionCopy).toContain('reviewEvidence: "Revue & preuves"');
    expect(decisionCopy).toContain('reviewEvidence: "المراجعة والأدلة"');
    expect(decisionCopy).toContain("لهذا المتجر");
  });
});
