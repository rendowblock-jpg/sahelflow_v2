#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const requireClean = process.argv.includes("--require-clean");
const MIGRATION_SET_HASH_DOMAIN = "sahelflow-migration-set-v1\n";
const MIGRATION_HASH_GOLDEN =
  "b3b8d5e292253c7a85f58ea1eef8e4df810ea4a6cb1ab88de66a581e0e0e2c21";

type MigrationHashInput = {
  name: string;
  sql: Uint8Array;
};

/**
 * Framed migration-set-v1 algorithm, shared with migration_coordinator.rs:
 * domain line, then `<UTF-8 name byte length>:<name>\n64:<SQL SHA-256 hex>\n`.
 */
function migrationSetSha256(migrations: MigrationHashInput[]): string {
  const migrationSetHash = createHash("sha256");
  migrationSetHash.update(MIGRATION_SET_HASH_DOMAIN);
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    migrationSetHash.update(String(Buffer.byteLength(migration.name, "utf8")));
    migrationSetHash.update(":");
    migrationSetHash.update(migration.name, "utf8");
    migrationSetHash.update("\n64:");
    migrationSetHash.update(checksum);
    migrationSetHash.update("\n");
  }
  return migrationSetHash.digest("hex");
}

function verifyMigrationHashGoldenVector(): void {
  const actual = migrationSetSha256([
    {
      name: "001_init",
      sql: Buffer.from("CREATE TABLE t (id INTEGER);\n"),
    },
    {
      name: "002_add_name",
      sql: Buffer.from("ALTER TABLE t ADD COLUMN name TEXT;\n"),
    },
  ]);
  if (actual !== MIGRATION_HASH_GOLDEN) {
    throw new Error(
      `Migration hash algorithm drifted: expected ${MIGRATION_HASH_GOLDEN}, found ${actual}`,
    );
  }
}

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

verifyMigrationHashGoldenVector();
if (process.argv.includes("--verify-migration-hash-vector")) {
  console.log(
    `Migration hash golden vector verified: ${MIGRATION_HASH_GOLDEN}`,
  );
  process.exit(0);
}

const status = git(["status", "--porcelain", "--untracked-files=all"]);
if (requireClean && status) {
  throw new Error(
    "Evidence generation requires a clean tracked and untracked source tree",
  );
}

const version = JSON.parse(
  readFileSync(resolve(root, "sahelflow.version.json"), "utf8"),
) as Record<string, unknown>;
const migrationDirectory = resolve(root, "prisma", "migrations");
const migrations = readdirSync(migrationDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )
  .map((entry) => {
    if (!/^[A-Za-z0-9_-]+$/.test(entry.name)) {
      throw new Error(
        `Migration name has unsupported characters: ${entry.name}`,
      );
    }
    const path = resolve(migrationDirectory, entry.name, "migration.sql");
    if (!existsSync(path)) {
      throw new Error(`Migration ${entry.name} is missing migration.sql`);
    }
    return { name: entry.name, sql: readFileSync(path) };
  });
if (migrations.length === 0) {
  throw new Error("No packaged migrations were found");
}

const msiDirectory = resolve(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "msi",
);
const msiDirectoryFiles = filesBelow(msiDirectory);
const signatureFiles = msiDirectoryFiles.filter((path) =>
  path.endsWith(".sig"),
);
if (signatureFiles.length > 0) {
  throw new Error(
    "Unsigned internal evidence must not contain updater signatures",
  );
}
const bundleFiles = msiDirectoryFiles.filter((path) =>
  /-UNSIGNED\.msi$/i.test(path),
);
if (bundleFiles.length !== 1) {
  throw new Error(
    `Expected exactly one explicitly UNSIGNED MSI, found ${bundleFiles.length}`,
  );
}
const runtimeFiles = filesBelow(
  resolve(root, "src-tauri", "resources", "runtime"),
).filter((path) => statSync(path).isFile());

const manifest = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    commit: git(["rev-parse", "HEAD"]),
    tree: git(["rev-parse", "HEAD^{tree}"]),
    dirty: Boolean(status),
    dirtyStatusSha256: status
      ? createHash("sha256").update(status).digest("hex")
      : null,
  },
  candidate: {
    purpose: "internal-build-evidence",
    publishable: false,
    signed: false,
    authenticode: false,
    updaterSignature: false,
  },
  version,
  migrationSetSha256: migrationSetSha256(migrations),
  lockfiles: ["bun.lock", "src-tauri/Cargo.lock"]
    .map((file) => resolve(root, file))
    .filter(existsSync)
    .map((path) => ({ file: relative(root, path), sha256: sha256(path) })),
  runtime: runtimeFiles.map((path) => ({
    file: relative(root, path).replaceAll("\\", "/"),
    size: statSync(path).size,
    sha256: sha256(path),
  })),
  artifacts: bundleFiles.map((path) => ({
    file: relative(root, path).replaceAll("\\", "/"),
    size: statSync(path).size,
    sha256: sha256(path),
    signed: false,
    authenticode: false,
    updaterSignature: false,
  })),
  claims: {
    installedWindows: false,
    migrationRecovery: false,
    accessibilityRtl: false,
    t470Performance: false,
  },
};

const outputDir = resolve(root, ".sf-evidence");
mkdirSync(outputDir, { recursive: true });
const output = resolve(outputDir, "candidate-manifest.json");
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Evidence manifest written to ${output}`);
