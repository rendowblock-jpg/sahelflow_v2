import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 6/7 streamed route readiness contract", () => {
  it("waits for the dashboard loading shell to detach after global hydration", () => {
    const evidence = read("e2e/phase6-7-completion.spec.ts");

    const hydration = evidence.indexOf(
      "page.locator('html[data-sf-hydrated=\"true\"]')",
    );
    const streamedRoute = evidence.indexOf(
      "page.locator('main[aria-busy=\"true\"][aria-label]')",
    );

    expect(hydration).toBeGreaterThanOrEqual(0);
    expect(streamedRoute).toBeGreaterThan(hydration);
    expect(evidence).toContain('state: "detached"');
    expect(evidence).toContain(
      "Semantic, reflow and accessibility evidence must",
    );
  });
});
