import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route must be authenticated, or be on this list with a reason.
 *
 * 178 of the 193 route handlers already carry a guard and the other 15 are
 * deliberately pre-auth — but nothing enforced that, so a new route could ship
 * unguarded and no gate would notice. This is the same failure shape as the
 * unreachable-feature class (`route-reachability-contract`): the codebase was
 * in good order, with nothing holding it there.
 *
 * The allowlist is the point. Adding a route here is a deliberate, reviewed act
 * that requires writing down WHY it is safe; forgetting a guard is not.
 */

const root = process.cwd();

/**
 * The guard helpers exported by `src/lib/auth`, `src/lib/identity` and
 * `src/lib/api`. A route calling any one of these has established an actor
 * before it acts.
 */
const AUTH_GUARDS = [
  "requireAuth",
  "requireRouteAuth",
  "requireTrustedAction",
  "requireTrustedActor",
  "requireRecentReauthentication",
  "assertTrustedAction",
  "ensureDurableIdentityActor",
  "assertTeamMemberActive",
] as const;

/**
 * Routes that legitimately run before an actor exists. Each entry records the
 * gate that stands in for authentication, verified 2026-09-12.
 */
const PRE_AUTH_ROUTES = new Map<string, string>([
  // — Authentication ceremony itself: there is no actor yet, by definition.
  ["/api/auth/login", "Establishes the session. IP rate-limited with lockout."],
  ["/api/auth/setup", "First-run owner creation, gated on the runtime secret."],
  [
    "/api/auth/status",
    "Returns only { setup, authenticated } booleans. Fails CLOSED on a DB outage (coded 503) so an outage cannot present as setup:false and push real users into the setup ceremony.",
  ],
  [
    "/api/auth/logout",
    "Destroys the caller's own session cookie. Takes no target and is idempotent, so there is nothing to authorize.",
  ],
  [
    "/api/auth/reauthenticate",
    "Re-proves a PIN for an existing session. Rate-limited; it grants no new authority on its own.",
  ],
  [
    "/api/auth/invitations/accept",
    "Consumed by an invited member who has no session yet. Rate-limited; the invitation token is the credential.",
  ],

  // — Native runtime IPC: loopback-only, constant-time shared secret.
  ["/api/internal/runtime-bootstrap", "Runtime IPC: constant-time secret."],
  [
    "/api/internal/runtime-bootstrap/confirm",
    "Runtime IPC: constant-time secret.",
  ],
  ["/api/internal/runtime-ready", "Runtime IPC: constant-time secret."],
  ["/api/internal/runtime-shutdown", "Runtime IPC: constant-time secret."],
  ["/api/internal/runtime-ui-ready", "Runtime IPC: constant-time secret."],

  // — Public and provider surfaces.
  [
    "/api/storefront/submit",
    "Public storefront checkout. Server-authoritative pricing and rate-limited; a shopper has no account.",
  ],
  [
    "/api/whatsapp/message-status",
    "Provider status callback. Constant-time comparison of the sidecar secret.",
  ],
  [
    "/api/search",
    "Resolves per-permission gating inside universal-search-server.ts rather than at the route boundary.",
  ],
  [
    "/api/health",
    "Liveness probe for the Tauri shell. Returns status, per-check flags and the app version; no seller data.",
  ],
]);

/**
 * Strip comments and import statements before looking for a guard.
 *
 * The first version of this gate matched the guard NAME anywhere in the file,
 * which made it vacuous: deleting `await requireAuth("settings.read")` from a
 * route left `import { requireAuth } from "@/lib/auth/server"` behind, and the
 * check still passed. An import is not a guard, and neither is a commented-out
 * call.
 */
function executableSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
}

/** A guard must be CALLED, not merely imported. */
function hasAuthGuard(source: string): boolean {
  const code = executableSource(source);
  return AUTH_GUARDS.some((guard) => new RegExp(`\\b${guard}\\s*\\(`).test(code));
}

function routeFiles(): string[] {
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(path);
      } else if (entry.name === "route.ts") {
        files.push(path);
      }
    }
  };
  walk(resolve(root, "src/app/api"));
  return files.sort();
}

/** `src/app/api/orders/[id]/route.ts` -> `/api/orders/[id]` */
function routePath(file: string): string {
  return `/${relative(root, file).replaceAll("\\", "/")}`
    .replace("/src/app", "")
    .replace(/\/route\.ts$/, "");
}

describe("API route authentication contract", () => {
  it("guards every route, or records why it is pre-auth", () => {
    const unguarded: string[] = [];
    for (const file of routeFiles()) {
      const source = readFileSync(file, "utf8");
      if (hasAuthGuard(source)) continue;
      const route = routePath(file);
      if (PRE_AUTH_ROUTES.has(route)) continue;
      unguarded.push(route);
    }

    expect(
      unguarded,
      "These API routes call no authentication guard. Add one, or add the " +
        "route to PRE_AUTH_ROUTES with the gate that stands in for " +
        `authentication:\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the pre-auth allowlist honest", () => {
    // An entry left behind after its route is deleted or finally guarded turns
    // the allowlist into a place where a future unguarded route can hide.
    const live = new Set(routeFiles().map(routePath));
    const stale = [...PRE_AUTH_ROUTES.keys()].filter(
      (route) => !live.has(route),
    );
    expect(
      stale,
      `PRE_AUTH_ROUTES lists routes that no longer exist:\n${stale.join("\n")}`,
    ).toEqual([]);

    const nowGuarded = [...PRE_AUTH_ROUTES.keys()].filter((route) => {
      const file = resolve(root, `src/app${route}/route.ts`);
      if (!live.has(route)) return false;
      return hasAuthGuard(readFileSync(file, "utf8"));
    });
    expect(
      nowGuarded,
      "These routes now carry a real guard and should be removed from " +
        `PRE_AUTH_ROUTES so the exemption cannot shelter a future change:\n${nowGuarded.join("\n")}`,
    ).toEqual([]);
  });

  it("requires a reason for every exemption", () => {
    const thin = [...PRE_AUTH_ROUTES.entries()]
      .filter(([, reason]) => reason.trim().length < 30)
      .map(([route]) => route);
    expect(
      thin,
      `Every pre-auth exemption must say what gate replaces authentication:\n${thin.join("\n")}`,
    ).toEqual([]);
  });
});
