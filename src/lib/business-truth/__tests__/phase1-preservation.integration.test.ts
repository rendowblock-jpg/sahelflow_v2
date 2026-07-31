import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const latestMigration = "20260731080000_phase1_profitability_cost_snapshots";
const testRoot = await mkdtemp(join(tmpdir(), "sahelflow-phase1-preservation-"));
const dataDir = join(testRoot, "data");
const shopsDir = join(dataDir, "shops");
const databasePath = join(shopsDir, "preservation.db");
const statePath = join(testRoot, "state.json");
const preUpdatePrisma = join(testRoot, "prisma-pre-update");
const preservationWorker = join(
  repoRoot,
  "scripts",
  "phase1-preservation-worker.ts",
);
const backupWorker = join(
  repoRoot,
  "scripts",
  "phase1-backup-preservation-worker.ts",
);

function environment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    VITEST: "true",
    DATABASE_URL: `file:${databasePath}`,
    SF_TEST_ROOT: testRoot,
    SF_DATA_DIR: dataDir,
    SF_ACTIVE_SHOP_ID: "preservation",
    SF_REGISTRY_REVISION: "1",
    SF_MIGRATION_SET_SHA256: "d".repeat(64),
    SF_WORKSPACE_ID: "a".repeat(32),
    SF_INSTALLATION_ID: "b".repeat(32),
    SF_SHOP_INCARNATION_ID: "c".repeat(32),
    SF_DATABASE_FILE_ID: "preservation.db",
    SF_MASTER_KEY:
      process.env.SF_MASTER_KEY ??
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  };
}

function run(label: string, args: string[]): void {
  const result = spawnSync("bun", args, {
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

function workerStage(worker: string, stage: string): void {
  run(`${worker.endsWith("backup-preservation-worker.ts") ? "Backup" : "Preservation"} worker ${stage}`, [
    "--conditions",
    "react-server",
    worker,
    stage,
    statePath,
  ]);
}

async function prepareFixture(): Promise<void> {
  await mkdir(shopsDir, { recursive: true });
  await writeFile(
    join(dataDir, "shop-registry.json"),
    `${JSON.stringify(
      {
        formatVersion: 2,
        revision: 1,
        workspaceId: "a".repeat(32),
        installationId: "b".repeat(32),
        shops: [
          {
            id: "preservation",
            incarnationId: "c".repeat(32),
            name: "Phase 1 Preservation",
            databaseFile: "preservation.db",
            icon: null,
            createdAt: "2026-07-31T00:00:00.000Z",
          },
        ],
        activeShopId: "preservation",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await cp(join(repoRoot, "prisma"), preUpdatePrisma, {
    recursive: true,
    filter: (source) => !source.includes(latestMigration),
  });
}

afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("Phase 1 restart, update and backup preservation", () => {
  it(
    "preserves canonical facts, encrypted payloads, receipts and exact replay across restart, migration and disposable restore",
    async () => {
      await prepareFixture();
      migrate(preUpdatePrisma);

      workerStage(preservationWorker, "seed");
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
      workerStage(preservationWorker, "verify-pre-update");

      // Apply the exact current migration set over the populated database.
      migrate(join(repoRoot, "prisma"));

      // A third process verifies hashes, replay and the backfilled projection.
      workerStage(preservationWorker, "verify-post-update");

      // Use the product's real local backup primitive, mutate the disposable
      // database, restore it atomically, then verify from fresh processes.
      workerStage(backupWorker, "create");
      workerStage(backupWorker, "mutate-and-restore");
      workerStage(backupWorker, "verify");
      workerStage(preservationWorker, "verify-post-update");

      const restored = JSON.parse(await readFile(statePath, "utf8")) as {
        backup?: {
          filename: string;
          digest: string;
          sha256: string;
          rescueFile?: string;
        };
      };
      expect(restored.backup?.filename).toMatch(
        /^sahelflow-backup-preservation-.*\.db$/,
      );
      expect(restored.backup?.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(restored.backup?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(restored.backup?.rescueFile).toMatch(
        /^preservation-.*-pre-restore\.db$/,
      );
    },
    360_000,
  );
});
