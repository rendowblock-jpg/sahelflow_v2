#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const sourceRoot = resolve(repositoryRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

const RAW_IMPORT = /import\s*\{[\s\S]*?\bdbRaw\b[\s\S]*?\}\s*from\s*["'](?:@\/lib\/db|[^"']*\/db)["']/m;

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function isTestFile(path: string): boolean {
  return (
    path.includes("/__tests__/") ||
    /\.(?:test|spec)\.[cm]?tsx?$/.test(path)
  );
}

function isAllowedRawAuthority(path: string): boolean {
  return (
    path === "src/lib/db.ts" ||
    path.startsWith("src/lib/maintenance/") ||
    isTestFile(path)
  );
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && sourceExtensions.has(extension(path))) {
      files.push(path);
    }
  }
  return files;
}

const violations: string[] = [];
for (const absolutePath of sourceFiles(sourceRoot)) {
  const path = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const source = readFileSync(absolutePath, "utf8");
  if (!RAW_IMPORT.test(source) || isAllowedRawAuthority(path)) continue;
  violations.push(path);
}

if (violations.length > 0) {
  console.error(
    "Protected raw-client authority violation: application/domain code imported dbRaw outside maintenance or tests.",
  );
  for (const path of violations.sort()) console.error(` - ${path}`);
  process.exit(1);
}

console.log(
  "Protected raw-client authority verified: dbRaw is restricted to canonical maintenance and test boundaries.",
);
