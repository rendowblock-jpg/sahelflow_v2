import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { PUBLIC_API_ROUTES } from "@/lib/auth/config";

/**
 * Route guard matrix (PB-AUTHZ-MATRIX).
 *
 * Every exported HTTP handler in every src/app/api route.ts file must either call a
 * known caller guard (directly, through a helper in the same file, or through
 * a helper it imports) or sit on the reviewed ALLOWLIST below with its door and
 * a reason. A new route without a guard fails here instead of shipping open.
 *
 * What this proves: a guard call is reachable in the handler's code. It does
 * not prove the guard runs on every branch; the per-route authority tests do
 * that. src/proxy.ts is the outer door (loopback, launch cookie, signed
 * session); the guards below are the inner door (live session, role, action).
 */

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const API_ROOT = resolve(root, "src/app/api");

const HTTP_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

/** Guards that prove WHO is calling from the live session or actor. */
const SESSION_GUARDS = new Set([
  "requireAuth",
  "requireRouteAuth",
  "requireTrustedAction",
  "requireTrustedActor",
  "requireRecentReauthentication",
  "requireReauthenticationEligibility",
]);

/** Guards that prove the caller by a shared secret or token, not a session. */
const TOKEN_GUARDS = new Set([
  "authorizeMcpTransport",
  "authenticateWhatsAppSidecar",
  "verifyCronSecret",
]);

const ALL_GUARDS = new Set([...SESSION_GUARDS, ...TOKEN_GUARDS]);

/** How far a handler may delegate through imported helpers. */
const MAX_IMPORT_DEPTH = 2;

type Door =
  /** Listed in PUBLIC_API_ROUTES: the proxy lets it through without a session. */
  | "public"
  /** Per-launch runtime token (internal/*), checked in the handler. */
  | "runtime-token"
  /** Only the proxy's signed-session check protects it (no inner guard). */
  | "proxy-session";

type AllowEntry = Readonly<{ door: Door; why: string }>;

/**
 * The reviewed exception list. Key: `<route path under src/app/api>#<METHOD>`.
 * Add an entry only after reading the handler and writing the reason.
 */
const ALLOWLIST: Readonly<Record<string, AllowEntry>> = {
  "auth/invitations/accept/route.ts#POST": { door: "public", why: "single-use invitation token is the credential; fixed rate-limit bucket" },
  "auth/login/route.ts#POST": { door: "public", why: "PIN sign-in; rate-limited, issues the session only after the PIN verifies" },
  "auth/logout/route.ts#POST": { door: "public", why: "destroys only the calling session cookie; nothing to read or change" },
  "auth/setup/route.ts#POST": { door: "public", why: "first-run setup; answers already-set-up once an auth secret exists" },
  "auth/status/route.ts#GET": { door: "public", why: "returns only the setup/authenticated booleans the login page needs" },
  "health/route.ts#GET": { door: "public", why: "liveness probe: app and db status, version and time only" },
  "reports/daily/route.ts#GET": { door: "public", why: "static 405 'use POST'; the POST handler holds the cron-secret and session checks" },
  "storefront/cart-capture/route.ts#POST": { door: "public", why: "buyer abandoned-cart capture (FD-061 EX-4); IP rate-limited, always 204" },
  "storefront/gates/public/route.ts#GET": { door: "public", why: "buyer-facing checkout gates for one storefront slug (FD-061 EX-4)" },
  "storefront/offers/evaluate/route.ts#POST": { door: "public", why: "read-only reward preview scoped to the slug's active offers (FD-061 EX-4)" },
  "storefront/otp/send/route.ts#POST": { door: "public", why: "shopper has no account; IP rate-limited one-time code send" },
  "storefront/otp/verify/route.ts#POST": { door: "public", why: "the one-time code is the credential; IP rate-limited" },
  "storefront/reviews/route.ts#POST": { door: "public", why: "order-verified review (order number + phone), rate-limited, one generic failure answer" },
  "storefront/submit/route.ts#POST": { door: "public", why: "shopper checkout submission; rate-limited, unknown or draft slug is refused" },
  "internal/launch-appearance/route.ts#POST": { door: "runtime-token", why: "launch cookie compared in constant time with SF_RUNTIME_APP_TOKEN" },
  "internal/runtime-bootstrap/route.ts#GET": { door: "runtime-token", why: "bootstrap token compared in constant time with SF_RUNTIME_APP_TOKEN" },
  "internal/runtime-bootstrap/confirm/route.ts#GET": { door: "runtime-token", why: "launch cookie compared in constant time with SF_RUNTIME_APP_TOKEN" },
  "internal/runtime-ready/route.ts#GET": { door: "runtime-token", why: "supplied token compared in constant time with SF_RUNTIME_TOKEN" },
  "internal/runtime-shutdown/route.ts#POST": { door: "runtime-token", why: "runtime token and instance id compared in constant time" },
  "internal/runtime-ui-ready/route.ts#POST": { door: "runtime-token", why: "launch cookie compared in constant time with SF_RUNTIME_APP_TOKEN" },
};

