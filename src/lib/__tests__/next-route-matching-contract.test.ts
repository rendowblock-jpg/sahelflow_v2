import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

/**
 * Next.js 16.4 turned strict App Router route matching on by default. The
 * (dashboard) route group has no URL segment, so its `@modal/[...catchAll]`
 * slot (it closes the Settings modal on client navigation) claims EVERY URL.
 * For /login, /setup, /join and the public storefront the `children` slot of
 * that layout has no page, so Next reports "page files do not match any
 * complete route" and answers 404: nobody can sign in or finish setup.
 *
 * The fix is a `default.tsx` for the `children` slot of the (dashboard)
 * layout. It calls `notFound()`, so an unknown URL still renders the app's
 * 404 page inside the dashboard shell, exactly as before, and the more
 * specific pages outside the group (login, setup, join, storefront) win.
 * The deprecated `looseRouteMatching` opt-out is not needed and must not
 * come back.
 */
describe("Next.js route matching contract", () => {
  const catchAll = "src/app/(dashboard)/@modal/[...catchAll]/page.tsx";
  const fallback = "src/app/(dashboard)/default.tsx";

  it("stays on strict route matching (no deprecated opt-out)", () => {
    expect(read("next.config.ts")).not.toContain("looseRouteMatching");
  });

  it("gives the dashboard layout a children fallback that answers not-found", () => {
    // Only needed while the modal catch-all claims every URL.
    if (!existsSync(resolve(root, catchAll))) return;

    expect(existsSync(resolve(root, fallback)), fallback).toBe(true);
    const source = read(fallback);
    expect(source).toMatch(/import\s*\{\s*notFound\s*\}\s*from\s*"next\/navigation"/);
    expect(source).toMatch(/export default function \w+\(\)[^{]*\{\s*notFound\(\);\s*\}/);
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

  it("keeps the modal slot defaults that close and hide the Settings modal", () => {
    expect(existsSync(resolve(root, "src/app/(dashboard)/@modal/default.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "src/app/(dashboard)/@modal/(.)settings/page.tsx"))).toBe(true);
  });
});
