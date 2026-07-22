#!/usr/bin/env bun

import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function run(
  command: string,
  args: string[],
  cwd = root,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

const sourceCommit = requireEnv("SF_SOURCE_COMMIT");
const sourceTree = requireEnv("SF_SOURCE_TREE");
const msiPath = resolve(requireEnv("SF_MSI_PATH"));
const signaturePath = resolve(requireEnv("SF_MSI_SIG_PATH"));
const releaseTag = requireEnv("SF_RELEASE_TAG");
const runnerTemp = resolve(requireEnv("RUNNER_TEMP"));
const runId = requireEnv("GITHUB_RUN_ID");

if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error(`SF_SOURCE_COMMIT is invalid: ${sourceCommit}`);
}
if (!/^[0-9a-f]{40}$/.test(sourceTree)) {
  throw new Error(`SF_SOURCE_TREE is invalid: ${sourceTree}`);
}
if (!existsSync(msiPath)) throw new Error(`MSI is missing: ${msiPath}`);
if (!existsSync(signaturePath)) {
  throw new Error(`MSI updater signature is missing: ${signaturePath}`);
}

const currentCommit = run("git", ["rev-parse", "HEAD"]);
const currentTree = run("git", ["rev-parse", "HEAD^{tree}"]);
if (currentCommit !== sourceCommit) {
  throw new Error(
    `source commit changed during build: expected ${sourceCommit}, found ${currentCommit}`,
  );
}
if (currentTree !== sourceTree) {
  throw new Error(
    `source tree changed during build: expected ${sourceTree}, found ${currentTree}`,
  );
}

// The packaging worktree may contain one verified, formatting-only Cargo.toml
// rewrite. Re-run the fail-closed verifier here so evidence generation never
// depends only on workflow step ordering.
const sourceVerification = run(
  "bun",
  ["run", "scripts/verify-release-source.ts"],
  root,
  process.env,
);
if (sourceVerification) console.log(sourceVerification);

const evidenceRoot = resolve(
  runnerTemp,
  `sahelflow-evidence-${runId}-${sourceCommit.slice(0, 12)}`,
);
if (existsSync(evidenceRoot)) {
  throw new Error(`evidence worktree path already exists: ${evidenceRoot}`);
}

run("git", ["worktree", "add", "--detach", evidenceRoot, sourceCommit]);
const initialEvidenceStatus = run(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  evidenceRoot,
);
if (initialEvidenceStatus) {
  throw new Error(
    `detached evidence worktree is not clean:\n${initialEvidenceStatus}`,
  );
}

const evidenceMsiDirectory = resolve(
  evidenceRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "msi",
);
mkdirSync(evidenceMsiDirectory, { recursive: true });
cpSync(msiPath, resolve(evidenceMsiDirectory, msiPath.split(/[\\/]/).at(-1)!));
cpSync(
  signaturePath,
  resolve(evidenceMsiDirectory, signaturePath.split(/[\\/]/).at(-1)!),
);

const runtimeSource = resolve(root, "src-tauri", "resources", "runtime");
if (!existsSync(runtimeSource)) {
  throw new Error(`runtime evidence directory is missing: ${runtimeSource}`);
}
const runtimeDestination = resolve(
  evidenceRoot,
  "src-tauri",
  "resources",
  "runtime",
);
mkdirSync(dirname(runtimeDestination), { recursive: true });
cpSync(runtimeSource, runtimeDestination, { recursive: true });

const standaloneSource = resolve(root, "src-tauri", "resources", "standalone");
const standaloneDestination = resolve(
  evidenceRoot,
  "src-tauri",
  "resources",
  "standalone",
);
if (!existsSync(standaloneSource)) {
  throw new Error(`standalone evidence directory is missing: ${standaloneSource}`);
}
rmSync(standaloneDestination, { recursive: true, force: true });
mkdirSync(dirname(standaloneDestination), { recursive: true });
cpSync(standaloneSource, standaloneDestination, { recursive: true });

const copiedEvidenceStatus = run(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  evidenceRoot,
);
if (copiedEvidenceStatus) {
  throw new Error(
    `approved artifacts are not isolated by repository ignore rules:\n${copiedEvidenceStatus}`,
  );
}

const evidenceResult = spawnSync(
  "bun",
  [
    "run",
    "scripts/generate-evidence-manifest.ts",
    "--require-clean",
    "--signed-updater",
  ],
  {
    cwd: evidenceRoot,
    env: {
      ...process.env,
      SF_REPO_DIR: evidenceRoot,
      SF_RELEASE_TAG: releaseTag,
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (evidenceResult.status !== 0) {
  throw new Error(
    `clean-worktree evidence generation failed:\n${evidenceResult.stderr || evidenceResult.stdout}`,
  );
}
if (evidenceResult.stdout.trim()) console.log(evidenceResult.stdout.trim());

const evidenceManifest = resolve(
  evidenceRoot,
  ".sf-evidence",
  "candidate-manifest.json",
);
if (!existsSync(evidenceManifest)) {
  throw new Error(`candidate evidence manifest is missing: ${evidenceManifest}`);
}
const retainedManifest = resolve(root, ".sf-evidence", "candidate-manifest.json");
mkdirSync(dirname(retainedManifest), { recursive: true });
cpSync(evidenceManifest, retainedManifest);

console.log(
  `Clean source evidence retained for ${sourceCommit} at ${retainedManifest}`,
);
