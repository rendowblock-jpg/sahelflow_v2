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
const BUN_COMPILER_VERSION = "1.3.14";
const BUN_COMPILER_RELEASE = `bun-v${BUN_COMPILER_VERSION}`;
const BUN_COMPILER_ASSET = "bun-windows-x64-baseline.zip";
const BUN_COMPILER_URL = `https://github.com/oven-sh/bun/releases/download/${BUN_COMPILER_RELEASE}/${BUN_COMPILER_ASSET}`;
const BUN_COMPILER_CHECKSUM_URL = `https://github.com/oven-sh/bun/releases/download/${BUN_COMPILER_RELEASE}/SHASUMS256.txt`;
const BUN_COMPILER_ARCHIVE_SHA256 = "538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f";
const BUN_COMPILER_EXECUTABLE_SHA256 = "9005d0d585d80425e9b715690de3e614651124c94458ef3d3a302ca1a6d3d813";

const DOWNLOAD_RETRY_DELAYS_MS = [0, 1_500, 4_000, 8_000] as const;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const runtimeDir = resolve(root, "src-tauri", "resources", "runtime");
const nodeTarget = resolve(runtimeDir, "node.exe");
const nodeLicenseTarget = resolve(runtimeDir, "NODE-LICENSE.txt");
const buildToolsDir = resolve(root, ".sf-build", "tools");
const bunCompilerTarget = resolve(
  buildToolsDir,
  "bun-windows-x64-baseline.exe",
);
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function downloadPinnedAsset(url: string, label: string): Promise<Buffer> {
  let lastFailure = `${label} download failed`;

  for (let attempt = 0; attempt < DOWNLOAD_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = DOWNLOAD_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) {
      await sleep(delay);
    }

    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }

      lastFailure = `${label} download failed with HTTP ${response.status}`;
      const retryable = RETRYABLE_HTTP_STATUSES.has(response.status);
      if (!retryable || attempt === DOWNLOAD_RETRY_DELAYS_MS.length - 1) {
        throw new Error(lastFailure);
      }

      await response.body?.cancel().catch(() => undefined);
      console.warn(
        `${lastFailure}; retrying pinned asset (${attempt + 2}/${DOWNLOAD_RETRY_DELAYS_MS.length})`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === lastFailure &&
        /^.+ download failed with HTTP \d+$/.test(error.message)
      ) {
        throw error;
      }

      lastFailure = `${label} download failed: ${errorMessage(error)}`;
      if (attempt === DOWNLOAD_RETRY_DELAYS_MS.length - 1) {
        throw new Error(
          `${label} download failed after ${DOWNLOAD_RETRY_DELAYS_MS.length} attempts: ${errorMessage(error)}`,
          { cause: error },
        );
      }
      console.warn(
        `${lastFailure}; retrying pinned asset (${attempt + 2}/${DOWNLOAD_RETRY_DELAYS_MS.length})`,
      );
    }
  }

  throw new Error(lastFailure);
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
  writeFileSync(
    archivePath,
    await downloadPinnedAsset(NODE_URL, "Node.js"),
  );
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

  const bunArchivePath = resolve(tempDir, BUN_COMPILER_ASSET);
  const bunExtractDir = resolve(tempDir, "bun-compiler");
  writeFileSync(
    bunArchivePath,
    await downloadPinnedAsset(BUN_COMPILER_URL, "Bun compiler"),
  );
  const bunArchiveSha256 = sha256(bunArchivePath);
  if (bunArchiveSha256 !== BUN_COMPILER_ARCHIVE_SHA256) {
    throw new Error(
      `Bun compiler archive checksum mismatch: expected ${BUN_COMPILER_ARCHIVE_SHA256}, found ${bunArchiveSha256}`,
    );
  }

  mkdirSync(bunExtractDir);
  const bunExtraction = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:SF_BUN_COMPILER_ARCHIVE -DestinationPath $env:SF_BUN_COMPILER_EXTRACT -Force",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SF_BUN_COMPILER_ARCHIVE: bunArchivePath,
        SF_BUN_COMPILER_EXTRACT: bunExtractDir,
      },
    },
  );
  if (bunExtraction.status !== 0) {
    throw new Error(
      bunExtraction.stderr || "Failed to extract the pinned Bun compiler",
    );
  }

  const bunCompilerSource = resolve(
    bunExtractDir,
    BUN_COMPILER_ASSET.replace(/\.zip$/, ""),
    "bun.exe",
  );
  if (!existsSync(bunCompilerSource)) {
    throw new Error(
      `Pinned Bun compiler executable is missing at ${bunCompilerSource}`,
    );
  }
  const bunCompilerSha256 = sha256(bunCompilerSource);
  if (bunCompilerSha256 !== BUN_COMPILER_EXECUTABLE_SHA256) {
    throw new Error(
      `Bun compiler executable checksum mismatch: expected ${BUN_COMPILER_EXECUTABLE_SHA256}, found ${bunCompilerSha256}`,
    );
  }

  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(buildToolsDir, { recursive: true });
  rmSync(resolve(runtimeDir, "bun.exe"), { force: true });
  copyFileSync(nodeSource, nodeTarget);
  copyFileSync(nodeLicenseSource, nodeLicenseTarget);
  copyFileSync(engineSource, engineTarget);
  copyFileSync(bunCompilerSource, bunCompilerTarget);
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
const bunCompilerManifest = {
  formatVersion: 1,
  role: "build-only-sidecar-compiler",
  packaged: false,
  bun: {
    version: BUN_COMPILER_VERSION,
    variant: "baseline",
    compileTarget: "bun-windows-x64-baseline",
    file: "bun-windows-x64-baseline.exe",
    sha256: sha256(bunCompilerTarget),
    provenance: {
      repository: "oven-sh/bun",
      release: BUN_COMPILER_RELEASE,
      asset: BUN_COMPILER_ASSET,
      url: BUN_COMPILER_URL,
      archiveSha256: BUN_COMPILER_ARCHIVE_SHA256,
      checksumUrl: BUN_COMPILER_CHECKSUM_URL,
    },
  },
};
writeFileSync(
  resolve(buildToolsDir, "bun-compiler-manifest.json"),
  `${JSON.stringify(bunCompilerManifest, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared pinned Windows runtime in ${runtimeDir}`);
console.log(`Node.js ${manifest.node.version}: ${manifest.node.sha256}`);
console.log(`Prisma engine: ${manifest.prismaQueryEngine.sha256}`);
console.log(
  `Build-only Bun compiler ${bunCompilerManifest.bun.version}: ${bunCompilerManifest.bun.sha256}`,
);