/**
 * Handlers whose guard sits behind a branch on purpose. Same rule as the
 * allowlist: read the handler first, then write the reason.
 */
const CONDITIONAL_GUARDS: Readonly<Record<string, string>> = {
  "license/sync/route.ts#POST":
    "first activation (no licence yet) and Founder-offline transfer/recovery entitlements are accepted on their signature; any other activation needs license.manage and a recent PIN proof",
};

type KnownGap = Readonly<{ where: string; exposes: string; whyNotFixed: string }>;

/**
 * Handlers that are neither guarded nor acceptable, found by this matrix and
 * not fixed here because the fix is bigger than one guard line.
 */
const KNOWN_GAPS: Readonly<Record<string, KnownGap>> = {};

// ---------------------------------------------------------------------------
// Scanner (plain TypeScript AST, no new dependency)
// ---------------------------------------------------------------------------

type Files = Readonly<{
  read(path: string): string | null;
  exists(path: string): boolean;
}>;

type Model = Readonly<{
  path: string;
  decls: Map<string, ts.Node>;
  imports: Map<string, { from: string; name: string }>;
  handlers: Map<string, ts.Node | { reexport: { from: string; name: string } }>;
}>;

const realFiles: Files = {
  read: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  exists: (path) => existsSync(path) && statSync(path).isFile(),
};

function loadAliases(): Array<{ prefix: string; exact: boolean; target: string }> {
  const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
  const paths = (config.config?.compilerOptions?.paths ?? {}) as Record<string, string[]>;
  return Object.entries(paths)
    .map(([key, [target = ""]]) => ({
      prefix: key.endsWith("*") ? key.slice(0, -1) : key,
      exact: !key.endsWith("*"),
      target: resolve(root, target.endsWith("*") ? target.slice(0, -1) : target),
    }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.prefix.length - a.prefix.length);
}

const ALIASES = loadAliases();

function withExtension(base: string, files: Files): string | null {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    if (files.exists(candidate)) return candidate;
  }
  return null;
}

function resolveModule(from: string, spec: string, files: Files): string | null {
  if (spec.startsWith(".")) return withExtension(resolve(dirname(from), spec), files);
  for (const alias of ALIASES) {
    if (alias.exact ? spec === alias.prefix : spec.startsWith(alias.prefix)) {
      const rest = alias.exact ? "" : spec.slice(alias.prefix.length);
      return withExtension(alias.exact ? alias.target : join(alias.target, rest), files);
    }
  }
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function buildModel(path: string, files: Files): Model | null {
  const text = files.read(path);
  if (text === null) return null;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const decls = new Map<string, ts.Node>();
  const imports = new Map<string, { from: string; name: string }>();
  const handlers: Model["handlers"] = new Map();
  const exportAliases: Array<{ exported: string; local: string }> = [];

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      decls.set(stmt.name.text, stmt);
      if (hasExportModifier(stmt) && HTTP_METHODS.has(stmt.name.text)) {
        handlers.set(stmt.name.text, stmt);
      }
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        decls.set(d.name.text, d.initializer);
        if (hasExportModifier(stmt) && HTTP_METHODS.has(d.name.text)) {
          handlers.set(d.name.text, d.initializer);
        }
      }
    } else if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const bindings = stmt.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          imports.set(el.name.text, {
            from: stmt.moduleSpecifier.text,
            name: (el.propertyName ?? el.name).text,
          });
        }
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const el of stmt.exportClause.elements) {
        if (!HTTP_METHODS.has(el.name.text)) continue;
        const local = (el.propertyName ?? el.name).text;
        if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
          handlers.set(el.name.text, {
            reexport: { from: stmt.moduleSpecifier.text, name: local },
          });
        } else {
          exportAliases.push({ exported: el.name.text, local });
        }
      }
    }
  }
  for (const { exported, local } of exportAliases) {
    const node = decls.get(local);
    if (node) handlers.set(exported, node);
  }
  return { path, decls, imports, handlers };
}

