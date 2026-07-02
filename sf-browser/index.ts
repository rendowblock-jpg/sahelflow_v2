#!/usr/bin/env bun
/**
 * sf-browser — SahelFlow browser-verification quality gate
 *
 * "done = browser-verified, not tests-pass."
 *
 * This tool is the FINAL gate before declaring a session "done":
 *   1. Starts the SahelFlow dev server on port 3000 (if not already running)
 *   2. Logs in via /api/auth/login with PIN 12345678
 *   3. Walks all 16 dashboard pages with the session cookie
 *   4. For each page verifies:
 *        - HTTP 200 (no auth redirect)
 *        - No error-boundary markers in HTML ("Something went wrong", etc.)
 *        - No ciphertext leaks (long base64 strings where customer names
 *          should be — symptom of master-key mismatch between seed and dev
 *          server)
 *        - No "Fonctionnalité Premium" locks on dev (license gating should
 *          be inactive in dev mode)
 *        - Auth is enforced: hitting a protected API route WITHOUT a cookie
 *          returns 401 (or 307 to /login for pages)
 *   5. Takes screenshots to /tmp/sf-browser-shots/ via the `agent-browser`
 *      CLI if it is installed; otherwise skips screenshots silently.
 *   6. Prints a PASS/FAIL summary table.
 *
 * Exit 0 = all 16 pages pass. Exit 1 = at least one page failed.
 *
 * Usage:
 *   sf-browser                # full run (start server if needed)
 *   sf-browser --no-shots     # skip screenshots even if agent-browser is available
 *   sf-browser --keep-server  # don't kill a server we started (for follow-up commands)
 *
 * Environment:
 *   SF_REPO_DIR     — repo path (default /tmp/sahelflow_v2)
 *   SF_BROWSER_PORT — port to hit (default 3000)
 *   SF_BROWSER_PIN  — login PIN (default 12345678)
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";

// ── Config ─────────────────────────────────────────────────────────────────
const REPO_DIR = process.env.SF_REPO_DIR || "/tmp/sahelflow_v2";
const PORT = parseInt(process.env.SF_BROWSER_PORT || "3000", 10);
const BASE = `http://localhost:${PORT}`;
const SHOTS_DIR = "/tmp/sf-browser-shots";
const PIN = process.env.SF_BROWSER_PIN || "12345678";
const SESSION_COOKIE_NAME = "sf_session";

// ANSI colors
const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m",
      BOLD = "\x1b[1m", DIM = "\x1b[2m", NC = "\x1b[0m";

// ── The 16 dashboard pages (matches src/components/layout/navigation.ts) ───
const PAGES: Array<{ name: string; path: string }> = [
  { name: "Dashboard",   path: "/dashboard" },
  { name: "Inbox",       path: "/inbox" },
  { name: "Orders",      path: "/orders" },
  { name: "Customers",   path: "/customers" },
  { name: "Products",    path: "/products" },
  { name: "Deliveries",  path: "/deliveries" },
  { name: "Returns",     path: "/returns" },
  { name: "Analytics",   path: "/analytics" },
  { name: "Risk",        path: "/risk" },
  { name: "Accounting",  path: "/accounting" },
  { name: "Agents",      path: "/agents" },
  { name: "Automations", path: "/automations" },
  { name: "Storefronts", path: "/storefronts" },
  { name: "Imports",     path: "/imports" },
  { name: "Profile",     path: "/profile" },
  { name: "Settings",    path: "/settings" },
];

// A protected API route that requires auth. Used to verify auth enforcement.
const PROTECTED_API_PROBE = "/api/orders";

// Strings that indicate an error boundary fired.
const ERROR_MARKERS = [
  "Something went wrong",
  "Application error",
  "Erreur inattendue",
  "Unhandled Runtime Error",
  "TypeError:",
  "ReferenceError:",
  "SyntaxError:",
  "Error: ENOENT",
];

// Strings that indicate a premium/license lock is showing on the page.
// In dev mode with full license, these should NOT appear.
const PREMIUM_MARKERS = [
  "Fonctionnalité Premium",
  "Premium feature",
  "Mettre à niveau",
  "Upgrade to unlock",
  "Verrouillé par la licence",
  "License required",
];

// Heuristic: long base64 strings are likely ciphertext leaking into the DOM.
// A 12-byte IV + payload + 16-byte GCM tag is at minimum ~40 base64 chars.
// We require 3+ such strings to flag a leak — a single one could be a normal
// data attribute. (A customer table with leaked names would have 10+.)
//
// FALSE-POSITIVE FIX (Session 21): Next.js RSC flight payload
// (self.__next_f.push([...])) and <script> blocks contain many long
// base64-ish strings (JS chunk hashes, serialized refs). Large pages like
// /orders (410KB HTML) had 50+ such strings — all false positives. Fix:
// strip <script>...</script> blocks + self.__next_f payloads BEFORE counting,
// so only base64 in the visible DOM context is considered.
const CIPHERTEXT_RE = /[A-Za-z0-9+/]{50,}={0,2}/g;

// Strip script blocks + RSC flight payload so they don't trigger false positives.
function stripNonDomContent(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")   // <script>...</script>
    .replace(/self\.__next_f\.push\([^)]*\)/g, "");          // RSC flight chunks
}

// ── Helpers ────────────────────────────────────────────────────────────────

function loadEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const candidate of [".env.local", ".env"]) {
    const p = resolve(REPO_DIR, candidate);
    if (existsSync(p)) {
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[m[1]] = v;
      }
      break;
    }
  }
  return env;
}

async function isServerUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/health`, {
      signal: AbortSignal.timeout(2000),
      redirect: "manual",
    });
    // 200 = healthy. 307/302 = redirecting to /login which still means server is up.
    return r.status === 200 || r.status === 307 || r.status === 302;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 90_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

interface ServerHandle {
  proc: ReturnType<typeof Bun.spawn> | null;
  startedHere: boolean;
}

async function ensureServer(env: Record<string, string>): Promise<ServerHandle> {
  if (await isServerUp()) {
    return { proc: null, startedHere: false };
  }
  // Start the dev server with the right env vars
  const fullEnv: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    DATABASE_URL: env.DATABASE_URL || "file:./data/shops/dev.db",
    AUTH_SECRET: env.AUTH_SECRET || "dev-auth-secret-for-testing-only-not-production",
    SF_MASTER_KEY:
      env.SF_MASTER_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    PORT: String(PORT),
  };
  const proc = Bun.spawn(["bun", "run", "dev"], {
    cwd: REPO_DIR,
    env: fullEnv,
    stdout: "ignore",
    stderr: "ignore",
  });
  if (!(await waitForServer())) {
    try { proc.kill(); } catch { /* ignore */ }
    throw new Error(
      `Dev server failed to come up at ${BASE} within 90s. ` +
      `Check that 'bun run dev' works in ${REPO_DIR}.`,
    );
  }
  return { proc, startedHere: true };
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: PIN }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(
      `Login failed (HTTP ${r.status}). ` +
      `Body: ${body.slice(0, 200)}. ` +
      `Make sure auth is set up (run 'sf-seed' first).`,
    );
  }
  const setCookie = r.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login response had no set-cookie header");
  const m = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!m) throw new Error(`Login response did not set ${SESSION_COOKIE_NAME} cookie`);
  return `${SESSION_COOKIE_NAME}=${m[1]}`;
}

