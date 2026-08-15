import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI operational launchpad", () => {
  it("rejects provider-envelope failures and completes successful launches in place", () => {
    const launchpad = read("src/components/ai/ai-operational-launchpad.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");

    expect(launchpad).toContain("type AiMessageResponse");
    expect(launchpad).toContain("messageBody.error");
    expect(launchpad).toContain("messageBody.persisted !== true");
    expect(launchpad).toContain("!messageBody.response");
    expect(launchpad).toContain('return copy("providerDegraded")');
    expect(launchpad).toContain("onSessionCreated?.(sessionId)");
    expect(launchpad).not.toContain('window.location.assign("/agents")');
    expect(launchpad).not.toContain("window.location.reload");

    expect(shell).toContain("onSessionCreated");
    expect(shell).toContain("setWorkspaceVersion");
    expect(shell).toContain("<AiWorkspace key={workspaceVersion}");
  });
});
