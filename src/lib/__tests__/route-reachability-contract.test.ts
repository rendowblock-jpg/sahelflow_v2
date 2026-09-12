import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every dashboard page must be reachable from inside the product.
 *
 * This gate exists because three separate features were found built, guarded,
 * translated and finished — and unreachable:
 *
 * - `CreateShopDialog` was imported by nothing, so a seller could not create a
 *   shop at all (register row FN-01);
 * - five shop-lifecycle store actions had routes, native mutations and signed
 *   entitlement authority behind them and zero UI (FN-03);
 * - `/analytics/extraction` (AI extraction accuracy) and `/onboarding` (the
 *   new-seller setup wizard) were complete pages with no link, redirect or nav
 *   entry anywhere. A seller could only reach their own onboarding by typing
 *   the URL.
 *
 * Shipping a page nobody can navigate to is indistinguishable, from the
 * outside, from not having built it. A path string appearing somewhere in
 * `src/` is a weak signal, deliberately: this is a tripwire against building a
 * whole surface and forgetting to wire it, not a navigation-graph proof.
 */

const root = process.cwd();

/** The sidebar definition — routes listed here are navigable by construction. */
const NAVIGATION_MANIFEST = "src/components/layout/navigation.ts";

/** Pre-auth and shell routes that are entry points rather than destinations. */
const ENTRY_POINT_ROUTES = new Set([
  "/", // the shell redirects into the workspace
  "/login",
  "/setup",
  "/join", // invitation links arrive from outside the app
]);

/** Routes reached by a public URL rather than in-product navigation. */
const PUBLIC_ROUTES = [/^\/storefront\//];

function dashboardRoutes(): string[] {
  const routes: string[] = [];
  const walk = (directory: string, base: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (!entry.isDirectory()) {
        if (entry.name === "page.tsx") routes.push(base === "" ? "/" : base);
        continue;
      }
      if (entry.name === "api") continue;
      // Route groups like (dashboard) do not contribute a path segment.
      if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
        walk(path, base);
      } else {
        walk(path, `${base}/${entry.name}`);
      }
    }
  };
  walk(resolve(root, "src/app"), "");
  return routes.sort();
}

function productSources(): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        files.push(path);
      }
    }
  };
  walk(resolve(root, "src"));
  return files;
}

describe("dashboard route reachability", () => {
  it("leaves no page reachable only by typing its URL", () => {
    const routes = dashboardRoutes().filter(
      (route) =>
        !ENTRY_POINT_ROUTES.has(route) &&
        !PUBLIC_ROUTES.some((pattern) => pattern.test(route)) &&
        // Dynamic segments are reached from their own list surfaces.
        !route.includes("["),
    );

    const sources = productSources().map((path) => ({
      rel: relative(root, path).replaceAll("\\", "/"),
      text: readFileSync(path, "utf8"),
    }));

    const unreachable: string[] = [];
    for (const route of routes) {
      // Match an actual navigation FORM, not any mention of the path. Prose
      // counts for nothing here: the first draft of this gate passed while the
      // only remaining occurrence of `/onboarding` was the comment explaining
      // why it had been linked, which made the check vacuous.
      const quoted = route.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
      const navigates = new RegExp(
        `(?:href=|(?:push|replace|redirect|assign)\\(\\s*)["'\`]${quoted}["'\`]`,
      );
      // The sidebar manifest IS a set of destinations: it stores routes as
      // plain data rather than as JSX `href=`, so a quoted route literal there
      // counts on its own.
      const manifest = new RegExp(`["'\`]${quoted}["'\`]`);
      const referenced = sources.some((source) =>
        source.rel === NAVIGATION_MANIFEST
          ? manifest.test(source.text)
          : // A page navigating to itself does not make it reachable.
            !source.rel.startsWith(`src/app${route}/`) &&
            navigates.test(source.text),
      );
      if (!referenced) unreachable.push(route);
    }

    expect(
      unreachable,
      "These pages exist but nothing in the product links, pushes or redirects " +
        "to them. Link each from its natural parent, or add it to " +
        `ENTRY_POINT_ROUTES with a reason:\n${unreachable.join("\n")}`,
    ).toEqual([]);
  });
});
