#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const cargoManifest = "src-tauri/Cargo.toml";
const standalonePlaceholder = "src-tauri/resources/standalone/.gitkeep";
const allowedTrackedChanges = new Set([cargoManifest, standalonePlaceholder]);
const toml = (
  globalThis as typeof globalThis & {
    Bun: { TOML: { parse(input: string): unknown } };
  }
).Bun.TOML;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function git(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

function parsedToml(text: string): string {
  return JSON.stringify(stable(toml.parse(text)));
}

function statusPath(line: string): string {
  const raw = line.slice(3).trim();
  const renamed = raw.includes(" -> ") ? raw.split(" -> ").at(-1)! : raw;
  return renamed.replaceAll("\\", "/");
}

const sourceCommit = requireEnv("SF_SOURCE_COMMIT");
const sourceTree = requireEnv("SF_SOURCE_TREE");
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  throw new Error(`SF_SOURCE_COMMIT is invalid: ${sourceCommit}`);
}
if (!/^[0-9a-f]{40}$/.test(sourceTree)) {
  throw new Error(`SF_SOURCE_TREE is invalid: ${sourceTree}`);
}

const observedCommit = git(["rev-parse", "HEAD"]);
const observedTree = git(["rev-parse", "HEAD^{tree}"]);
if (observedCommit !== sourceCommit) {
  throw new Error(
    `source commit changed during build: expected ${sourceCommit}, found ${observedCommit}`,
  );
}
if (observedTree !== sourceTree) {
  throw new Error(
    `source tree changed during build: expected ${sourceTree}, found ${observedTree}`,
  );
}

const status = git(["status", "--porcelain=v1", "--untracked-files=no"]);
const lines = status ? status.split(/\r?\n/).filter(Boolean) : [];
const changedPaths = lines.map(statusPath);
const unexpected = changedPaths.filter((path) => !allowedTrackedChanges.has(path));
if (unexpected.length > 0) {
  throw new Error(
    `build modified unexpected tracked source:\n${lines.join("\n")}`,
  );
}

if (changedPaths.includes(cargoManifest)) {
  const currentPath = resolve(root, cargoManifest);
  if (!existsSync(currentPath)) {
    throw new Error(`${cargoManifest} was removed during build`);
  }
  const committed = git(["show", `${sourceCommit}:${cargoManifest}`]);
  const current = readFileSync(currentPath, "utf8");
  if (parsedToml(committed) !== parsedToml(current)) {
    const diff = git(["diff", "--no-ext-diff", "--", cargoManifest]);
    throw new Error(
      `Tauri packaging changed Cargo.toml semantics; evidence is blocked:\n${diff}`,
    );
  }
}

for (const path of changedPaths) {
  git(["restore", `--source=${sourceCommit}`, "--worktree", "--", path]);
}

const remaining = git(["status", "--porcelain=v1", "--untracked-files=no"]);
if (remaining) {
  throw new Error(
    `tracked source is not clean after deterministic restoration:\n${remaining}`,
  );
}

if (git(["rev-parse", "HEAD"]) !== sourceCommit) {
  throw new Error("source commit changed while restoring deterministic build rewrites");
}
if (git(["rev-parse", "HEAD^{tree}"]) !== sourceTree) {
  throw new Error("source tree changed while restoring deterministic build rewrites");
}

console.log(
  changedPaths.length === 0
    ? `Tracked source remained clean for ${sourceCommit}`
    : `Verified and restored deterministic build rewrites: ${changedPaths.join(", ")}`,
);
