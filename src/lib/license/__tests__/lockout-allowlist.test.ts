/**
 * IDN-03: a lapsed or missing licence blocks OPERATING the shop but never
 * getting the seller's data out or safe. This table is the contract of the one
 * function that decides which API calls still pass while the licence gate is
 * closed. Anything not listed as allowed here must be refused.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { isLockoutAllowed, LOCKOUT_EXPORT_ENTITIES } from "../lockout-allowlist";

const ALL_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT"] as const;

const ALLOWED: ReadonlyArray<readonly [string, string]> = [
  // Sign in / out and licence activation always work (every method, as before).
  ["POST", "/api/auth/login"],
  ["POST", "/api/auth/logout"],
  ["POST", "/api/auth/reauthenticate"],
  ["POST", "/api/auth/setup"],
  ["GET", "/api/auth/status"],
  ["GET", "/api/health"],
  ["GET", "/api/health/"],
  ["GET", "/api/internal/runtime-ready"],
  ["GET", "/api/license"],
  ["GET", "/api/license/status"],
  ["POST", "/api/license/trial"],
  ["POST", "/api/license/sync"],
  ["POST", "/api/license/request"],
  // Data out: every entity export, read-only.
  ["GET", "/api/export/orders"],
  ["GET", "/api/export/customers"],
  ["GET", "/api/export/products"],
  ["GET", "/api/export/deliveries"],
  ["GET", "/api/export/returns"],
  ["GET", "/api/export/expenses"],
  ["GET", "/api/export/orders/"],
  ["GET", "/api/export/orders?format=xlsx"],
  ["GET", "/api/export/orders?format=csv&x=/api/orders"],
  ["get", "/api/export/orders"],
  ["Get", "/api/export/customers"],
  // Data safe: list backups, make a local backup.
  ["GET", "/api/backup/list"],
  ["GET", "/api/backup/list/"],
  ["GET", "/api/backup/list?x=1"],
  ["POST", "/api/backup/create"],
  ["POST", "/api/backup/create/"],
  ["post", "/api/backup/create"],
  ["POST", "/api/backup/create?x=1"],
];

const REFUSED: ReadonlyArray<readonly [string, string]> = [
  // Operating the shop stays locked.
  ["POST", "/api/orders"],
  ["GET", "/api/orders"],
  ["PUT", "/api/orders/abc"],
  ["PATCH", "/api/customers/abc"],
  ["DELETE", "/api/products/abc"],
  ["POST", "/api/whatsapp/send"],
  ["POST", "/api/ai/chat"],
  ["POST", "/api/automations/run"],
  // Wrong method on an open path.
  ["POST", "/api/export/orders"],
  ["PUT", "/api/export/orders"],
  ["PATCH", "/api/export/customers"],
  ["DELETE", "/api/export/products"],
  ["HEAD", "/api/export/orders"],
  ["OPTIONS", "/api/export/orders"],
  ["TRACE", "/api/export/orders"],
  ["GET", "/api/backup/create"],
  ["HEAD", "/api/backup/create"],
  ["PUT", "/api/backup/create"],
  ["DELETE", "/api/backup/create"],
  ["OPTIONS", "/api/backup/create"],
  ["POST", "/api/backup/list"],
  ["DELETE", "/api/backup/list"],
  ["HEAD", "/api/backup/list"],
  ["OPTIONS", "/api/backup/list"],
  // Method must be exactly a method, not a method with junk around it.
  ["", "/api/export/orders"],
  ["GET ", "/api/export/orders"],
  ["GET\n", "/api/export/orders"],
  ["GETX", "/api/export/orders"],
  ["PO ST", "/api/backup/create"],
  ["PO\u017FT", "/api/backup/create"],
  // The rest of the backup family is NOT data out: restore, delete, kit, files, cloud.
  ["POST", "/api/backup/restore"],
  ["POST", "/api/backup/recovery-kit"],
  ["DELETE", "/api/backup/sahelflow-backup-shop-2026-01-01T00-00-00-000Z.db"],
  ["GET", "/api/backup"],
  ["GET", "/api/backup/"],
  ["POST", "/api/backup"],
  ["GET", "/api/backup/sahelflow-backup-shop-2026-01-01T00-00-00-000Z.db"],
  // Look-alike prefixes and suffixes.
  ["GET", "/api/exports-evil"],
  ["GET", "/api/exports/orders"],
  ["GET", "/api/export-evil/orders"],
  ["GET", "/api/export/orders-evil"],
  ["GET", "/api/export/ordersx"],
  ["GET", "/api/export/orders/evil"],
  ["GET", "/api/export/orders.csv"],
  ["GET", "/api/export"],
  ["GET", "/api/export/"],
  ["GET", "/api/export/unknown"],
  ["GET", "/api/export/import"],
  ["POST", "/api/backup/create-evil"],
  ["POST", "/api/backup/createx"],
  ["POST", "/api/backup/create/evil"],
  ["POST", "/api/backup/created"],
  ["GET", "/api/backup/list-evil"],
  ["GET", "/api/backup/listing"],
  ["GET", "/api/backup/list/evil"],
  ["GET", "/api/licensed"],
  ["GET", "/api/license-evil"],
  ["GET", "/api/healthz"],
  ["GET", "/api/health-evil"],
  ["GET", "/api/internal/runtime-ready-evil"],
  ["POST", "/api/auth/loginx"],
  ["POST", "/api/auth/login/evil"],
  ["POST", "/api/auth/register"],
  ["POST", "/api/auth/login//"],
  // Dot segments and encodings (plain and percent-encoded, any case).
  ["GET", "/api/backup/../orders"],
  ["POST", "/api/backup/create/../../orders"],
  ["GET", "/api/backup/%2e%2e/orders"],
  ["GET", "/api/backup/%2E%2E/orders"],
  ["GET", "/api/backup/.%2e/orders"],
  ["GET", "/api/backup/list/..%2forders"],
  ["GET", "/api/export/./orders"],
  ["GET", "/api/export/orders/."],
  ["GET", "/api/export/orders/.."],
  ["GET", "/api/export/%6frders"],
  ["GET", "/api/export/orders%2f"],
  ["GET", "/api/export/orders%00"],
  ["GET", "/api/export/orders\\"],
  ["GET", "/api/export\\orders"],
  ["GET", "/api/license/../orders"],
  ["POST", "/api/license/%2e%2e/orders"],
  ["GET", "/api/health/../orders"],
  ["GET", "/api/health/%2e%2e/orders"],
  // Slashes.
  ["GET", "/api/export//orders"],
  ["GET", "/api/export/orders//"],
  ["GET", "//api/export/orders"],
  ["GET", "api/export/orders"],
  ["GET", "/x/api/export/orders"],
  ["GET", "/api//export/orders"],
  // Case: paths are case-sensitive.
  ["GET", "/API/export/orders"],
  ["GET", "/api/EXPORT/orders"],
  ["GET", "/api/export/Orders"],
  ["GET", "/api/Export/orders"],
  ["POST", "/api/backup/Create"],
  ["GET", "/api/License/status"],
  ["GET", "/api/HEALTH"],
  // Query strings and fragments never smuggle an allowed path in.
  ["GET", "/api/orders?next=/api/export/orders"],
  ["GET", "/api/orders?/api/export/orders"],
  ["POST", "/api/orders?x=/api/backup/create"],
  ["GET", "/api/orders#/api/export/orders"],
  ["GET", "/api/export/orders%3Fx"],
  ["GET", "/api/export/orders%23x"],
  // Empty and odd input.
  ["GET", ""],
  ["POST", ""],
  ["GET", "/"],
  ["GET", " "],
  ["GET", "?"],
  ["GET", "#"],
  ["GET", "/api"],
  ["GET", "/api/"],
  ["GET", "/api/?"],
  ["GET", "/api/export/orders "],
  ["GET", " /api/export/orders"],
  ["GET", "/api/export/orders\n"],
  ["GET", "/api/export/orders\u0000"],
  ["GET", "http://localhost/api/export/orders"],
];

describe("isLockoutAllowed", () => {
  it.each(ALLOWED)("allows %s %s", (method, path) => {
    expect(isLockoutAllowed(method, path)).toBe(true);
  });

  it.each(REFUSED)("refuses %j %j", (method, path) => {
    expect(isLockoutAllowed(method, path)).toBe(false);
  });

  it("lists every export entity and nothing else", () => {
    expect([...LOCKOUT_EXPORT_ENTITIES].sort()).toEqual(
      ["orders", "customers", "products", "deliveries", "returns", "expenses"].sort(),
    );
  });

  it("opens each export for GET only, whatever the other methods", () => {
    for (const entity of LOCKOUT_EXPORT_ENTITIES) {
      for (const method of ALL_METHODS) {
        expect(isLockoutAllowed(method, `/api/export/${entity}`), `${method} ${entity}`).toBe(
          method === "GET",
        );
      }
    }
  });

  it("opens backup list for GET only and backup create for POST only", () => {
    for (const method of ALL_METHODS) {
      expect(isLockoutAllowed(method, "/api/backup/list"), `list ${method}`).toBe(method === "GET");
      expect(isLockoutAllowed(method, "/api/backup/create"), `create ${method}`).toBe(method === "POST");
    }
  });

  it("never opens restore, recovery kit or delete, with any method", () => {
    for (const method of [...ALL_METHODS, "get", "post", "delete"]) {
      expect(isLockoutAllowed(method, "/api/backup/restore"), method).toBe(false);
      expect(isLockoutAllowed(method, "/api/backup/recovery-kit"), method).toBe(false);
      expect(isLockoutAllowed(method, "/api/backup/some-file.db"), method).toBe(false);
    }
  });
});

/**
 * The whole API surface, read from the route files: exactly this list of
 * method + path pairs may pass while the licence gate is closed. A new route
 * under /api/license, /api/health or /api/export (or a new method on one)
 * fails here until someone decides it on purpose.
 */
