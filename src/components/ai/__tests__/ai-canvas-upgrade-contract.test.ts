import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  askAiHref,
  ASK_AI_PROMPT_MAX_LENGTH,
  sanitizeAskAiPrompt,
} from "@/lib/ai/ask-ai-link";
import { getAiCanvasRuntimeTranslation } from "@/lib/i18n/ai-canvas-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("R4-e AI canvas upgrade — markdown rendering", () => {
  it("renders assistant markdown through the token-tree renderer, seller input verbatim", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const renderer = read("src/components/ai/markdown/ai-markdown.tsx");

    expect(canvas).toContain("<AiMarkdown content={message.content} />");
    expect(canvas).toContain("// Seller input is echoed verbatim");
    expect(canvas).toContain("whitespace-pre-wrap break-words");
    expect(renderer).toContain('data-ai-markdown="true"');
    expect(renderer).toContain("parseMarkdown(content)");
  });

  it("never injects raw HTML anywhere in the AI component graph", () => {
    const paths = [
      "src/components/ai/ai-decision-canvas.tsx",
      "src/components/ai/ai-decision-workspace.tsx",
      "src/components/ai/ai-workspace-shell.tsx",
      "src/components/ai/ai-work-history.tsx",
      "src/components/ai/ai-tool-result-card.tsx",
      "src/components/ai/ai-action-proposal-card.tsx",
      "src/components/ai/ai-review-evidence.tsx",
      "src/components/ai/markdown/ai-markdown.tsx",
    ];
    for (const path of paths) {
      expect(read(path), path).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("opens external links safely and keeps code LTR inside RTL conversations", () => {
    const renderer = read("src/components/ai/markdown/ai-markdown.tsx");
    expect(renderer).toContain('target="_blank"');
    expect(renderer).toContain('rel="noopener noreferrer nofollow"');
    expect(renderer).toContain('token.safe');
    // Unsafe-scheme links degrade to non-clickable text.
    expect(renderer).toContain("<span key={key}>{token.text}</span>");
    expect(renderer).toContain('dir="ltr"');
  });

  it("memoizes per message so only the streaming bubble re-parses on deltas", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const renderer = read("src/components/ai/markdown/ai-markdown.tsx");
    expect(canvas).toContain("const MessageBubble = memo(function MessageBubble");
    expect(canvas).toContain("copy={copy}");
    expect(renderer).toContain("memo(function AiMarkdown");
    expect(renderer).toContain("useMemo(() => parseMarkdown(content), [content])");
  });
});

describe("R4-e AI canvas upgrade — regenerate", () => {
  it("re-sends the last seller prompt as a new exchange through the existing stream path", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    expect(hook).toContain("const lastUserPrompt = useMemo(");
    expect(hook).toContain("const canRegenerate =");
    expect(hook).toContain("if (!canRegenerate || !lastUserPrompt) return false;");
    expect(hook).toContain("return send(lastUserPrompt);");
    // No bespoke regenerate endpoint — the established SSE send path is reused.
    expect(hook).toContain("messages/stream");
    expect(hook).not.toContain("/regenerate");
    expect(hook).not.toContain("/retry");
  });

  it("offers regenerate on the last assistant message while keeping Stop", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    expect(canvas).toContain('data-ai-regenerate="true"');
    expect(canvas).toContain('t("ai.canvas.regenerate")');
    expect(canvas).toContain("onClick={() => void regenerate()}");
    expect(canvas).toContain('aria-label={workspace.copy("stop")}');
    expect(canvas).toContain("onClick={stop}");
  });

  it("skips a usage/cost signal — the done event carries no usage metadata (nothing fabricated)", () => {
    const agent = read("src/lib/ai/chat/agent.ts");
    const stream = read(
      "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
    );
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    // The contract today: done = { response, toolCalls } only.
    expect(agent).toContain('type: "done";');
    expect(agent).not.toContain("usageMetadata");
    expect(agent).not.toContain("promptTokenCount");
    expect(stream).not.toContain("usage");
    expect(canvas).not.toContain("turnCost");
    expect(canvas).not.toContain("tokenCount");
  });
});

describe("R4-e AI canvas upgrade — session management", () => {
  it("adds rename + delete through one new route following the AI auth pattern", () => {
    const route = read("src/app/api/ai/sessions/[id]/route.ts");
    expect(route).toContain('export const PATCH');
    expect(route).toContain('export const DELETE');
    expect(route).toContain('await requireAuth("ai.use")');
    expect(route).toContain("aiChatSession.update");
    expect(route).toContain("aiChatSession.delete");
    expect(route).toContain("AI_SESSION_NOT_FOUND");
    expect(route).toContain("withErrorHandler");
    // zod-validated rename input, title bounded like the create route.
    expect(route).toContain("title: z.string().trim().min(1).max(160)");
  });

  it("deleting a session cascades its messages and proposals at the schema level", () => {
    const migration = read(
      "prisma/migrations/20260803164000_phase3_proposal_bound_ai/migration.sql",
    );
    expect(migration).toContain(
      'FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id")',
    );
    expect(migration).toContain("ON DELETE CASCADE");
  });

  it("wires rename and two-step delete into the history panel with honest failure feedback", () => {
    const hook = read("src/hooks/use-ai-workspace.ts");
    const history = read("src/components/ai/ai-work-history.tsx");
    expect(hook).toContain("const renameSession = useCallback");
    expect(hook).toContain("const deleteSession = useCallback");
    expect(hook).toContain('method: "PATCH"');
    expect(hook).toContain('method: "DELETE"');
    expect(history).toContain('data-ai-session-rename="true"');
    expect(history).toContain("data-ai-session-delete={session.id}");
    expect(history).toContain('t("ai.history.deleteConfirm")');
    expect(history).toContain('toast.error(t("ai.history.deleteFailed"))');
    expect(history).toContain('toast.error(t("ai.history.renameFailed"))');
  });

  it("keeps the locked-navigation and preview contracts of the history panel", () => {
    const history = read("src/components/ai/ai-work-history.tsx");
    expect(history).toContain("border-e");
    expect(history).toContain("navigationLocked: boolean;");
    expect(history).toContain("disabled={navigationLocked}");
    expect(history).toContain("disabled:cursor-not-allowed disabled:opacity-50");
    expect(history).toContain(
      "disabled={loadingSessions || creatingSession || sending}",
    );
    expect(history).toContain("data-ai-session={session.id}");
  });
});

