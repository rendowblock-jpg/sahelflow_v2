import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Class-AAA AI composition contract", () => {
  it("replaces the rejected nested mini-app with full-height decision roots", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");

    expect(page).toContain('className="app-workspace-content"');
    expect(shell).toContain("AiDecisionWorkspace");
    expect(shell).toContain('className="h-full min-h-0 overflow-hidden"');
    expect(workspace).toContain('data-ai-decision-workspace="true"');
    expect(workspace).toContain('data-ai-layout={wideReview ? "wide" : "desktop"}');
    expect(workspace).not.toContain('rounded-xl border bg-card');
  });

  it("keeps the decision canvas dominant and review progressive at 1366", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");

    expect(workspace).toContain('grid-cols-[17.5rem_minmax(0,1fr)]');
    expect(workspace).toContain(
      'grid-cols-[17.5rem_minmax(0,1fr)_20rem]',
    );
    expect(workspace).toContain('useMediaQuery("(min-width: 1500px)")');
    expect(canvas).toContain('data-ai-decision-canvas="true"');
    expect(canvas).toContain('data-ai-inline-proposals="true"');
    expect(canvas).toContain('<SheetContent side="end"');
  });

  it("uses logical RTL geometry instead of locale-coded physical sides", () => {
    const history = read("src/components/ai/ai-work-history.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");

    expect(history).toContain("border-e");
    expect(workspace).toContain("border-s");
    expect(canvas).toContain('side="end"');
    expect(canvas).not.toContain('side={workspace.locale');
    expect(canvas).not.toContain('? "left" : "right"');
  });

  it("keeps starter jobs contextual and proposals first-class", () => {
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");

    expect(canvas).toContain('data-ai-start-state="true"');
    expect(canvas).toContain("messages.length === 0");
    expect(canvas).toContain("STARTERS.map");
    expect(canvas).toContain("AiActionProposalCard");
    expect(shell).not.toContain("AiOperationalLaunchpad");
  });
});
