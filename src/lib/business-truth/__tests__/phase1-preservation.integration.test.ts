import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const latestMigration = "20260731080000_phase1_profitability_cost_snapshots";
const testRoot = await mkdtemp(join(tmpdir(), "sahelflow-phase1-preservation-"));
const databasePath = join(testRoot, "preservation.db");
const statePath = join(testRoot, "state.json");
const preUpdatePrisma = join(testRoot, "prisma-pre-update");
const worker = join(repoRoot, "scripts", "phase1-preservation-worker.ts");

function environment() {
  return {
    ...process.env,
    NODE_ENV: "test",
    VITEST: "true",
    DATABASE_URL: `file:${databasePath}`,
    SF_MASTER_KEY:
      process.env.SF_MASTER_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };
}

function run(label: string, args: string[]): void {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: environment(),
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    );
  }
}

function migrate(schemaPath: string): void {
  run("Prisma migrate deploy", [
    "x",
    "prisma",
    "migrate",
    "deploy",
    "--schema",
    schemaPath,
  ]);
}

function workerStage(stage: string): void {
  run(`Preservation worker ${stage}`, [
    "--conditions",
    "react-server",
    worker,
    stage,
    statePath,
  ]);
}

async function preparePreUpdateSchema(): Promise<void> {
  await cp(join(repoRoot, "prisma"), preUpdatePrisma, {
    recursive: true,
    filter: (source) => !source.includes(latestMigration),
  });
}

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("Phase 1 restart and in-place update preservation", () => {
  it(
    "preserves canonical facts, encrypted payloads, provider receipts and exact replay across process restart and migration",
    async () => {
      await preparePreUpdateSchema();
      migrate(preUpdatePrisma);

      workerStage("seed");
      const seeded = JSON.parse(await readFile(statePath, "utf8")) as {
        coreDigest: string;
        coreCounts: Record<string, number>;
      };
      expect(seeded.coreDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(seeded.coreCounts.BusinessCommand).toBeGreaterThan(10);
      expect(seeded.coreCounts.FinancialMovement).toBeGreaterThan(3);
      expect(seeded.coreCounts.CanonicalDeliveryEvent).toBeGreaterThan(1);
      expect(seeded.coreCounts.CanonicalReturnEvent).toBeGreaterThan(3);

      // New Bun process + new Prisma client against the same pre-update file.
      workerStage("verify-pre-update");

      // Apply the exact current migration set over the populated database.
      migrate(join(repoRoot, "prisma"));

      // A third process verifies hashes, replay and the new backfilled projection.
      workerStage("verify-post-update");
    },
    240_000,
  );
});
