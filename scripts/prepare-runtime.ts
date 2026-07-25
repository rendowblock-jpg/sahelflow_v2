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

const NODE_VERSION = "22.23.1";
const NODE_RELEASE = `v${NODE_VERSION}`;
const NODE_DIRECTORY = `node-v${NODE_VERSION}-win-x64`;
const NODE_ASSET = `${NODE_DIRECTORY}.zip`;
const NODE_URL = `https://nodejs.org/download/release/${NODE_RELEASE}/${NODE_ASSET}`;
const NODE_CHECKSUM_URL = `https://nodejs.org/download/release/${NODE_RELEASE}/SHASUMS256.txt`;
const NODE_ARCHIVE_SHA256 = "7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29";
const NODE_EXECUTABLE_SHA256 = "f8d162c0641dcee512132f3bcf8a68169c7ecb852efd8e1a46c9fec5a0f469ed";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const runtimeDir = resolve(root, "src-tauri", "resources", "runtime");
const nodeTarget = resolve(runtimeDir, "node.exe");
const nodeLicenseTarget = resolve(runtimeDir, "NODE-LICENSE.txt");
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
  const archivePath = resolve(tempDir, NODE_ASSET);
  const extractDir = resolve(tempDir, "extracted");
  const response = await fetch(NODE_URL, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Node.js download failed with HTTP ${response.status}`);
  }
  writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  const archiveSha256 = sha256(archivePath);
  if (archiveSha256 !== NODE_ARCHIVE_SHA256) {
    throw new Error(
      `Node.js archive checksum mismatch: expected ${NODE_ARCHIVE_SHA256}, found ${archiveSha256}`,
    );
  }

  mkdirSync(extractDir);
  const extraction = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:SF_NODE_ARCHIVE -DestinationPath $env:SF_NODE_EXTRACT -Force",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SF_NODE_ARCHIVE: archivePath,
        SF_NODE_EXTRACT: extractDir,
      },
    },
  );
  if (extraction.status !== 0) {
    throw new Error(extraction.stderr || "Failed to extract the pinned Node.js archive");
  }

  const nodeSource = resolve(extractDir, NODE_DIRECTORY, "node.exe");
  const nodeLicenseSource = resolve(extractDir, NODE_DIRECTORY, "LICENSE");
  if (!existsSync(nodeSource)) {
    throw new Error(`Pinned Node.js executable is missing at ${nodeSource}`);
  }
  if (!existsSync(nodeLicenseSource)) {
    throw new Error(`Pinned Node.js license is missing at ${nodeLicenseSource}`);
  }
  const executableSha256 = sha256(nodeSource);
  if (executableSha256 !== NODE_EXECUTABLE_SHA256) {
    throw new Error(
      `Node.js executable checksum mismatch: expected ${NODE_EXECUTABLE_SHA256}, found ${executableSha256}`,
    );
  }

  mkdirSync(runtimeDir, { recursive: true });
  rmSync(resolve(runtimeDir, "bun.exe"), { force: true });
  copyFileSync(nodeSource, nodeTarget);
  copyFileSync(nodeLicenseSource, nodeLicenseTarget);
  copyFileSync(engineSource, engineTarget);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const manifest = {
  formatVersion: 3,
  platform: "windows-x64",
  node: {
    version: NODE_VERSION,
    file: "node.exe",
    sha256: sha256(nodeTarget),
    licenseFile: "NODE-LICENSE.txt",
    licenseSha256: sha256(nodeLicenseTarget),
    provenance: {
      project: "nodejs/node",
      release: NODE_RELEASE,
      asset: NODE_ASSET,
      url: NODE_URL,
      archiveSha256: NODE_ARCHIVE_SHA256,
      checksumUrl: NODE_CHECKSUM_URL,
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
console.log(`Node.js ${manifest.node.version}: ${manifest.node.sha256}`);
console.log(`Prisma engine: ${manifest.prismaQueryEngine.sha256}`);