describe("R4-e AI canvas upgrade — contextual Ask AI deep links", () => {
  it("seeds the composer from /agents?q= after sanitizing the payload", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    expect(page).toContain("searchParams");
    expect(page).toContain("sanitizeAskAiPrompt(params?.q)");
    expect(page).toContain("<AiWorkspaceShell initialPrompt={initialPrompt} />");
    expect(shell).toContain("<AiDecisionWorkspace initialPrompt={initialPrompt} />");
    expect(workspace.match(/initialDraft=\{initialPrompt\}/g)?.length).toBe(2);
    expect(canvas).toContain("useState(initialDraft)");
    // Prefill only ever fills an EMPTY composer — never clobbers seller input
    // (render-phase adjust-state-on-prop-change, no setState in an effect).
    expect(canvas).toContain("setPrevInitialDraft(initialDraft)");
    expect(canvas).toContain("if (!draft) {");
    expect(canvas).toContain("setDraft(initialDraft);");
  });

  it("exposes the Ask AI entry from the order detail header, permission-gated", () => {
    const page = read("src/app/(dashboard)/orders/[id]/page.tsx");
    expect(page).toContain("askAiHref(");
    expect(page).toContain('t("ai.ask.orderPrompt"');
    expect(page).toContain('t("ai.ask.button")');
    expect(page).toContain('data-testid="order-header-ask-ai"');
    expect(page).toContain('trustedActionAllowed(actorContext, "ai.use")');
    expect(page).toContain("Sparkles");
  });

  it("exposes the Ask AI entry from the customer detail header, name-gated", () => {
    const page = read("src/app/(dashboard)/customers/[id]/page.tsx");
    expect(page).toContain("askAiHref(");
    expect(page).toContain('t("ai.ask.customerPrompt"');
    expect(page).toContain('data-testid="customer-header-ask-ai"');
    expect(page).toContain("canAskAi && customer.name ?");
  });

  it("carries record identifiers only — no PII in the deep-link hrefs", () => {
    for (const path of [
      "src/app/(dashboard)/orders/[id]/page.tsx",
      "src/app/(dashboard)/customers/[id]/page.tsx",
    ]) {
      const source = read(path);
      const hrefLines = source
        .split("\n")
        .filter((line) => line.includes("askAiHref("));
      expect(hrefLines.length, path).toBe(1);
      for (const line of hrefLines) {
        expect(line).not.toContain("phone");
        expect(line).not.toContain("address");
        expect(line).not.toContain("wilaya");
        expect(line).not.toContain("commune");
      }
    }
  });

  it("sanitizes and encodes the deep-link payload", () => {
    expect(sanitizeAskAiPrompt(undefined)).toBe("");
    expect(sanitizeAskAiPrompt(["first", "second"])).toBe("first");
    expect(sanitizeAskAiPrompt("  about   order  SF-1 \u0007 ")).toBe(
      "about order SF-1",
    );
    expect(
      sanitizeAskAiPrompt("x".repeat(ASK_AI_PROMPT_MAX_LENGTH + 50)),
    ).toHaveLength(ASK_AI_PROMPT_MAX_LENGTH);
    expect(askAiHref("About order #SF-1?")).toBe(
      `/agents?q=${encodeURIComponent("About order #SF-1?")}`,
    );
  });
});

describe("R4-e AI canvas upgrade — i18n runtime dictionary", () => {
  const keys = [
    "ai.ask.button",
    "ai.ask.orderPrompt",
    "ai.ask.customerPrompt",
    "ai.canvas.regenerate",
    "ai.history.rename",
    "ai.history.renameSave",
    "ai.history.renameCancel",
    "ai.history.delete",
    "ai.history.deleteConfirm",
    "ai.history.renameFailed",
    "ai.history.deleteFailed",
  ] as const;

  it("ships every R4-e key in en/fr/ar and registers it in the shared resolver", () => {
    const resolver = read("src/lib/i18n/runtime-translations.ts");
    expect(resolver).toContain("getAiCanvasRuntimeTranslation(locale, key)");
    for (const key of keys) {
      for (const locale of ["en", "fr", "ar"] as const) {
        expect(getAiCanvasRuntimeTranslation(locale, key), `${locale}:${key}`)
          .toBeTruthy();
        // The registered chain resolves it too — no dotted-key leaks.
        expect(getRuntimeTranslation(locale, key), `${locale}:${key}`)
          .toBeTruthy();
      }
    }
  });

  it("interpolates record identifiers into the prompt templates", () => {
    const order = getRuntimeTranslation("fr", "ai.ask.orderPrompt");
    expect(order).toContain("{{orderNumber}}");
    const customer = getRuntimeTranslation("ar", "ai.ask.customerPrompt");
    expect(customer).toContain("{{name}}");
    expect(getRuntimeTranslation("en", "ai.ask.button")).toBe("Ask AI");
    expect(getRuntimeTranslation("ar", "ai.canvas.regenerate")).toBe(
      "إعادة التوليد",
    );
  });
});
