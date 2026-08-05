import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const deterministicRoot = "0123456789abcdef".repeat(4);

interface PackageScripts {
  scripts?: Record<string, string>;
}

describe("protected-data migration CLI", () => {
  it("publishes guarded Bun commands with the server condition", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as PackageScripts;

    expect(packageJson.scripts?.["protected-data:verify"]).toBe(
      "bun --conditions react-server scripts/migrate-protected-data-v1.ts --verify",
    );
    expect(packageJson.scripts?.["protected-data:apply"]).toBe(
      "bun --conditions react-server scripts/migrate-protected-data-v1.ts --apply",
    );
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
