#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const sourceRoot = resolve(repositoryRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

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

function importsRawClient(source: string): boolean {
  NAMED_IMPORT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NAMED_IMPORT.exec(source)) !== null) {
    const specifiers = match[1]
      ?.split(",")
      .map((value) => value.trim().split(/\s+as\s+/i)[0])
      .filter(Boolean);
    const moduleName = match[2];
    if (
      specifiers?.includes("dbRaw") &&
      (moduleName === "@/lib/db" || moduleName?.endsWith("/db"))
    ) {
      return true;
    }
  }
  return false;
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
  if (!importsRawClient(source) || isAllowedRawAuthority(path)) continue;
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