interface PageResult {
  page: string;
  path: string;
  status: number;
  rendered: boolean;       // HTTP 200 and no error markers
  ciphertextLeak: boolean; // 3+ long base64 strings in HTML
  premiumLock: boolean;    // any premium marker found
  authEnforced: boolean;   // unauth request to protected API returned 401/307
  errorSnippets: string[];
  notes: string;
  htmlBytes: number;
}

async function checkPage(cookie: string, p: { name: string; path: string }): Promise<PageResult> {
  const result: PageResult = {
    page: p.name,
    path: p.path,
    status: 0,
    rendered: false,
    ciphertextLeak: false,
    premiumLock: false,
    authEnforced: false,
    errorSnippets: [],
    notes: "",
    htmlBytes: 0,
  };

  // 1) WITH cookie — fetch the page
  try {
    const r = await fetch(`${BASE}${p.path}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    result.status = r.status;
    if (r.status === 200) {
      const html = await r.text();
      result.htmlBytes = html.length;
      for (const marker of ERROR_MARKERS) {
        if (html.includes(marker)) result.errorSnippets.push(marker);
      }
      for (const marker of PREMIUM_MARKERS) {
        if (html.includes(marker)) { result.premiumLock = true; break; }
      }
      // Strip script + RSC flight payload FIRST — those contain long base64-ish
      // strings (chunk hashes, serialized refs) that are NOT ciphertext leaks.
      const domHtml = stripNonDomContent(html);
      // Filter out obvious false positives: file paths, URLs, chunk hashes,
      // node_modules refs. Real ciphertext is pure base64 (A-Za-z0-9+/= only)
      // with no slashes-as-path-separators or recognizable words.
      const rawMatches = domHtml.match(CIPHERTEXT_RE) || [];
      const cipherMatches = rawMatches.filter((s) => {
        // Reject if it looks like a path or URL (contains /node_modules/, /_next/, etc.)
        if (/\/(node_modules|_next|static|chunks)\//i.test(s)) return false;
        // Reject if it contains "chunk" or "ecmascript" (RSC ref artifacts)
        if (/chunk|ecmascript|webpack|turbo/i.test(s)) return false;
        return true;
      });
      if (cipherMatches.length >= 3) {
        result.ciphertextLeak = true;
      }
      result.rendered =
        result.errorSnippets.length === 0 &&
        !result.ciphertextLeak &&
        html.length > 1500; // sanity: a rendered dashboard is at least this big
    } else if (r.status === 307 || r.status === 302) {
      const loc = r.headers.get("location") || "";
      result.notes = `Redirected to ${loc} (auth not accepted?)`;
    } else {
      result.notes = `HTTP ${r.status}`;
    }
  } catch (e) {
    result.notes = `fetch error: ${(e as Error).message.slice(0, 80)}`;
  }

  // 2) WITHOUT cookie — verify auth enforcement on a protected API route
  try {
    const r = await fetch(`${BASE}${PROTECTED_API_PROBE}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 401) {
      result.authEnforced = true;
    } else if (r.status === 307 || r.status === 302) {
      const loc = r.headers.get("location") || "";
      if (loc.includes("/login")) result.authEnforced = true;
    } else if (r.status === 200) {
      const extra = `auth NOT enforced on ${PROTECTED_API_PROBE}`;
      result.notes = result.notes ? `${result.notes}; ${extra}` : extra;
    }
  } catch {
    // network blip — don't fail on this alone; the page check already ran
  }

  return result;
}

