#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const manifestPath = resolve(root, "src-tauri", "Cargo.toml");
const lockPath = resolve(root, "src-tauri", "Cargo.lock");
const toml = (
  globalThis as typeof globalThis & {
    Bun: { TOML: { parse(input: string): unknown } };
  }
).Bun.TOML;

type CargoManifest = { package?: { name?: unknown; version?: unknown } };
type CargoLock = { package?: Array<Record<string, unknown>> };

function parseLock(text: string): CargoLock {
  return toml.parse(text) as CargoLock;
}

function normalizedLock(text: string): string {
  const parsed = parseLock(text);
  const packages = parsed.package;
  if (!Array.isArray(packages)) throw new Error("Cargo.lock has no package array");
  const roots = packages.filter((entry) => entry.name === "sahelflow");
  if (roots.length !== 1) {
    throw new Error(`Cargo.lock must contain exactly one sahelflow package, found ${roots.length}`);
  }
  roots[0]!.version = "__SAHELFLOW_ROOT_VERSION__";
  return JSON.stringify(parsed);
}

const manifest = toml.parse(readFileSync(manifestPath, "utf8")) as CargoManifest;
if (manifest.package?.name !== "sahelflow") {
  throw new Error(`Cargo.toml root package must be sahelflow, found ${String(manifest.package?.name ?? "missing")}`);
}
const expectedVersion = manifest.package.version;
if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
  throw new Error("Cargo.toml root package version is missing");
}

const before = readFileSync(lockPath, "utf8");
const parsedBefore = parseLock(before);
const packages = parsedBefore.package;
if (!Array.isArray(packages)) throw new Error("Cargo.lock has no package array");
const roots = packages.filter((entry) => entry.name === "sahelflow");
if (roots.length !== 1) {
  throw new Error(`Cargo.lock must contain exactly one sahelflow package, found ${roots.length}`);
}
const currentVersion = roots[0]!.version;
if (typeof currentVersion !== "string") throw new Error("Cargo.lock sahelflow version is missing");

if (currentVersion === expectedVersion) {
  console.log(`Cargo.lock root package already matches ${expectedVersion}`);
  process.exit(0);
}

const rootEntryPattern = /(\[\[package\]\]\r?\nname = "sahelflow"\r?\nversion = ")([^"]+)(")/g;
const matches = [...before.matchAll(rootEntryPattern)];
if (matches.length !== 1) {
  throw new Error(`Cargo.lock textual root entry must match exactly once, found ${matches.length}`);
}
if (matches[0]![2] !== currentVersion) {
  throw new Error(
    `Cargo.lock parsed/text root version mismatch: parsed ${currentVersion}, text ${matches[0]![2]}`,
  );
}

const after = before.replace(
  rootEntryPattern,
  (_match, prefix: string, _version: string, suffix: string) => `${prefix}${expectedVersion}${suffix}`,
);
if (normalizedLock(before) !== normalizedLock(after)) {
  throw new Error("Cargo.lock synchronization changed more than the sahelflow root package version");
}

writeFileSync(lockPath, after, "utf8");
console.log(`Synchronized Cargo.lock root package ${currentVersion} -> ${expectedVersion}`);
