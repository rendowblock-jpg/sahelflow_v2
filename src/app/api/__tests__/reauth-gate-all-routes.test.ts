/**
 * Founder decision, 3 Nov 2026: "when a user opens our app and enters his PIN to enter the app I want the app to be
 * fully open. I don't want him to enter a PIN again at any place." (AI keys, delivery credentials, backups, export,
 * team settings ...)
 *
 * The server rule lives in ONE place, requireRecentReauthentication() in src/lib/auth/server.ts. This file proves, for
 * EVERY route that calls it, that a seller who signed in 3 hours ago is not sent to a PIN box.
 *
 * The table is generated: it scans src/app/api for every route.ts that calls the function, so a route added later is
 * covered without touching this file. Two layers:
 *   1. Static, for every row: each call is the bare `requireRecentReauthentication()` (default window = the sign-in
 *      lifetime). A call with its own tighter window would silently bring the PIN box back, so it fails here.
 *      Also: no server file other than server.ts can answer 403 REAUTHENTICATION_REQUIRED.
 *   2. Live, for every row: the REAL session rules (real database, real cookie, a session signed in 3 hours ago) run
 *      through the route's own import path and its own earlier steps. The gate is the real function; right after it
 *      passes, a marker error stops the handler so no heavy work (erase, restore, courier calls ...) ever runs.
 *      The answer must never be 403 REAUTHENTICATION_REQUIRED.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: (key: string) => (map.has(key) ? { value: map.get(key) } : undefined),
    set: (key: string, value: string) => {
      map.set(key, value);
    },
    delete: (key: string) => {
      map.delete(key);
    },
  };
});

const gate = vi.hoisted(() => ({
  /** Names of the rows (route + method) whose real gate ran and passed. */
  passed: [] as string[],
  current: "" as string,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
  headers: vi.fn(async () => new Headers()),
}));

const MARKER_STATUS = 418;
const MARKER_CODE = "GATE_PASSED_MARKER";

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    requireRecentReauthentication: async (...args: Parameters<typeof actual.requireRecentReauthentication>) => {
      const { SahelFlowError } = await import("@/types/errors");
      await actual.requireRecentReauthentication(...args);
      gate.passed.push(gate.current);
      // Thrown right after the real gate passed, so the handler's heavy work never starts. A SahelFlowError is
      // answered by withErrorHandler as { code, status } without an "unexpected error" log line.
      throw new SahelFlowError("The reauthentication gate let this request through", MARKER_CODE, MARKER_STATUS);
    },
  };
});

delete process.env.AUTH_SECRET;
delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;

import { dbRaw } from "@/lib/db";
import { createSession, setupAuth } from "@/lib/auth/server";

const API_DIR = path.resolve(__dirname, "..");
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * A bare `{}` body is enough for most handlers. These need a valid body to get as far as the gate.
 * Key: "METHOD route-file". A new route that needs a body fails the live check below until it is listed here.
 */
const BODY_FIXTURES: Record<string, string> = {
  "DELETE shops/[id]/route.ts": JSON.stringify({ confirmationShopId: "test-id" }),
};

/**
 * Handlers whose gate sits behind a condition a bare request cannot meet. They are still covered by the static layer
 * (bare call, default window) and by the shared function's own tests. Anything not listed MUST reach the gate live.
 */
const STATIC_ONLY: Record<string, string> = {
  "POST license/sync/route.ts":
    "the gate runs only when requiresAuthenticatedEntitlementActivation(entitlement) is true, i.e. a signed entitlement that replaces an installed licence",
};

type Row = {
  /** Route file relative to src/app/api, for example backup/restore/route.ts. */
  file: string;
  /** Handlers that contain a call (all exported handlers if a call sits in a shared helper). */
  methods: Method[];
  /** The text between the parentheses of every call. */
  callArguments: string[];
};

function routeFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full));
    else if (name === "route.ts") found.push(full);
  }
  return found;
}

function scan(): Row[] {
  const rows: Row[] = [];
  for (const full of routeFiles(API_DIR).sort()) {
    const source = readFileSync(full, "utf8");
    if (!/import[^;]*\brequireRecentReauthentication\b[^;]*from\s+"@\/lib\/auth\/server"/s.test(source)) continue;
    const starts = [...source.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (match) => ({ method: match[1] as Method, index: match.index ?? 0 }),
    );
    const methods = new Set<Method>();
    const callArguments: string[] = [];
    for (const call of source.matchAll(/\brequireRecentReauthentication\s*\(([^)]*)\)/g)) {
      callArguments.push(call[1].trim());
      const owner = [...starts].reverse().find((start) => start.index < (call.index ?? 0));
      if (owner) methods.add(owner.method);
      else starts.forEach((start) => methods.add(start.method));
    }
    rows.push({
      file: path.relative(API_DIR, full).split(path.sep).join("/"),
      methods: [...methods],
      callArguments,
    });
  }
  return rows;
}

const rows = scan();
const pairs = rows.flatMap((row) => row.methods.map((method) => ({ file: row.file, method })));

