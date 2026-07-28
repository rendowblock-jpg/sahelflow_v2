/**
 * dev-reset — wipe + reseed the dev database with rich Algerian COD data.
 *
 * This is the robust replacement for ad-hoc `prisma db push --force-reset`.
 * Numbered migrations are the schema authority, including SQLite CHECK
 * constraints that Prisma's db-push synthesis cannot reproduce.
 *
 * WHY THIS EXISTS (Session 21 fix):
 * Prisma CLI resolves relative DATABASE_URL paths from the `prisma/` directory,
 * while Prisma Client resolves from cwd. A relative shop path can therefore
 * create/reset one database while the app reads another.
 *
 * FIX: This script requires the test-sandbox contract and injects its absolute
 * DATABASE_URL into both Prisma and the seed process. `prisma migrate reset`
 * deletes the disposable database, reapplies the complete numbered migration
 * history, and leaves generated client files untouched before rich seeding.
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

// Step 1: wipe the disposable shop and reapply numbered migrations.
// --skip-seed keeps this script's explicit rich seed as the only seed authority.
// --skip-generate avoids mutating generated files during a database-only reset.
run(
  "bun",
  [
    "x",
    "prisma",
    "migrate",
    "reset",
    "--force",
    "--skip-seed",
    "--skip-generate",
  ],
  "Step 1/2: prisma migrate reset",
);

// Step 2: seed:rich (writes the actual data)
run("bun", ["run", "seed:rich"], "Step 2/2: seed:rich");

console.log("\n═══════════════════════════════════════════════════");
console.log("  ✅ Dev database reset + seeded from migrations");
console.log("  Login PIN: 12345678");
console.log("═══════════════════════════════════════════════════");
