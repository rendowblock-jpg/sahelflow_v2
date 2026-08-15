import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI operational workspace contract", () => {
  it("routes Agents through the typed workspace instead of the legacy monolith", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    expect(page).toContain("AiWorkspace");
    expect(page).not.toContain("AiChat");
  });

  it("starts from real seller tasks instead of presenting an empty generic chat as the workbench", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const launchpad = read("src/components/ai/ai-operational-launchpad.tsx");
    const copy = read("src/lib/i18n/ai-workspace.ts");

    expect(page).toContain("AiOperationalLaunchpad");
    expect(launchpad).toContain('data-ai-launchpad="operational"');
    expect(launchpad).toContain('fetch("/api/ai/status"');
    expect(launchpad).toContain('fetch("/api/ai/sessions"');
    expect(launchpad).toContain("/messages");
    expect(launchpad).toContain('window.location.assign("/agents")');
    expect(copy).toContain("launchPendingPrompt");
    expect(copy).toContain("launchRevenuePrompt");
    expect(copy).toContain("launchReturnsPrompt");
    expect(copy).toContain("launchProductsPrompt");
    expect(copy).toContain("ابدأ من العمل، لا من محادثة فارغة");
    expect(copy).toContain("Commencez par le travail");
    expect(copy).toContain("Start from the work, not a blank chat");
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

  it("localizes system-owned proposal and tool errors instead of leaking French", () => {
    const context = read("src/lib/ai/chat/locale-context.ts");
    const agent = read("src/lib/ai/chat/agent.ts");
    expect(context).toContain("aiProposalRecordedMessage");
    expect(context).toContain("aiUnknownToolMessage");
    expect(agent).toContain("aiProposalRecordedMessage(locale ?? \"fr\", proposal.tool)");
    expect(agent).toContain("aiUnknownToolMessage(locale ?? \"fr\", call.name)");
    expect(agent).not.toContain("Outil inconnu:");
    expect(agent).not.toContain("Une proposition d'action exacte (${proposal.tool})");
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
    const view = read("src/components/ai/ai-workspace.tsx");
    expect(hook).toContain("AiSetupState | null");
    expect(hook).toContain("setupError");
    expect(hook).toContain("actionHistoryError");
    expect(view).toContain('copy("setupUnavailable")');
    expect(view).toContain('copy("actionHistoryUnavailable")');
    expect(view).toContain("proposals.length === 0 && !actionHistoryError");
  });

  it("separates client state authority from presentation and raw result rendering", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const view = read("src/components/ai/ai-workspace.tsx");
    const resultCard = read("src/components/ai/ai-tool-result-card.tsx");
    expect(hook).toContain("conversationGenerationRef");
    expect(hook).toContain("conversationAbortRef");
    expect(hook).toContain('eventType === "persistence_warning"');
    expect(hook).toContain('tool.state !== "running"');
    expect(view).toContain('data-ai-workspace="v2"');
    expect(view).toContain('role="log"');
    expect(view).toContain("followTailRef");
    expect(view).toContain("SessionsPane");
    expect(view).toContain("ContextRail");
    expect(resultCard).not.toContain("JSON.stringify");
  });

  it("keeps sensitive approval bound to the server-issued exact proposal digest", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const card = read("src/components/ai/ai-action-proposal-card.tsx");
    expect(hook).toContain("proposalDigest: handle.proposalDigest");
    expect(hook).toContain("/approve");
    expect(card).toContain("proposal.proposalDigestPrefix");
    expect(card).toContain('copy("exactApprovalNotice")');
  });

  it("centralizes AR/FR/EN workspace copy", () => {
    const copy = read("src/lib/i18n/ai-workspace.ts");
    expect(copy).toContain("en:");
    expect(copy).toContain("fr:");
    expect(copy).toContain("ar:");
    expect(copy).toContain("عمليات الذكاء الاصطناعي");
    expect(copy).toContain("Opérations IA");
    expect(copy).toContain("AI operations");
  });
});
