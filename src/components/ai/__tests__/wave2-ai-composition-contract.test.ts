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

    // IA-01 converted this pin rather than deleting it. What it protects is
    // that the Agents route renders as a full-height workspace and never a
    // nested mini-app; it protected that by pinning the geometry class on the
    // page itself, which also froze Agents outside the page grammar and left
    // its only <h1> `sr-only`.
    //
    // The route now uses the shared workspace grammar, and the geometry class
    // moved into the primitive that owns it — including staying on the route's
    // ROOT element, which the `#main-content:has(> .app-workspace-content)`
    // rule in experience-system.css depends on. Both halves are asserted, so
    // the guarantee is unchanged and the exemption is gone.
    expect(page).toContain("PageShell");
    expect(page).toContain('variant="workspace"');
    expect(page).not.toContain('<h1 className="sr-only">');
    const pageShell = read("src/components/system/page-shell.tsx");
    expect(pageShell).toContain('workspace: "app-workspace-content flex flex-col"');
    expect(shell).toContain("AiDecisionWorkspace");
    expect(shell).toContain('className="h-full min-h-0 overflow-hidden"');
    expect(workspace).toContain('data-ai-decision-workspace="true"');
    expect(workspace).toContain('data-ai-layout={wideReview ? "wide" : "desktop"}');
    // Intent, not a token: the workspace root is a full-height decision surface,
    // never a nested card. Pinned as `rounded-xl border bg-card` before SYS-05
    // retired that utility; restated so no radius token reintroduces the card.
    expect(workspace).not.toMatch(/rounded-[\w-]+ border bg-card/);
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
