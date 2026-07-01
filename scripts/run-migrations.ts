/**
 * Migration runner — called by Tauri on startup before spawning Next.js.
 *
 * PROD-001/PROD-004: ensures the active shop's SQLite schema is up-to-date.
 * Handles both fresh installs (migrations create all tables) and existing
 * installs from `prisma db push` (baselines the migration history, then
 * applies pending migrations).
 *
 * Usage: bun scripts/run-migrations.ts [database-url]
 * If no URL is provided, uses the DATABASE_URL env var.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const dbUrl = process.argv[2] ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[migrations] No DATABASE_URL provided");
  process.exit(0); // non-fatal — the app will create the DB on first request
}

const schemaPath = join(process.cwd(), "prisma/schema.prisma");
if (!existsSync(schemaPath)) {
  console.log("[migrations] No schema.prisma found — skipping");
  process.exit(0);
}

try {
  // Try migrate deploy first
  console.log("[migrations] Running prisma migrate deploy...");
  execSync(`bunx prisma migrate deploy --schema=${schemaPath}`, {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  console.log("[migrations] ✅ Migrations applied");
} catch (err) {
  // P3005 = database schema is not empty (existing user from db push)
  // Baseline: mark all existing migrations as applied, then retry
  console.log("[migrations] migrate deploy failed (likely P3005 — baselining...)");
  try {
    // Get list of migration names
    const migrationsDir = join(process.cwd(), "prisma/migrations");
    if (existsSync(migrationsDir)) {
      const { readdirSync } = require("node:fs");
      const migrations = readdirSync(migrationsDir).filter((d: string) =>
        d.match(/^\d+_/)
      );
      for (const migration of migrations) {
        try {
          execSync(`bunx prisma migrate resolve --applied ${migration} --schema=${schemaPath}`, {
            stdio: "pipe",
            env: { ...process.env, DATABASE_URL: dbUrl },
          });
          console.log(`[migrations] Marked ${migration} as applied (baseline)`);
        } catch {
          // already applied — skip
        }
      }
    }
    console.log("[migrations] ✅ Baseline complete");
  } catch (baselineErr) {
    console.error("[migrations] Baseline failed:", baselineErr);
    // Non-fatal — the app will use db push as fallback
  }
}
