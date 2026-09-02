import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI Class-AAA start-state authority", () => {
  it("keeps focused seller jobs inside the empty decision canvas instead of permanent chrome", () => {
    const shell = read("src/components/ai/ai-workspace-shell.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const copy = read("src/lib/i18n/ai-workspace.ts");

    expect(shell).toContain("AiDecisionWorkspace");
    expect(shell).not.toContain("AiOperationalLaunchpad");
    expect(shell).not.toContain('from "@/components/ai/ai-workspace"');
    expect(shell).not.toContain("<AiWorkspace ");
    expect(canvas).toContain('data-ai-start-state="true"');
    expect(canvas).toContain("messages.length === 0");
    expect(canvas).toContain("STARTERS.map");
    expect(copy).toContain("launchPendingPrompt");
    expect(copy).toContain("launchRevenuePrompt");
    expect(copy).toContain("launchReturnsPrompt");
    expect(copy).toContain("launchProductsPrompt");

    expect(workspace).toContain("queuePromptInNewSession");
    expect(workspace).toContain("pendingPromptRef");
    expect(workspace).toContain("sawConversationLoad");
    expect(workspace).toContain("workspace.send(pending.prompt)");
    expect(workspace).not.toContain("window.location.reload");
    expect(workspace).not.toContain("window.location.assign");
  });

  it("explains AI capabilities on the unconfigured start surface (AI-25)", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    expect(canvas).toContain(
      'getAiDecisionCopy(workspace.locale, "setupRequiredTitle")',
    );
    expect(canvas).toContain(
      'getAiDecisionCopy(workspace.locale, "setupRequiredCapabilities")',
    );
    expect(canvas).toContain(
      'getAiDecisionCopy(workspace.locale, "setupRequiredPrivacyNote")',
    );
    expect(canvas).toContain('"setupChipPendingOrders"');
    expect(canvas).toContain('href="/settings?group=intelligence"');
    // truthful state split: the explainer renders only after setup resolves
    // (the checking banner owns the loading state), starters stay gated
    expect(canvas).toContain("!ready && workspace.setup");
    expect(canvas).toContain("disabled={!ready || starting}");
  });

  it("resolves the adopted setup-explainer copy in every locale", () => {
    for (const locale of ["en", "fr", "ar"] as const) {
      for (const key of [
        "setupRequiredTitle",
        "setupRequiredCapabilities",
        "setupRequiredPrivacyNote",
        "setupChipPendingOrders",
        "setupChipBestProducts",
        "setupChipRevenueToday",
        "setupChipTopWilayas",
      ] as const) {
        const value = getAiDecisionCopy(locale, key);
        expect(value.trim(), `${locale}:${key} must not be empty`).not.toBe("");
      }
    }
    expect(getAiDecisionCopy("en", "setupRequiredTitle")).toBe(
      "What AI adds to this workspace",
    );
    expect(getAiDecisionCopy("fr", "setupRequiredTitle")).toContain("IA");
    expect(getAiDecisionCopy("ar", "setupRequiredTitle")).toMatch(
      /[\u0600-\u06ff]/,
    );
  });

  it("retires the legacy ai.* locale namespace after adoption", () => {
    const locales = [
      "src/lib/i18n/locales/en.json",
      "src/lib/i18n/locales/fr.json",
      "src/lib/i18n/locales/ar.json",
    ];
    for (const path of locales) {
      const translations = JSON.parse(read(path)) as Record<string, string>;
      const legacy = Object.keys(translations).filter((key) =>
        key.startsWith("ai."),
      );
      expect(legacy, `${path} must not keep legacy ai.* keys`).toEqual([]);
    }
  });
});
