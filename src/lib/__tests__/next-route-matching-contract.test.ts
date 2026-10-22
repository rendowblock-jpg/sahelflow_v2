import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

/**
 * Next.js 16.4 turned strict App Router route matching on by default. With it
 * on, the `@modal/[...catchAll]` slot of the (dashboard) layout claims every
 * URL, the `children` slot has no page for /login, /setup, /join and the
 * public storefront, so Next reports "page files do not match any complete
 * route" and answers 404 for them: nobody can sign in or finish setup.
 * (Found on the 16.4.2 security bump: dev server, GET /setup, /login, /join,
 * /storefront/<slug> returned 404 strict and 200 loose.)
 *
 * Until the modal slot is restructured, the legacy loose matching must stay
 * on. When the catch-all slot page is removed, this contract lets the flag go.
 */
describe("Next.js route matching contract", () => {
  const catchAll = "src/app/(dashboard)/@modal/[...catchAll]/page.tsx";

  it("keeps loose route matching while the dashboard modal catch-all exists", () => {
    const config = read("next.config.ts");

    if (existsSync(resolve(root, catchAll))) {
      expect(config).toMatch(/deprecated:\s*\{\s*looseRouteMatching:\s*true\s*\}/);
    } else {
      expect(config).not.toContain("looseRouteMatching");
    }
  });

  it("still serves the pages outside the dashboard layout", () => {
    for (const page of [
      "src/app/login/page.tsx",
      "src/app/setup/page.tsx",
      "src/app/join/page.tsx",
      "src/app/storefront/[slug]/page.tsx",
    ]) {
      expect(existsSync(resolve(root, page)), page).toBe(true);
    }
  });
});
