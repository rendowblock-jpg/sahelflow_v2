/**
 * Which API calls still pass while the licence gate is closed (IDN-03).
 *
 * A lapsed or missing licence blocks OPERATING the shop (orders, WhatsApp,
 * automations, AI) but never getting the seller's data out or safe: the entity
 * exports, the backup list and a LOCAL backup stay open. Restore, delete, the
 * recovery kit, cloud upload and every other write stay closed.
 *
 * Pure on purpose: the gate in `withErrorHandler` and the lockout screen read
 * this one file, and the table test pins every path and method.
 */

/** Entities the seller can download while locked out. One folder each under src/app/api/export. */
export const LOCKOUT_EXPORT_ENTITIES = [
  "orders",
  "customers",
  "products",
  "deliveries",
  "returns",
  "expenses",
] as const;

export type LockoutExportEntity = (typeof LOCKOUT_EXPORT_ENTITIES)[number];

const ANY_METHOD = "*";

type LockoutRule = Readonly<{
  methods: typeof ANY_METHOD | readonly string[];
  path: RegExp;
}>;

const SEGMENT = "[A-Za-z0-9_~.-]+";

// Sign in/out, health and licence activation keep every method: they must work
// while the licence is bad (activation itself is a POST).
const LOCKOUT_RULES: readonly LockoutRule[] = [
  { methods: ANY_METHOD, path: /^\/api\/auth\/(?:login|logout|reauthenticate|setup|status)$/ },
  { methods: ANY_METHOD, path: new RegExp(`^/api/health(?:/${SEGMENT})*$`) },
  { methods: ANY_METHOD, path: new RegExp(`^/api/internal/runtime-ready(?:/${SEGMENT})*$`) },
  { methods: ANY_METHOD, path: new RegExp(`^/api/license(?:/${SEGMENT})*$`) },
  // Data out.
  { methods: ["GET"], path: new RegExp(`^/api/export/(?:${LOCKOUT_EXPORT_ENTITIES.join("|")})$`) },
  // Data safe: list and create a local backup. The cloud upload inside the
  // create route has its own licence check.
  { methods: ["GET"], path: /^\/api\/backup\/list$/ },
  { methods: ["POST"], path: /^\/api\/backup\/create$/ },
];

/**
 * The path to match, or null when it cannot be one of ours. Query and fragment
 * are cut, one trailing slash is ignored (Next treats both as one route), and
 * anything that could hide a different path is refused: percent-encoding,
 * backslashes, spaces, control or non-ASCII characters, empty or dot segments.
 */
function matchablePath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const cut = raw.search(/[?#]/);
  let path = cut === -1 ? raw : raw.slice(0, cut);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (!path.startsWith("/api/")) return null;
  if (/[^A-Za-z0-9_~./-]/.test(path)) return null;
  const segments = path.split("/").slice(1);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  return path;
}

export function isLockoutAllowed(method: string, pathname: string): boolean {
  const path = matchablePath(pathname);
  if (path === null) return false;
  // ASCII letters only: toUpperCase would fold some non-ASCII letters into ASCII ones.
  const verb = typeof method === "string" && /^[A-Za-z]+$/.test(method) ? method.toUpperCase() : "";
  return LOCKOUT_RULES.some(
    (rule) =>
      rule.path.test(path) &&
      (rule.methods === ANY_METHOD || rule.methods.includes(verb)),
  );
}
