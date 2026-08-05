import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const deterministicRoot = "0123456789abcdef".repeat(4);
const rootPreload =
  "--preload ./scripts/protected-data-migration-root-preflight.ts";

interface PackageScripts {
  scripts?: Record<string, string>;
}

function installedMigrationEnvironment(dataDir: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: `file:${join(dataDir, "unused.db")}`,
    SF_DATA_DIR: dataDir,
  };
  for (const name of [
    "GITHUB_ACTIONS",
    "NODE_ENV",
    "VITEST",
    "SF_MASTER_KEY",
    "SF_INSTALLATION_ROOT_SOURCE",
    "SF_PROTECTED_DATA_MIGRATION_ROOT_SOURCE",
  ]) {
    delete environment[name];
  }
  return environment;
}

describe("protected-data migration CLI", () => {
  it("publishes guarded Bun commands with root preflight and the server condition", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as PackageScripts;

    expect(packageJson.scripts?.["protected-data:verify"]).toBe(
      `bun --conditions react-server ${rootPreload} scripts/migrate-protected-data-v1.ts --verify`,
    );
    expect(packageJson.scripts?.["protected-data:apply"]).toBe(
      `bun --conditions react-server ${rootPreload} scripts/migrate-protected-data-v1.ts --apply`,
    );
  });

  it("rejects missing installed root authority before creating a migration lease", () => {
    const sandbox = mkdtempSync(
      join(tmpdir(), "sahelflow-protected-data-root-preflight-"),
    );
    const dataDir = join(sandbox, "app-data");
    try {
      const result = spawnSync("bun", ["run", "protected-data:verify"], {
        cwd: repositoryRoot,
        env: installedMigrationEnvironment(dataDir),
        encoding: "utf8",
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(output).toContain(
        "Offline protected-data maintenance requires an explicit exported installation root",
      );
      expect(
        existsSync(join(dataDir, "protected-data-migration-v1.lock")),
      ).toBe(false);
      expect(existsSync(dataDir)).toBe(false);
    } finally {
      rmSync(sandbox, { force: true, recursive: true });
    }
  });

  it("loads the migration authority through its supported Bun command", () => {
    const dataDir = mkdtempSync(
      join(tmpdir(), "sahelflow-protected-data-cli-"),
    );
    try {
      const result = spawnSync("bun", ["run", "protected-data:verify"], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          DATABASE_URL: `file:${join(dataDir, "unused.db")}`,
          GITHUB_ACTIONS: "true",
          NODE_ENV: "test",
          SF_DATA_DIR: dataDir,
          SF_MASTER_KEY: deterministicRoot,
        },
        encoding: "utf8",
        timeout: 30_000,
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(output).toContain("Could not read canonical shop registry");
      expect(output).not.toContain(
        "This module cannot be imported from a Client Component module",
      );
      expect(
        existsSync(join(dataDir, "protected-data-migration-v1.lock")),
      ).toBe(false);
    } finally {
      rmSync(dataDir, { force: true, recursive: true });
    }
  });
});
