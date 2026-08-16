import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI Class-AAA final review regressions", () => {
  it("does not create a first session before durable history hydration", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const history = read("src/components/ai/ai-work-history.tsx");

    expect(workspace).toContain("workspace.loadingSessions ||");
    expect(workspace).toContain("workspace.creatingSession ||");
    expect(workspace).toContain("workspace.sending");
    expect(history).toContain(
      "disabled={loadingSessions || creatingSession || sending}",
    );
  });

  it("releases a queued first prompt when the operator selects another session", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");

    expect(workspace).toContain("const pending = pendingPromptRef.current;");
    expect(workspace).toContain("pending && pending.sessionId !== sessionId");
    expect(workspace).toContain("pendingPromptRef.current = null;");
    expect(workspace).toContain("setStartingAnalysis(false);");
  });

  it("keeps chronological proposal objects non-interactive and review evidence authoritative", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const card = read("src/components/ai/ai-action-proposal-card.tsx");
    const review = read("src/components/ai/ai-review-evidence.tsx");

    expect(canvas).toContain('data-ai-inline-proposals="true"');
    expect(canvas).toContain("interactive={false}");
    expect(canvas).not.toContain("!wideReview && proposals.length > 0");
    expect(card).toContain("interactive = true");
    expect(card).toContain("interactive && approvable");
    expect(review).toContain("onApprove={approveProposal}");
  });

  it("labels consent/key readiness as configuration truth rather than provider health", () => {
    const review = read("src/components/ai/ai-review-evidence.tsx");
    const copy = read("src/lib/i18n/ai-decision-workspace.ts");

    expect(review).toContain('getAiDecisionCopy(locale, "providerReady")');
    expect(copy).toContain('providerReady: "Configuration ready"');
    expect(copy).toContain('providerReady: "Configuration prête"');
    expect(copy).toContain('providerReady: "الإعداد جاهز"');
    expect(copy).not.toContain('providerReady: "Ready for new analysis"');
  });

  it("localizes order and delivery status evidence through shared product translations", () => {
    const tool = read("src/components/ai/ai-tool-result-card.tsx");
    const proposal = read("src/components/ai/ai-action-proposal-card.tsx");
    const ar = read("src/lib/i18n/locales/ar.json");
    const fr = read("src/lib/i18n/locales/fr.json");

    expect(tool).toContain('const DELIVERY_STATUS_TOOLS = new Set([');
    expect(tool).toContain('"get_delivery_status"');
    expect(tool).toContain('"get_pending_deliveries"');
    expect(tool).toContain('const STATUS_FIELDS = new Set(["status", "fromStatus", "toStatus"])');
    expect(tool).toContain('type StatusNamespace = "orders" | "deliveries";');
    expect(tool).toContain('const key = `${namespace}.status.${suffix}`;');
    expect(tool).toContain('key === "status" ? statusNamespace : "orders"');
    expect(tool).toContain('DELIVERY_STATUS_TOOLS.has(tool.name)');
    expect(tool).toContain("translated === key ? value : translated");
    expect(tool).toContain("locale: rawLocale, t");

    expect(proposal).toContain(
      'ORDER_STATUS_SUMMARY_FIELDS = new Set(["fromStatus", "toStatus"])',
    );
    expect(proposal).toContain("const key = `orders.status.${normalized}`;");
    expect(proposal).toContain("summaryValue(key, value, locale, t)");

    expect(ar).toContain('"orders.status.cancelled": "ملغي"');
    expect(ar).toContain('"deliveries.status.inTransit": "في الطريق"');
    expect(ar).toContain('"deliveries.status.outForDelivery": "خرج للتوصيل"');
    expect(fr).toContain('"orders.status.cancelled": "Annulée"');
    expect(fr).toContain('"deliveries.status.inTransit": "En transit"');
  });

  it("keeps the i18n formatter type-safe and proposal authority tests on live composition files", () => {
    const decisionCopy = read("src/lib/i18n/ai-decision-workspace.ts");
    const authority = read("src/lib/ai/actions/__tests__/source-contract.test.ts");

    expect(decisionCopy).toContain("const template: string");
    expect(decisionCopy).toContain(
      "for (const [name, replacement] of Object.entries(params))",
    );
    expect(authority).toContain("src/components/ai/ai-decision-workspace.tsx");
    expect(authority).toContain("src/components/ai/ai-decision-canvas.tsx");
    expect(authority).not.toContain('"src/components/ai/ai-workspace.tsx"');
  });

  it("keeps Founder RTL evidence on the approved 1366px decision-workspace geometry", () => {
    const founder = read("e2e/founder-visual-acceptance.spec.ts");

    expect(founder).toContain('data-ai-decision-workspace="true"');
    expect(founder).toContain('data-ai-work-history="true"');
    expect(founder).toContain('data-ai-decision-canvas="true"');
    expect(founder).toContain("RTL AI work history");
    expect(founder).toContain("275, 285");
    expect(founder).not.toContain('data-ai-workspace="v2"');
    expect(founder).not.toContain('data-ai-sessions="true"');
    expect(founder).not.toContain('data-ai-thread="true"');
    expect(founder).not.toContain('data-ai-context="true"');
  });
});
