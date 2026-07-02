#!/usr/bin/env bun
/**
 * sf-seed — SahelFlow one-command dev environment setup
 *
 * Wipes + reseeds the dev SQLite with rich Algerian-COD data and verifies
 * the post-seed state is ready for browser testing.
 *
 * What it does:
 *   1. Writes data/app-meta.json pointing at data/shops/dev.db
 *   2. Runs `bun run dev:reset` (= prisma db push --force-reset + seed:rich)
 *      which wipes all tables and seeds:
 *        - 4 categories, 20 products, 30 customers, 80 orders
 *        - 40 deliveries, 15 returns, 20 expenses
 *        - 10 conversations + 40 WhatsApp messages
 *        - 1 storefront, 5 notifications, 3 automations
 *        - 3 AI chat sessions, 10 extraction metrics
 *        - 58 wilaya risk profiles, settings, audit log
 *   3. Verifies data/master.key is persisted (the fix from session 19 —
 *      without this, the dev server uses a DIFFERENT key than the seed,
 *      so customer names decrypt as ciphertext blobs in the UI)
 *   4. Prints the login PIN + a ready-to-test message
 *
 * Exit 0 = environment ready. Exit 1 = setup failed.
 *
 * Usage:
 *   sf-seed              # full reset + seed + verify
 *   sf-seed --no-reset   # skip the reset (just verify app-meta + master.key)
 *
 * Environment:
 *   SF_REPO_DIR — repo path (default /tmp/sahelflow_v2)
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { resolve } from "path";

// ── Config ─────────────────────────────────────────────────────────────────
const REPO_DIR = process.env.SF_REPO_DIR || "/tmp/sahelflow_v2";
const PIN = "12345678";

// ANSI colors
const GREEN = "\x1b[32m", RED = "\x1b[31m",
      BOLD = "\x1b[1m", DIM = "\x1b[2m", NC = "\x1b[0m";

// ── Helpers ────────────────────────────────────────────────────────────────

function fail(msg: string): never {
  console.log(`  ${RED}❌ ${msg}${NC}`);
  console.log(`\n${RED}${BOLD}sf-seed FAILED${NC}\n`);
  process.exit(1);
}

function run(cmd: string, args: string[], opts: { cwd: string; timeoutMs: number; env?: Record<string, string> }): { ok: boolean; output: string } {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: opts.timeoutMs,
    env: opts.env ? { ...process.env, ...opts.env } : undefined,
  });
  const output = (r.stdout || "") + (r.stderr || "");
  return { ok: r.status === 0, output };
}

// CRITICAL: Prisma CLI resolves relative DATABASE_URL from the prisma/ directory
// (where schema.prisma lives), but Prisma Client resolves from cwd (project root).
// A relative "file:./data/shops/dev.db" creates the DB at prisma/data/shops/dev.db
// while the app reads data/shops/dev.db — a 0-byte mismatch that causes seed
// deleteMany() to throw P2021 ("table does not exist"). Fix: ALWAYS use an
// absolute path for DATABASE_URL when invoking prisma CLI commands.
function absoluteDbUrl(): string {
  const dbPath = resolve(REPO_DIR, "data", "shops", "dev.db");
  return `file:${dbPath}`;
}

// ── Steps ──────────────────────────────────────────────────────────────────

function writeAppMeta(): void {
  console.log(`${BOLD}── Writing data/app-meta.json ──${NC}`);
  const dataDir = resolve(REPO_DIR, "data");
  const shopsDir = resolve(dataDir, "shops");
  if (!existsSync(shopsDir)) mkdirSync(shopsDir, { recursive: true });
  const metaPath = resolve(dataDir, "app-meta.json");
  writeFileSync(
    metaPath,
    JSON.stringify(
      {
        shops: [
          {
            id: "default",
            name: "Ma Boutique",
            dbPath: "data/shops/dev.db",
            icon: "🏪",
            createdAt: new Date().toISOString(),
          },
        ],
        activeShopId: "default",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`  ${GREEN}✅ app-meta.json → data/shops/dev.db${NC}`);
}

function runReset(): void {
  console.log(`\n${BOLD}── Running 'bun run dev:reset' ──${NC}`);
  console.log(`${DIM}  (prisma db push --force-reset + seed:rich — wipes all data)${NC}`);
  // Pass an ABSOLUTE DATABASE_URL so prisma CLI + Prisma Client agree on the
  // same file (avoids the relative-path prisma/ vs cwd mismatch — see absoluteDbUrl).
  const r = run("bun", ["run", "dev:reset"], {
    cwd: REPO_DIR,
    timeoutMs: 240_000,
    env: { DATABASE_URL: absoluteDbUrl() },
  });
  if (!r.ok) {
    console.log(`  ${RED}❌ dev:reset exited non-zero${NC}`);
    const lines = r.output.trim().split("\n").slice(-25);
    if (lines.length > 0) {
      console.log(`    ${RED}┌─ last 25 lines ──────────────────────${NC}`);
      for (const line of lines) console.log(`    ${RED}│${NC} ${line}`);
      console.log(`    ${RED}└──────────────────────────────────────${NC}`);
    }
    fail("dev:reset failed — see output above");
  }
  // Surface the seed summary lines so the user sees what was seeded
  const summaryLines = r.output
    .split("\n")
    .filter((l) => /✅|🌱|Auth:|PIN=|app-meta|master key/i.test(l))
    .slice(-12);
  if (summaryLines.length > 0) {
    console.log(`  ${DIM}── seed output (key lines) ──${NC}`);
    for (const line of summaryLines) console.log(`  ${DIM}${line}${NC}`);
  }
  console.log(`  ${GREEN}✅ Database reset + rich seed complete${NC}`);
}

function verifyMasterKey(): void {
  console.log(`\n${BOLD}── Verifying data/master.key ──${NC}`);
  const keyPath = resolve(REPO_DIR, "data", "master.key");
  if (!existsSync(keyPath)) {
    fail(
      "data/master.key NOT found after seed.\n" +
      "     The master-key persistence fix (session 19) didn't take effect.\n" +
      "     Without this file, the dev server will generate a DIFFERENT key\n" +
      "     and PII will decrypt as ciphertext in the UI. Check scripts/seed-rich.ts.",
    );
  }
  const key = readFileSync(keyPath, "utf8").trim();
  if (key.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(key)) {
    fail(
      `data/master.key has invalid content (length=${key.length}, expected 64 hex chars).\n` +
      "     The file is corrupted or was overwritten with a non-hex value.",
    );
  }
  console.log(`  ${GREEN}✅ master.key present (${key.slice(0, 8)}…${key.slice(-4)})${NC}`);
}

function verifyAppMeta(): void {
  console.log(`\n${BOLD}── Verifying data/app-meta.json ──${NC}`);
  const metaPath = resolve(REPO_DIR, "data", "app-meta.json");
  if (!existsSync(metaPath)) fail("data/app-meta.json missing after seed");
  let parsed: { shops?: Array<{ dbPath?: string }>; activeShopId?: string };
  try {
    parsed = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch (e) {
    fail(`data/app-meta.json is invalid JSON: ${(e as Error).message}`);
  }
  const shop = parsed.shops?.[0];
  if (!shop || shop.dbPath !== "data/shops/dev.db") {
    fail(
      `data/app-meta.json doesn't point at data/shops/dev.db\n` +
      `     shops[0].dbPath = ${shop?.dbPath ?? "(missing)"}`,
    );
  }
  if (parsed.activeShopId !== "default") {
    fail(`data/app-meta.json activeShopId != "default" (got ${parsed.activeShopId})`);
  }
  console.log(`  ${GREEN}✅ app-meta.json points at data/shops/dev.db (active=default)${NC}`);
}

function verifyDevDb(): void {
  console.log(`\n${BOLD}── Verifying data/shops/dev.db ──${NC}`);
  const dbPath = resolve(REPO_DIR, "data", "shops", "dev.db");
  if (!existsSync(dbPath)) fail("data/shops/dev.db missing after seed");
  let sizeBytes: number;
  try {
    sizeBytes = statSync(dbPath).size;
  } catch (e) {
    fail(`could not stat data/shops/dev.db: ${(e as Error).message}`);
  }
  if (sizeBytes < 50_000) {
    fail(`data/shops/dev.db is suspiciously small (${sizeBytes} bytes) — seed may have failed silently`);
  }
  console.log(`  ${GREEN}✅ dev.db present (${(sizeBytes / 1024).toFixed(1)} KB)${NC}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  const noReset = argv.includes("--no-reset");

  console.log(`${BOLD}═══════════════════════════════════════════════════`);
  console.log(`  sf-seed — one-command dev environment setup`);
  console.log(`═══════════════════════════════════════════════════${NC}`);
  console.log(`  repo: ${REPO_DIR}`);
  console.log(`  mode: ${noReset ? "verify-only (no reset)" : "full reset + seed"}\n`);

  if (!existsSync(resolve(REPO_DIR, "package.json"))) {
    fail(`${REPO_DIR} doesn't look like the SahelFlow repo (no package.json)`);
  }

  // 1) Always (re)write app-meta.json — this is idempotent and cheap
  writeAppMeta();

  // 2) Run dev:reset (the heavy lift) unless --no-reset
  if (!noReset) {
    runReset();
  } else {
    console.log(`\n${BOLD}── Skipping 'bun run dev:reset' (--no-reset) ──${NC}`);
  }

  // 3) Verify the post-seed state — these catch the bugs we hit before
  verifyMasterKey();
  verifyAppMeta();
  verifyDevDb();

  // 4) Print ready message
  console.log(`\n${BOLD}═══════════════════════════════════════════════════`);
  console.log(`  ${GREEN}${BOLD}✅ Dev environment ready${NC}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════${NC}`);
  console.log(`  Login PIN : ${BOLD}${PIN}${NC}`);
  console.log(`  Database  : ${REPO_DIR}/data/shops/dev.db`);
  console.log(`  Master key: ${REPO_DIR}/data/master.key`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Start the dev server:  ${BOLD}cd ${REPO_DIR} && bun run dev${NC}`);
  console.log(`       (or let sf-browser start it for you)`);
  console.log(`    2. Verify in browser:     ${BOLD}sf-browser${NC}`);
  console.log(`    3. Open http://localhost:3000/login and enter PIN ${BOLD}${PIN}${NC}\n`);
}

try {
  main();
} catch (e) {
  console.error(`${RED}Fatal: ${(e as Error).message}${NC}`);
  process.exit(1);
}
