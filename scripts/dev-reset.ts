/**
 * dev-reset — wipe + reseed the dev database with rich Algerian COD data.
 *
 * This is the robust replacement for `bunx prisma db push --force-reset && bun run seed:rich`.
 *
 * WHY THIS EXISTS (Session 21 fix):
 * Prisma CLI resolves relative DATABASE_URL paths from the `prisma/` directory
 * (where schema.prisma lives), but Prisma Client resolves from cwd (project root).
 * A relative "file:./data/shops/dev.db" creates the DB at prisma/data/shops/dev.db
 * while the app reads data/shops/dev.db — a 0-byte mismatch that causes the seed
 * to throw P2021 ("table ExtractionMetric does not exist").
 *
 * FIX: This script sets DATABASE_URL to an ABSOLUTE path before invoking prisma,
 * so the CLI and Client always agree on the same file. Cross-platform (works on
 * Windows, macOS, Linux) via path.resolve().
 *
 * Usage: bun run dev:reset   (mapped in package.json)
 */
import { spawnSync } from "child_process";
import { assertTestSandbox } from "./test-sandbox";

assertTestSandbox("dev reset");
const absoluteDbUrl = process.env.DATABASE_URL!;
const dbPath = absoluteDbUrl.slice("file:".length);

const isWindows = process.platform === "win32";

console.log("═══════════════════════════════════════════════════");
console.log("  dev:reset — wipe + reseed dev database");
console.log("═══════════════════════════════════════════════════");
console.log(`  DB: ${dbPath}`);
console.log("");

// Helper: run a command with the absolute DATABASE_URL injected.
// Uses "bun x" (not "bunx") so it only depends on `bun` being on PATH —
// bunx.cmd doesn't exist on Windows, bunx.exe does, but "bun x" always works.
function run(cmd: string, args: string[], label: string): void {
  console.log(`\n── ${label} ──`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: absoluteDbUrl },
    // shell: true on Windows so cmd.exe resolves PATH (finds bun.exe)
    shell: isWindows,
  });
  if (result.status !== 0) {
    console.error(`\n❌ ${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

// Step 1: prisma db push --force-reset (wipes + recreates schema)
// "bun x prisma" = "bunx prisma" but more portable
run("bun", ["x", "prisma", "db", "push", "--force-reset", "--skip-generate"], "Step 1/2: prisma db push --force-reset");

// Step 2: seed:rich (writes the actual data)
run("bun", ["run", "seed:rich"], "Step 2/2: seed:rich");

console.log("\n═══════════════════════════════════════════════════");
console.log("  ✅ Dev database reset + seeded");
console.log("  Login PIN: 12345678");
console.log("═══════════════════════════════════════════════════");
