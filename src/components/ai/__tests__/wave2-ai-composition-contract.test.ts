import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 AI composition contract", () => {
  it("keeps composition changes route-scoped and leaves the AI authority hook untouched", () => {
    const page = read("src/app/(dashboard)/agents/page.tsx");
    const css = read("src/app/(dashboard)/agents/agents-wave2.module.css");
    const hook = read("src/hooks/use-ai-workspace.ts");

    expect(page).toContain('import styles from "./agents-wave2.module.css"');
    expect(page).toContain("${styles.page}");
    expect(css).toContain('[data-ai-workspace="v2"]');
    expect(hook).toContain("approveProposal");
    expect(hook).toContain("stop");
  });

  it("keeps the conversation thread dominant across desktop breakpoints", () => {
    const css = read("src/app/(dashboard)/agents/agents-wave2.module.css");

    expect(css).toContain("grid-template-columns: clamp(13.5rem, 18vw, 16rem) minmax(0, 1fr)");
    expect(css).toContain("minmax(30rem, 1fr)");
    expect(css).toContain("clamp(18rem, 20vw, 21rem)");
  });

  it("raises legacy 9–11px metadata and stabilizes scroll rails", () => {
    const css = read("src/app/(dashboard)/agents/agents-wave2.module.css");

    expect(css).toContain('[class~="text-[9px]"]');
    expect(css).toContain('[class~="text-[10px]"]');
    expect(css).toContain('[class~="text-[11px]"]');
    expect(css).toContain("font-size: 0.75rem");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("overscroll-behavior: contain");
  });
});