type Call = Readonly<{ name: string; conditional: boolean }>;

/**
 * Calls in a node, and names passed straight in as arguments. A call is
 * conditional when an if / ternary / && / || / ?? / switch / loop / catch
 * stands between it and the function boundary: the guard might not run.
 */
function collectCalls(node: ts.Node): { called: Call[]; passed: Call[] } {
  const called: Call[] = [];
  const passed: Call[] = [];
  const visit = (n: ts.Node, conditional: boolean): void => {
    const each = (child: ts.Node | undefined, cond: boolean) => {
      if (child) visit(child, cond);
    };
    if (ts.isIfStatement(n)) {
      each(n.expression, conditional);
      each(n.thenStatement, true);
      each(n.elseStatement, true);
      return;
    }
    if (ts.isConditionalExpression(n)) {
      each(n.condition, conditional);
      each(n.whenTrue, true);
      each(n.whenFalse, true);
      return;
    }
    if (
      ts.isBinaryExpression(n) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(n.operatorToken.kind)
    ) {
      each(n.left, conditional);
      each(n.right, true);
      return;
    }
    if (ts.isCaseClause(n) || ts.isDefaultClause(n) || ts.isCatchClause(n)) {
      ts.forEachChild(n, (c) => visit(c, true));
      return;
    }
    if (
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n)
    ) {
      ts.forEachChild(n, (c) => visit(c, true));
      return;
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee)) called.push({ name: callee.text, conditional });
      else if (ts.isPropertyAccessExpression(callee)) {
        called.push({ name: callee.name.text, conditional });
      }
      for (const arg of n.arguments) {
        if (ts.isIdentifier(arg)) passed.push({ name: arg.text, conditional });
      }
    }
    ts.forEachChild(n, (c) => visit(c, conditional));
  };
  visit(node, false);
  // A handler that is only an alias (`export const GET = handle`).
  if (ts.isIdentifier(node)) passed.push({ name: node.text, conditional: false });
  return { called, passed };
}

type GuardResult = Readonly<{
  kind: "session" | "token";
  via: "direct" | "delegated";
  guard: string;
  /** True when every guard call sits behind a branch. */
  conditional: boolean;
}>;

function findGuard(
  model: Model,
  node: ts.Node,
  files: Files,
  cache: Map<string, Model | null>,
  seen: Set<string>,
  depth: number,
  delegated: boolean,
  inherited = false,
): GuardResult | null {
  const { called, passed } = collectCalls(node);
  let best: GuardResult | null = null;
  const consider = (hit: GuardResult | null): GuardResult | null => {
    if (hit && (!best || (best.conditional && !hit.conditional))) best = hit;
    return best && !best.conditional ? best : null;
  };
  for (const call of called) {
    if (!ALL_GUARDS.has(call.name)) continue;
    const done = consider({
      kind: SESSION_GUARDS.has(call.name) ? "session" : "token",
      via: delegated ? "delegated" : "direct",
      guard: call.name,
      conditional: inherited || call.conditional,
    });
    if (done) return done;
  }
  for (const call of [...called, ...passed]) {
    const cond = inherited || call.conditional;
    const key = `${model.path}::${call.name}::${cond}`;
    if (seen.has(key)) continue;
    const local = model.decls.get(call.name);
    if (local && local !== node) {
      seen.add(key);
      const done = consider(
        findGuard(model, local, files, cache, seen, depth, delegated, cond),
      );
      if (done) return done;
      continue;
    }
    const imp = model.imports.get(call.name);
    if (!imp || depth >= MAX_IMPORT_DEPTH) continue;
    const target = resolveModule(model.path, imp.from, files);
    if (!target) continue;
    seen.add(key);
    if (!cache.has(target)) cache.set(target, buildModel(target, files));
    const next = cache.get(target);
    const decl = next?.decls.get(imp.name);
    if (!next || !decl) continue;
    const done = consider(
      findGuard(next, decl, files, cache, seen, depth + 1, true, cond),
    );
    if (done) return done;
  }
  return best;
}

type HandlerReport = Readonly<{ key: string; guard: GuardResult | null }>;