describe("every route that calls requireRecentReauthentication (generated table)", () => {
  it("finds the routes (the scan itself works)", () => {
    // 30 route files / 36 handlers on the day of the decision; a floor, not an exact count, so a new route never breaks it.
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(pairs.length).toBeGreaterThanOrEqual(30);
    expect(rows.map((row) => row.file)).toEqual(
      expect.arrayContaining(["backup/restore/route.ts", "secrets/gemini-key/route.ts", "delivery/credentials/route.ts", "privacy/export/route.ts"]),
    );
  });

  it.each(rows.map((row) => [row.file, row] as const))("%s asks with the default window only (no tighter window of its own)", (_file, row) => {
    expect(row.callArguments.length).toBeGreaterThan(0);
    expect(row.callArguments).toEqual(row.callArguments.map(() => ""));
    expect(row.methods.length).toBeGreaterThan(0);
  });

  it("no server file other than src/lib/auth/server.ts can answer 403 REAUTHENTICATION_REQUIRED", () => {
    const offenders: string[] = [];
    const root = path.resolve(API_DIR, "..", "..");
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "__tests__" || name === "node_modules") continue;
          walk(full);
        } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const relative = path.relative(root, full).split(path.sep).join("/");
          if (relative === "lib/auth/server.ts") continue;
          if (/["'`]REAUTHENTICATION_REQUIRED["'`]/.test(readFileSync(full, "utf8"))) offenders.push(relative);
        }
      }
    };
    // Server side only: the client panels in src/components READ the code as a safety net.
    walk(path.join(root, "app", "api"));
    walk(path.join(root, "lib"));
    expect(offenders).toEqual([]);
  });
});

describe("a seller signed in 3 hours ago gets past the gate of every such route (live)", () => {
  const HOUR = 60 * 60 * 1000;

  beforeAll(async () => {
    await dbRaw.$transaction([
      dbRaw.auditLog.deleteMany(),
      dbRaw.session.deleteMany(),
      dbRaw.authSecret.deleteMany(),
      dbRaw.setting.deleteMany(),
    ]);
    await setupAuth("12345678");
    await createSession("10.0.0.1");
    const session = await dbRaw.session.findFirstOrThrow();
    await dbRaw.session.update({
      where: { id: session.id },
      data: { issuedAt: new Date(Date.now() - 3 * HOUR), lastSeenAt: new Date() },
    });
  });

  afterAll(async () => {
    await dbRaw.$transaction([
      dbRaw.auditLog.deleteMany(),
      dbRaw.session.deleteMany(),
      dbRaw.authSecret.deleteMany(),
      dbRaw.setting.deleteMany(),
    ]);
  });

  const outcomes: string[] = [];

  it.each(pairs.map((pair) => [`${pair.method} ${pair.file}`, pair] as const))(
    "%s",
    async (label, pair) => {
      const route = (await import(/* @vite-ignore */ path.join(API_DIR, pair.file))) as Record<
        string,
        ((request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>) | undefined
      >;
      const handler = route[pair.method];
      if (typeof handler !== "function") throw new Error(`${label} does not export ${pair.method}`);

      const url = `http://localhost/api/${pair.file.replace(/\/route\.ts$/, "")}`;
      const request = new NextRequest(url, {
        method: pair.method,
        headers: { "content-type": "application/json" },
        ...(pair.method === "GET" ? {} : { body: BODY_FIXTURES[label] ?? "{}" }),
      });
      const params = new Proxy({}, { get: (_target, key) => (typeof key === "string" ? "test-id" : undefined) });

      gate.current = label;
      let status = 0;
      let code: string | undefined;
      try {
        const response = await handler(request, { params: Promise.resolve(params as Record<string, string>) });
        status = response.status;
        code = ((await response.json().catch(() => ({}))) as { code?: string }).code;
      } catch {
        status = 500;
      }
      const reached = gate.passed.includes(label);
      outcomes.push(`${reached ? "GATE PASSED " : "not reached "} ${label} -> ${status}${code ? ` ${code}` : ""}`);

      expect(code, `${label} must never answer REAUTHENTICATION_REQUIRED to a live session`).not.toBe("REAUTHENTICATION_REQUIRED");
      if (label in STATIC_ONLY) return;
      // The real gate ran, let the 3-hour-old session through, and stopped the handler with the marker.
      expect(
        { status, code, reached },
        `${label} did not reach the gate with a bare request: add a body to BODY_FIXTURES, or (only if the gate sits behind a condition) to STATIC_ONLY`,
      ).toEqual({ status: MARKER_STATUS, code: MARKER_CODE, reached: true });
    },
    30_000,
  );

  it("every handler reached the gate except the listed static-only ones", () => {
    const labels = pairs.map((pair) => `${pair.method} ${pair.file}`);
    const notReached = labels.filter((label) => !gate.passed.includes(label));
    expect(notReached.sort()).toEqual(Object.keys(STATIC_ONLY).sort());
    expect(gate.passed.length).toBeGreaterThanOrEqual(30);
    process.stdout.write(`reauth gate table (3 h old session), ${gate.passed.length} of ${labels.length} handlers reached the gate:\n${outcomes.sort().join("\n")}\n`);
  });
});