const API_ROOT = join(process.cwd(), "src", "app", "api");
const HANDLER = /export\s+(?:const|async\s+function|function)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "__tests__") return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === "route.ts" ? [full] : [];
  });
}

function pathOf(file: string): string {
  const parts = relative(API_ROOT, file).split(/[\\/]/).slice(0, -1);
  return `/api/${parts
    .map((part) => (part.startsWith("[...") ? "a/b" : part.startsWith("[") ? "sample" : part))
    .join("/")}`.replace(/\/$/, "");
}

describe("the API surface that stays open while the licence gate is closed", () => {
  it("is exactly the expected list", () => {
    const open: string[] = [];
    for (const file of routeFiles(API_ROOT)) {
      const source = readFileSync(file, "utf8");
      const path = pathOf(file);
      for (const match of source.matchAll(HANDLER)) {
        const verb = match[1] ?? "";
        if (isLockoutAllowed(verb, path)) open.push(`${verb} ${path}`);
      }
    }
    expect(open.sort()).toEqual(EXPECTED_OPEN.slice().sort());
  });

  it("has an export route file for every export entity, and no other export route", () => {
    const dirs = readdirSync(join(API_ROOT, "export")).filter((name) => name !== "__tests__");
    expect(dirs.sort()).toEqual([...LOCKOUT_EXPORT_ENTITIES].sort());
  });
});

const EXPECTED_OPEN: readonly string[] = [
  "GET /api/auth/status",
  "GET /api/backup/list",
  "GET /api/export/customers",
  "GET /api/export/deliveries",
  "GET /api/export/expenses",
  "GET /api/export/orders",
  "GET /api/export/products",
  "GET /api/export/returns",
  "GET /api/health",
  "GET /api/internal/runtime-ready",
  "GET /api/license/request",
  "GET /api/license/status",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/auth/reauthenticate",
  "POST /api/auth/setup",
  "POST /api/backup/create",
  "POST /api/license/sync",
  "POST /api/license/trial",
];
