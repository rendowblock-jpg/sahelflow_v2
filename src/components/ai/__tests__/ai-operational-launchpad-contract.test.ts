import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
});
