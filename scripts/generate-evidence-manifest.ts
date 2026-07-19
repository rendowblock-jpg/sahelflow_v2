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

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
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

const status = git(["status", "--porcelain", "--untracked-files=all"]);
if (requireClean && status) {
  throw new Error("Evidence generation requires a clean tracked and untracked source tree");
}

const version = JSON.parse(
  readFileSync(resolve(root, "sahelflow.version.json"), "utf8"),
) as Record<string, unknown>;
const migrationFiles = filesBelow(resolve(root, "prisma", "migrations"))
  .filter((path) => path.endsWith("migration.sql"))
  .sort();
const migrationSetHash = createHash("sha256");
for (const path of migrationFiles) {
  migrationSetHash.update(relative(root, path).replaceAll("\\", "/"));
  migrationSetHash.update(readFileSync(path));
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
const signatureFiles = msiDirectoryFiles.filter((path) => path.endsWith(".sig"));
if (signatureFiles.length > 0) {
  throw new Error("Unsigned internal evidence must not contain updater signatures");
}
const bundleFiles = msiDirectoryFiles.filter((path) => /-UNSIGNED\.msi$/i.test(path));
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
  migrationSetSha256: migrationSetHash.digest("hex"),
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
