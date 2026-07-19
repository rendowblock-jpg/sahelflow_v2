#!/usr/bin/env bun

import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BUN_VERSION = "1.3.14";
const BUN_RELEASE = `bun-v${BUN_VERSION}`;
const BUN_ASSET = "bun-windows-x64-baseline.zip";
const BUN_URL = `https://github.com/oven-sh/bun/releases/download/${BUN_RELEASE}/${BUN_ASSET}`;
const BUN_CHECKSUM_URL = `https://github.com/oven-sh/bun/releases/download/${BUN_RELEASE}/SHASUMS256.txt`;
const BUN_ARCHIVE_SHA256 = "538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f";
const BUN_EXECUTABLE_SHA256 = "9005d0d585d80425e9b715690de3e614651124c94458ef3d3a302ca1a6d3d813";

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
if (!existsSync(engineSource)) {
  throw new Error(
    `Generated Prisma engine is missing at ${engineSource}; run bun run db:generate first`,
  );
}

const tempDir = mkdtempSync(resolve(tmpdir(), "sahelflow-runtime-"));
try {
  const archivePath = resolve(tempDir, BUN_ASSET);
  const extractDir = resolve(tempDir, "extracted");
  const response = await fetch(BUN_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Bun download failed with HTTP ${response.status}`);
  }
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  const archiveSha256 = sha256(archivePath);
  if (archiveSha256 !== BUN_ARCHIVE_SHA256) {
    throw new Error(
      `Bun archive checksum mismatch: expected ${BUN_ARCHIVE_SHA256}, found ${archiveSha256}`,
    );
  }

  mkdirSync(extractDir);
  const extraction = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:SF_BUN_ARCHIVE -DestinationPath $env:SF_BUN_EXTRACT -Force",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SF_BUN_ARCHIVE: archivePath,
        SF_BUN_EXTRACT: extractDir,
      },
    },
  );
  if (extraction.status !== 0) {
    throw new Error(extraction.stderr || "Failed to extract the pinned Bun archive");
  }

  const bunSource = resolve(
    extractDir,
    BUN_ASSET.replace(/\.zip$/, ""),
    "bun.exe",
  );
  if (!existsSync(bunSource)) {
    throw new Error(`Pinned Bun executable is missing at ${bunSource}`);
  }
  const executableSha256 = sha256(bunSource);
  if (executableSha256 !== BUN_EXECUTABLE_SHA256) {
    throw new Error(
      `Bun executable checksum mismatch: expected ${BUN_EXECUTABLE_SHA256}, found ${executableSha256}`,
    );
  }

  mkdirSync(runtimeDir, { recursive: true });
  copyFileSync(bunSource, bunTarget);
  copyFileSync(engineSource, engineTarget);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const manifest = {
  formatVersion: 2,
  platform: "windows-x64-baseline",
  bun: {
    version: BUN_VERSION,
    variant: "baseline",
    compileTarget: "bun-windows-x64-baseline",
    file: "bun.exe",
    sha256: sha256(bunTarget),
    provenance: {
      repository: "oven-sh/bun",
      release: BUN_RELEASE,
      asset: BUN_ASSET,
      url: BUN_URL,
      archiveSha256: BUN_ARCHIVE_SHA256,
      checksumUrl: BUN_CHECKSUM_URL,
    },
  },
  prismaQueryEngine: {
    file: "query_engine-windows.dll.node",
    sha256: sha256(engineTarget),
    provenance: "generated pinned @prisma/client engine from bun.lock",
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
