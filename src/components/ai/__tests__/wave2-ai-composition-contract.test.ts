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

    // Founder-installed Internal.37 rejected a second visible title band on
    // Agents. The route still uses the shared workspace grammar so
    // `app-workspace-content` stays on the route root; identity is sr-only
    // because the canvas already names the session.
    expect(page).toContain("PageShell");
    expect(page).toContain('variant="workspace"');
    expect(page).toContain('identity="sr-only"');
    const pageShell = read("src/components/system/page-shell.tsx");
    expect(pageShell).toContain('workspace: "app-workspace-content flex flex-col"');
    expect(pageShell).toContain('<h1 className="sr-only">{title}</h1>');
    expect(shell).toContain("AiDecisionWorkspace");
    expect(shell).toContain('className="h-full min-h-0 overflow-hidden"');
    expect(workspace).toContain('data-ai-decision-workspace="true"');
    expect(workspace).toContain('data-ai-layout={showReviewColumn ? "wide" : "desktop"}');
    // Intent, not a token: the workspace root is a full-height decision surface,
    // never a nested card. Pinned as `rounded-xl border bg-card` before SYS-05
    // retired that utility; restated so no radius token reintroduces the card.
    expect(workspace).not.toMatch(/rounded-[\w-]+ border bg-card/);
  });

  it("keeps the decision canvas dominant and review progressive at 1366", () => {
    const workspace = read("src/components/ai/ai-decision-workspace.tsx");
    const canvas = read("src/components/ai/ai-decision-canvas.tsx");
    // STR-01 moved the conversation log into its own module; these
    // assertions follow the code they protect.
    const log = read("src/components/ai/ai-message-log.tsx");

    expect(workspace).toContain('grid-cols-[16rem_minmax(0,1fr)]');
    expect(workspace).toContain(
      'grid-cols-[16rem_minmax(0,1fr)_20rem]',
    );
    expect(workspace).toContain("showReviewColumn");
    expect(workspace).toContain("aiReviewHasWork");
    expect(workspace).toContain('useMediaQuery("(min-width: 1500px)")');
    expect(canvas).toContain('data-ai-decision-canvas="true"');
    expect(log).toContain('data-ai-inline-proposals="true"');
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
    // STR-01 moved the start surface and then the conversation log into their
    // own modules; these assertions follow the code they protect.
    const log = read("src/components/ai/ai-message-log.tsx");
    const startSurface = read("src/components/ai/ai-start-surface.tsx");
    const shell = read("src/components/ai/ai-workspace-shell.tsx");

    expect(startSurface).toContain('data-ai-start-state="true"');
    expect(log).toContain("messages.length === 0");
    expect(startSurface).toContain("STARTERS.map");
    expect(log).toContain("AiActionProposalCard");
    expect(shell).not.toContain("AiOperationalLaunchpad");
  });
});
