import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getAiWorkspaceCopy, type AiWorkspaceLocale } from "@/lib/i18n/ai-workspace";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AI setup panel shows a Groq row", () => {
  it("has a brand-name copy key, identical in ar, fr and en", () => {
    for (const locale of ["ar", "fr", "en"] as AiWorkspaceLocale[]) {
      expect(getAiWorkspaceCopy(locale, "groq")).toBe("Groq");
    }
  });

  it("the panel reads the Groq state from setup.providers and reuses configured / notConfigured", () => {
    const panel = read("src/components/ai/ai-review-evidence.tsx");
    expect(panel).toContain('workspace.copy("groq")');
    expect(panel).toContain("setup.providers");
    const groqPart = panel.slice(panel.indexOf('workspace.copy("groq")'));
    expect(groqPart.slice(0, 700)).toContain('workspace.copy("configured")');
    expect(groqPart.slice(0, 700)).toContain('workspace.copy("notConfigured")');
  });

  it("the setup type carries providers.groq.configured", () => {
    const types = read("src/components/ai/ai-workspace-types.ts");
    expect(types.slice(types.indexOf("interface AiSetupState"), types.indexOf("interface AiSetupState") + 500)).toMatch(
      /providers\??:\s*\{[^}]*groq:\s*\{\s*configured:\s*boolean/,
    );
  });
});
