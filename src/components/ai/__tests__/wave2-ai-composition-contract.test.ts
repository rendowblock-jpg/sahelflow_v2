import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Internal.19 AI composition contract", () => {
  it("keeps composition in the shared experience system and leaves AI business authority intact", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const experience = read("src/app/experience-system.css");
    const hook = read("src/hooks/use-ai-workspace.ts");

    expect(page).toContain("AiWorkspaceShell");
    expect(page).toContain('className="app-workspace-content"');
    expect(page).not.toContain("agents-wave2.module.css");
    expect(experience).toContain('[data-ai-workspace="v2"]');
    expect(experience).toContain('grid-template-areas: "sessions thread"');
    expect(experience).toContain('grid-template-areas: "context thread sessions"');
    expect(hook).toContain("approveProposal");
    expect(hook).toContain("stop");
  });

  it("keeps the conversation thread dominant while explicitly mirroring RTL rail order", () => {
    const experience = read("src/app/experience-system.css");

    expect(experience).toContain("grid-template-columns: 14rem minmax(0, 1fr) !important");
    expect(experience).toContain(
      "grid-template-columns: 14rem minmax(30rem, 1fr) 18rem !important",
    );
    expect(experience).toContain('grid-template-areas: "thread sessions"');
    expect(experience).toContain('grid-template-areas: "context thread sessions"');
  });

  it("keeps microcopy readable and scroll behavior governed by shared workspace styling", () => {
    const workspace = read("src/app/workspace-system.css");

    expect(workspace).toContain('[data-ai-workspace="v2"]');
    expect(workspace).toContain('[class~="text-[9px]"]');
    expect(workspace).toContain('[class~="text-[10px]"]');
    expect(workspace).toContain('[class~="text-[11px]"]');
    expect(workspace).toContain("font-size: 0.75rem");
  });
});
