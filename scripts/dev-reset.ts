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
import { resolve } from "path";
import { existsSync, mkdirSync } from "fs";

// Compute absolute DB path from cwd (project root)
const dbPath = resolve(process.cwd(), "data", "shops", "dev.db");
const dbDir = resolve(dbPath, "..");
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

// CRITICAL: Set absolute DATABASE_URL so prisma CLI + Prisma Client agree
const absoluteDbUrl = `file:${dbPath}`;
process.env.DATABASE_URL = absoluteDbUrl;

console.log("═══════════════════════════════════════════════════");
console.log("  dev:reset — wipe + reseed dev database");
console.log("═══════════════════════════════════════════════════");
console.log(`  DB: ${dbPath}`);
console.log("");

// Step 1: prisma db push --force-reset (wipes + recreates schema)
console.log("── Step 1/2: prisma db push --force-reset ──");
const push = spawnSync(
  process.platform === "win32" ? "bunx.cmd" : "bunx",
  ["prisma", "db", "push", "--force-reset", "--skip-generate"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: absoluteDbUrl },
    shell: process.platform === "win32",
  },
);
if (push.status !== 0) {
  console.error(`\n❌ prisma db push failed (exit ${push.status})`);
  process.exit(push.status ?? 1);
}

// Step 2: seed:rich (writes the actual data)
console.log("\n── Step 2/2: seed:rich ──");
const seed = spawnSync(
  process.platform === "win32" ? "bun.cmd" : "bun",
  ["run", "seed:rich"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: absoluteDbUrl },
    shell: process.platform === "win32",
  },
);
if (seed.status !== 0) {
  console.error(`\n❌ seed:rich failed (exit ${seed.status})`);
  process.exit(seed.status ?? 1);
}

console.log("\n═══════════════════════════════════════════════════");
console.log("  ✅ Dev database reset + seeded");
console.log("  Login PIN: 12345678");
console.log("═══════════════════════════════════════════════════");
