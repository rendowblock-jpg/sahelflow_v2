#!/usr/bin/env bun

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const runtimeDir = resolve(root, "src-tauri", "resources", "runtime");
const bunTarget = resolve(runtimeDir, "bun.exe");
const engineSource = resolve(
  root,
  "node_modules",
  ".prisma",
  "client",
  "query_engine-windows.dll.node",
);
const engineTarget = resolve(runtimeDir, "query_engine-windows.dll.node");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("SahelFlow 1.0 runtime preparation supports Windows x64 only");
}
if (basename(process.execPath).toLowerCase() !== "bun.exe") {
  throw new Error("Run runtime preparation with Bun so the exact build runtime can be bundled");
}
if (!existsSync(engineSource)) {
  throw new Error(
    `Generated Prisma engine is missing at ${engineSource}; run bun run db:generate first`,
  );
}

mkdirSync(runtimeDir, { recursive: true });
copyFileSync(process.execPath, bunTarget);
copyFileSync(engineSource, engineTarget);

const manifest = {
  formatVersion: 1,
  platform: "windows-x64",
  bun: {
    version: process.versions.bun ?? "unknown",
    file: "bun.exe",
    sha256: sha256(bunTarget),
  },
  prismaQueryEngine: {
    file: "query_engine-windows.dll.node",
    sha256: sha256(engineTarget),
  },
};
writeFileSync(
  resolve(runtimeDir, "runtime-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared pinned Windows runtime in ${runtimeDir}`);
console.log(`Bun ${manifest.bun.version}: ${manifest.bun.sha256}`);
console.log(`Prisma engine: ${manifest.prismaQueryEngine.sha256}`);