function agentBrowserAvailable(): boolean {
  const r = spawnSync("agent-browser", ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return r.status === 0;
}

function ab(args: string[], timeoutMs = 10_000): boolean {
  const r = spawnSync("agent-browser", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  return r.status === 0;
}

async function captureScreenshots(results: PageResult[]): Promise<void> {
  console.log(`\n${BOLD}── Capturing screenshots ──${NC}`);
  if (!agentBrowserAvailable()) {
    console.log(`  ${YELLOW}⚠️  agent-browser CLI not installed — skipping screenshots${NC}`);
    return;
  }

  // Establish a browser session. The login input has id="pin" but NO name
  // attribute, so the old selector input[name='pin'] never matched. Use #pin.
  // We also set the auth cookie directly as a fallback — the React form's
  // router.replace("/") doesn't always complete before screenshots begin in
  // headless mode. The session cookie is NOT httpOnly, so document.cookie works.
  console.log(`  Logging in via browser to seed cookie...`);
  let loginOk = false;

  // Method 1: fill the form + submit (preferred — exercises the real login flow)
  loginOk =
    ab(["open", `${BASE}/login`], 15_000) &&
    ab(["wait", "1500"]) &&
    ab(["fill", "#pin", PIN], 5_000) &&
    ab(["click", "button[type='submit']"], 5_000) &&
    ab(["wait", "2500"]);

  // Method 2 (fallback): if the form didn't redirect, get a cookie via the API
  // and inject it via document.cookie. This guarantees an authenticated session.
  if (!loginOk) {
    console.log(`  ${DIM}Form login didn't complete — injecting auth cookie via API...${NC}`);
    try {
      const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: PIN }),
        redirect: "manual",
      });
      const setCookie = loginRes.headers.get("set-cookie") || "";
      const m = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      if (m) {
        ab(["open", `${BASE}/login`], 15_000);
        ab(["wait", "1000"]);
        ab(["eval", `document.cookie='${SESSION_COOKIE_NAME}=${m[1]};path=/;max-age=3600'`], 5_000);
        ab(["wait", "500"]);
        loginOk = true;
      }
    } catch {
      // network error — leave loginOk false
    }
  }

  if (!loginOk) {
    console.log(`  ${YELLOW}⚠️  Browser login flow failed — screenshots may show /login${NC}`);
  }

  let captured = 0;
  for (const r of results) {
    const slug = r.path.replace(/^\//, "").replace(/\//g, "-") || "root";
    const shotPath = `${SHOTS_DIR}/${slug}.png`;
    const ok =
      ab(["open", `${BASE}${r.path}`], 15_000) &&
      ab(["wait", "1500"]) &&
      ab(["screenshot", shotPath], 5_000);
    if (ok) captured++;
  }
  console.log(`  ${GREEN}✅ Captured ${captured}/${results.length} screenshots → ${SHOTS_DIR}${NC}`);
}

