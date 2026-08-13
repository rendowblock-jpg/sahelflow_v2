import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Phase 6/7 streamed route readiness contract", () => {
  it("waits for the real semantic work surface after global hydration", () => {
    const evidence = read("e2e/phase6-7-completion.spec.ts");

    const hydration = evidence.indexOf(
      "page.locator('html[data-sf-hydrated=\"true\"]')",
    );
    const workSurface = evidence.indexOf("async function waitForWorkSurface");
    const headingLocator = evidence.indexOf(
      '#main-content h1, #main-content [role="heading"][aria-level="1"]',
    );

    expect(hydration).toBeGreaterThanOrEqual(0);
    expect(workSurface).toBeGreaterThan(hydration);
    expect(headingLocator).toBeGreaterThan(workSurface);
    expect(evidence).toContain("should finish loading its work-surface heading");
    expect(evidence).toContain("await waitForWorkSurface(page, route);");
    expect(evidence).not.toContain('main[aria-busy="true"][aria-label]');
  });

  it("isolates Playwright login windows per test without weakening production auth", () => {
    const evidence = read("e2e/phase6-7-completion.spec.ts");
    const rateLimit = read("src/lib/auth/rate-limit.ts");

    expect(evidence).toContain("function phase67ClientIp(): string");
    expect(evidence).toContain("198.18.");
    expect(evidence).toContain('"x-forwarded-for": phase67ClientIp()');
    expect(evidence).toContain("without weakening the production");
    expect(rateLimit).toContain("const WINDOW_MAX = 5");
    expect(rateLimit).not.toContain("PHASE67");
    expect(rateLimit).not.toContain("PLAYWRIGHT");
  });
});
