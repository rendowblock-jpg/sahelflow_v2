#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const cargoManifest = "src-tauri/Cargo.toml";
const cargoLock = "src-tauri/Cargo.lock";
const generatedTauriIcons = [
  "src-tauri/icons/32x32.png",
  "src-tauri/icons/128x128.png",
  "src-tauri/icons/128x128@2x.png",
  "src-tauri/icons/icon.icns",
  "src-tauri/icons/icon.ico",
  "src-tauri/icons/icon.png",
] as const;
// The signed release workflow deliberately regenerates these tracked desktop
// icon outputs from public/icons/sahelflow-mark.png before packaging. Cargo may
// also format Cargo.toml and regenerate only the root package version recorded
// in Cargo.lock after a synchronized application version bump. Every permitted
// source rewrite is verified semantically below; all other tracked changes fail.
const allowedTrackedChanges = new Set<string>([
  cargoManifest,
  ...generatedTauriIcons,
]);
allowedTrackedChanges.add(cargoLock);
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
  return result.stdout.trimEnd();
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

function normalizedCargoLock(text: string): { normalized: string; rootVersion: string } {
  const parsed = toml.parse(text) as { package?: Array<Record<string, unknown>> };
  const packages = parsed.package;
  if (!Array.isArray(packages)) throw new Error("Cargo.lock has no package array");
  const roots = packages.filter((entry) => entry.name === "sahelflow");
  if (roots.length !== 1) throw new Error(`Cargo.lock must contain exactly one sahelflow package, found ${roots.length}`);
  const rootPackage = roots[0]!;
  if (typeof rootPackage.version !== "string") throw new Error("Cargo.lock sahelflow package version is missing");
  const rootVersion = rootPackage.version;
  rootPackage.version = "__SAHELFLOW_ROOT_VERSION__";
  return { normalized: JSON.stringify(stable(parsed)), rootVersion };
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
const changed = lines.map((line) => ({
  code: line.slice(0, 2),
  path: statusPath(line),
  line,
}));

const unexpected = changed.filter(
  ({ code, path }) => !allowedTrackedChanges.has(path) || code !== " M",
);
if (unexpected.length > 0) {
  throw new Error(
    `build modified unexpected tracked source:\n${lines.join("\n")}`,
  );
}

if (changed.some(({ path }) => path === cargoManifest)) {
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

if (changed.some(({ path }) => path === cargoLock)) {
  const currentPath = resolve(root, cargoLock);
  if (!existsSync(currentPath)) throw new Error(`${cargoLock} was removed during build`);
  const committedText = git(["show", `${sourceCommit}:${cargoLock}`]);
  const currentText = readFileSync(currentPath, "utf8");
  const committed = normalizedCargoLock(committedText);
  const current = normalizedCargoLock(currentText);
  const authority = JSON.parse(readFileSync(resolve(root, "sahelflow.version.json"), "utf8")) as { version?: string };
  if (current.rootVersion !== authority.version) {
    throw new Error(`Cargo.lock root package version ${current.rootVersion} does not equal committed version authority ${authority.version ?? "missing"}`);
  }
  if (committed.normalized !== current.normalized) {
    const diff = git(["diff", "--no-ext-diff", "--", cargoLock]);
    throw new Error(`Cargo regenerated more than the sahelflow root package version in Cargo.lock; evidence is blocked:\n${diff}`);
  }
}

console.log(
  changed.length === 0
    ? `Tracked source remained clean for ${sourceCommit}`
    : `Verified approved deterministic packaging rewrite without restoring the build worktree: ${changed.map(({ path }) => path).join(", ")}`,
);