function printSummary(results: PageResult[]): number {
  console.log(`\n${BOLD}══════════════════════════════════════════════════════════════════════════════`);
  console.log(`  sf-browser — Browser Verification Summary`);
  console.log(`══════════════════════════════════════════════════════════════════════════════${NC}\n`);

  const colPage = 14, colPath = 15, colStat = 5;
  console.log(
    `${DIM}  ${"Page".padEnd(colPage)}${"Path".padEnd(colPath)}${"Stat".padEnd(colStat)}` +
    `${"Rend".padEnd(5)}${"Ciph".padEnd(5)}${"Prem".padEnd(5)}${"Auth".padEnd(5)}Notes${NC}`,
  );
  console.log(`${DIM}  ${"─".repeat(78)}${NC}`);

  let failures = 0;
  for (const r of results) {
    const ok = r.rendered && !r.ciphertextLeak && !r.premiumLock && r.authEnforced;
    if (!ok) failures++;
    const color = ok ? GREEN : RED;

    const yn = (b: boolean, isGood: boolean) => {
      const sym = b ? "Y" : "N";
      if (b) return isGood ? `${GREEN}${sym}${NC}` : `${RED}${sym}${NC}`;
      return isGood ? `${RED}${sym}${NC}` : `${GREEN}${sym}${NC}`;
    };

    const line =
      `  ${color}${r.page.padEnd(colPage)}${NC}` +
      `${r.path.padEnd(colPath)}` +
      `${String(r.status).padEnd(colStat)}` +
      `${yn(r.rendered, true)}   ` +
      `${yn(r.ciphertextLeak, false)}   ` +
      `${yn(r.premiumLock, false)}   ` +
      `${yn(r.authEnforced, true)}   ` +
      `${r.notes || (ok ? "" : "(see errors below)")}`;
    console.log(line);
    if (r.errorSnippets.length > 0) {
      console.log(`      ${RED}error markers: ${r.errorSnippets.join(" | ")}${NC}`);
    }
    if (r.htmlBytes > 0 && r.htmlBytes < 1500) {
      console.log(`      ${YELLOW}small HTML (${r.htmlBytes} bytes) — page may not have rendered${NC}`);
    }
  }

  console.log(`\n${BOLD}══════════════════════════════════════════════════════════════════════════════`);
  if (failures === 0) {
    console.log(`  ${GREEN}${BOLD}✅ ALL ${results.length} PAGES PASS — browser-verified${NC}`);
  } else {
    console.log(`  ${RED}${BOLD}❌ ${failures}/${results.length} PAGE(S) FAILED browser verification${NC}`);
  }
  console.log(`${BOLD}══════════════════════════════════════════════════════════════════════════════${NC}`);
  console.log(`  screenshots dir: ${SHOTS_DIR}`);
  return failures;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const noShots = argv.includes("--no-shots");
  const keepServer = argv.includes("--keep-server");

  mkdirSync(SHOTS_DIR, { recursive: true });

  console.log(`${BOLD}═══════════════════════════════════════════════════`);
  console.log(`  sf-browser — browser-verification quality gate`);
  console.log(`═══════════════════════════════════════════════════${NC}`);
  console.log(`  repo : ${REPO_DIR}`);
  console.log(`  base : ${BASE}`);
  console.log(`  PIN  : ${PIN}`);
  console.log(`  shots: ${SHOTS_DIR}`);
  console.log(`  pages: ${PAGES.length}`);
  console.log("");

  // 1) Start server (if needed)
  console.log(`${BOLD}── Dev server ──${NC}`);
  const env = loadEnvFile();
  let handle: ServerHandle;
  try {
    handle = await ensureServer(env);
  } catch (e) {
    console.log(`  ${RED}❌ ${(e as Error).message}${NC}`);
    process.exit(1);
  }
  if (handle.startedHere) {
    console.log(`  ${GREEN}✅ Started dev server (pid ${handle.proc?.pid})${NC}`);
  } else {
    console.log(`  ${YELLOW}⚠️  Server already running at ${BASE} — reusing${NC}`);
  }

  // 2) Login
  console.log(`\n${BOLD}── Login ──${NC}`);
  let cookie: string;
  try {
    cookie = await login();
    const masked = cookie.slice(0, SESSION_COOKIE_NAME.length + 5) + "..." + cookie.slice(-4);
    console.log(`  ${GREEN}✅ Logged in (${masked})${NC}`);
  } catch (e) {
    console.log(`  ${RED}❌ ${(e as Error).message}${NC}`);
    if (handle.startedHere && handle.proc && !keepServer) {
      try { handle.proc.kill(); } catch { /* ignore */ }
    }
    process.exit(1);
  }

  // 3) Walk pages
  console.log(`\n${BOLD}── Walking ${PAGES.length} dashboard pages ──${NC}`);
  const results: PageResult[] = [];
  for (const p of PAGES) {
    process.stdout.write(`  ▶ ${p.name.padEnd(12)} ... `);
    const r = await checkPage(cookie, p);
    const ok = r.rendered && !r.ciphertextLeak && !r.premiumLock && r.authEnforced;
    console.log(ok ? `${GREEN}PASS${NC}` : `${RED}FAIL${NC}`);
    results.push(r);
  }

  // 4) Screenshots (best-effort)
  if (!noShots) {
    try { await captureScreenshots(results); } catch (e) {
      console.log(`  ${YELLOW}⚠️  Screenshot capture failed: ${(e as Error).message}${NC}`);
    }
  }

  // 5) Summary
  const failures = printSummary(results);

  // 6) Cleanup
  if (handle.startedHere && handle.proc && !keepServer) {
    console.log(`\n${DIM}Stopping dev server (pid ${handle.proc.pid})...${NC}`);
    try { handle.proc.kill(); } catch { /* ignore */ }
  } else if (handle.startedHere && keepServer) {
    console.log(`\n${DIM}Server left running (pid ${handle.proc?.pid}) — kill manually when done${NC}`);
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${RED}Fatal: ${(e as Error).message}${NC}`);
  process.exit(1);
});