function scanRoute(path: string, key: string, files: Files, cache: Map<string, Model | null>): HandlerReport[] {
  const model = buildModel(path, files);
  if (!model) return [];
  const reports: HandlerReport[] = [];
  for (const [method, handler] of model.handlers) {
    let guard: GuardResult | null;
    if ("reexport" in handler) {
      const target = resolveModule(path, handler.reexport.from, files);
      const next = target ? buildModel(target, files) : null;
      const decl = next?.decls.get(handler.reexport.name);
      guard = next && decl ? findGuard(next, decl, files, cache, new Set(), 1, true) : null;
    } else {
      guard = findGuard(model, handler, files, cache, new Set(), 0, false);
    }
    reports.push({ key: `${key}#${method}`, guard });
  }
  return reports;
}

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function scanAll(): HandlerReport[] {
  const cache = new Map<string, Model | null>();
  return listRouteFiles(API_ROOT).flatMap((file) =>
    scanRoute(file, relative(API_ROOT, file).split(sep).join("/"), realFiles, cache),
  );
}

/** "auth/login/route.ts#POST" -> "/api/auth/login" (dynamic segments kept). */
function apiPath(key: string): string {
  return "/api/" + key.split("#")[0]!.replace(/\/?route\.ts$/, "");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("route guard matrix: scanner behaviour", () => {
  const virtual = (sources: Record<string, string>): Files => ({
    read: (p) => sources[p] ?? null,
    exists: (p) => p in sources,
  });
  const scan = (sources: Record<string, string>) => {
    const route = "/v/api/x/route.ts";
    return scanRoute(route, "x/route.ts", virtual(sources), new Map()).map((r) => [
      r.key,
      r.guard?.guard ?? null,
      r.guard?.via ?? null,
    ]);
  };
  const conditionalOf = (source: string) =>
    scanRoute("/v/api/x/route.ts", "x/route.ts", virtual({ "/v/api/x/route.ts": source }), new Map()).map(
      (r) => r.guard?.conditional ?? null,
    );

  it("finds a direct guard and an unguarded handler side by side", () => {
    expect(
      scan({
        "/v/api/x/route.ts": `
          export async function GET() { await requireAuth(); return 1; }
          export async function POST() { return 2; }
        `,
      }),
    ).toEqual([
      ["x/route.ts#GET", "requireAuth", "direct"],
      ["x/route.ts#POST", null, null],
    ]);
  });

  it("follows a same-file helper, a wrapper argument and an alias export", () => {
    expect(
      scan({
        "/v/api/x/route.ts": `
          async function gate() { return requireTrustedAction("orders.read"); }
          async function inner() { await gate(); }
          export const GET = wrap(async () => { await gate(); });
          export const PUT = wrap(inner);
          async function patchHandler() { await requireAuth(); }
          export { patchHandler as PATCH };
        `,
      }),
    ).toEqual([
      ["x/route.ts#GET", "requireTrustedAction", "direct"],
      ["x/route.ts#PUT", "requireTrustedAction", "direct"],
      ["x/route.ts#PATCH", "requireAuth", "direct"],
    ]);
  });

  it("ignores guard names in comments, strings and unused declarations", () => {
    expect(
      scan({
        "/v/api/x/route.ts": `
          // await requireAuth();
          const note = "requireAuth()";
          async function neverCalled() { await requireAuth(); }
          export async function DELETE() { return note; }
        `,
      }),
    ).toEqual([["x/route.ts#DELETE", null, null]]);
  });

  it("follows an imported helper but only two levels deep", () => {
    const sources = {
      "/v/api/x/route.ts": `
        import { one } from "./a";
        export async function GET() { await one(); }
      `,
      "/v/api/x/a.ts": `import { two } from "./b"; export async function one() { await two(); }`,
      "/v/api/x/b.ts": `import { three } from "./c"; export async function two() { await three(); }`,
      "/v/api/x/c.ts": `export async function three() { await requireAuth(); }`,
    };
    expect(scan(sources)).toEqual([["x/route.ts#GET", null, null]]);
    expect(
      scan({
        ...sources,
        "/v/api/x/b.ts": `export async function two() { await requireAuth(); }`,
      }),
    ).toEqual([["x/route.ts#GET", "requireAuth", "delegated"]]);
  });

  it("marks a guard that sits behind a branch as conditional", () => {
    expect(
      conditionalOf(`
        export async function GET(r) { if (r.x) { await requireAuth(); } return 1; }
        export async function POST(r) { r.x && (await requireAuth()); }
        export async function PUT(r) { await requireAuth(); if (r.x) { return 1; } }
        export async function PATCH(r) { try { await requireAuth(); } catch { return 1; } }
        export async function DELETE(r) { if (r.x) { await gate(); } return 1; }
        async function gate() { await requireAuth(); }
        export async function HEAD(r) { if (r.x) { await requireAuth(); } await requireTrustedAction("a"); }
      `),
    ).toEqual([true, true, false, false, true, false]);
  });

  it("follows a re-exported handler", () => {
    expect(
      scan({
        "/v/api/x/route.ts": `export { GET } from "./impl";`,
        "/v/api/x/impl.ts": `export async function GET() { await requireAuth(); }`,
      }),
    ).toEqual([["x/route.ts#GET", "requireAuth", "delegated"]]);
  });
});

describe("route guard matrix: src/app/api", () => {
  const reports = scanAll();
  const routeFiles = listRouteFiles(API_ROOT);
  const byKey = new Map(reports.map((r) => [r.key, r]));

  it("scans every route file and finds its handlers", () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(232);
    const filesWithHandlers = new Set(reports.map((r) => r.key.split("#")[0]));
    const withoutHandlers = routeFiles
      .map((f) => relative(API_ROOT, f).split(sep).join("/"))
      .filter((f) => !filesWithHandlers.has(f));
    expect(withoutHandlers, "route.ts files with no exported HTTP handler").toEqual([]);
  });

  it("guards every handler or lists it on the reviewed allowlist", () => {
    const open = reports
      .filter((r) => !r.guard && !(r.key in ALLOWLIST) && !(r.key in KNOWN_GAPS))
      .map((r) => r.key);
    expect(
      open.length,
      `${open.length} handlers have no guard and no reviewed reason:\n${open.join("\n")}`,
    ).toBe(0);
  });

  it("keeps the allowlist free of stale or needless entries", () => {
    const stale = Object.keys(ALLOWLIST).filter((k) => !byKey.has(k));
    expect(stale, "allowlist entries whose handler no longer exists").toEqual([]);
    const needless = Object.keys(ALLOWLIST).filter((k) => byKey.get(k)?.guard);
    expect(needless, "allowlist entries whose handler now calls a guard").toEqual([]);
    const noReason = Object.entries(ALLOWLIST)
      .filter(([, v]) => v.why.trim().length < 12)
      .map(([k]) => k);
    expect(noReason, "allowlist entries without a reason").toEqual([]);
  });

  it("lists every handler whose only guard sits behind a branch", () => {
    const open = reports
      .filter((r) => r.guard?.conditional && !(r.key in CONDITIONAL_GUARDS))
      .map((r) => `${r.key} (${r.guard?.guard})`);
    expect(
      open.length,
      `${open.length} handlers guard only on some branch and are not reviewed:\n${open.join("\n")}`,
    ).toBe(0);
    const stale = Object.keys(CONDITIONAL_GUARDS).filter((k) => !byKey.get(k)?.guard?.conditional);
    expect(stale, "reviewed conditional guards that are gone or now unconditional").toEqual([]);
  });

  it("keeps the known-gap list honest", () => {
    const stale = Object.keys(KNOWN_GAPS).filter((k) => !byKey.has(k));
    expect(stale, "known gaps whose handler no longer exists").toEqual([]);
    const fixed = Object.keys(KNOWN_GAPS).filter((k) => byKey.get(k)?.guard);
    expect(fixed, "known gaps that now call a guard: remove them").toEqual([]);
    const both = Object.keys(KNOWN_GAPS).filter((k) => k in ALLOWLIST);
    expect(both, "a handler cannot be a gap and allowlisted").toEqual([]);
  });

  it("ties every 'public' allowlist door to the proxy's public API list", () => {
    const publicPaths = new Set(PUBLIC_API_ROUTES);
    const wrong = Object.entries(ALLOWLIST)
      .filter(([k, v]) => (v.door === "public") !== publicPaths.has(apiPath(k)))
      .map(([k, v]) => `${k} (door ${v.door}, proxy public: ${publicPaths.has(apiPath(k))})`);
    expect(wrong).toEqual([]);
  });

  it("matches every proxy-public route to a real route file", () => {
    const known = new Set(reports.map((r) => apiPath(r.key)));
    const missing = PUBLIC_API_ROUTES.filter((p) => !known.has(p));
    expect(missing, "PUBLIC_API_ROUTES entries without a route.ts").toEqual([]);
  });

  it("accounts for every handler exactly once", () => {
    const guarded = reports.filter((r) => r.guard).length;
    const allowlisted = reports.filter((r) => !r.guard && r.key in ALLOWLIST).length;
    const gaps = reports.filter((r) => !r.guard && r.key in KNOWN_GAPS).length;
    expect(guarded + allowlisted + gaps).toBe(reports.length);
    expect(allowlisted).toBe(Object.keys(ALLOWLIST).length);
  });
});
