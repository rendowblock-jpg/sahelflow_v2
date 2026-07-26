#!/usr/bin/env bun

import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { basename, isAbsolute, resolve } from "node:path";
import { STANDALONE_MANIFEST_FILE } from "./standalone-manifest";

type BunSubprocess = Readonly<{
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  exitCode: number | null;
  kill: () => void;
}>;

type BunRuntime = Readonly<{
  spawn: (
    command: string[],
    options: Readonly<{
      cwd: string;
      env: Record<string, string>;
      stdout: "pipe";
      stderr: "pipe";
    }>,
  ) => BunSubprocess;
  sleep: (milliseconds: number) => Promise<void>;
}>;

const bunRuntime = (globalThis as unknown as { Bun: BunRuntime }).Bun;
const NODE_ENTRYPOINT_BOOTSTRAP =
  "(entry=>{if(!entry)throw(Error('SF_NODE_ENTRYPOINT_missing'));if(entry.length<3||entry[1]!==':'||entry[2]!=='/')throw(Error('SF_NODE_ENTRYPOINT_invalid'));process.argv[1]=entry;require(entry)})(process.env.SF_NODE_ENTRYPOINT)";

function nodeEntrypointPath(value: string): string {
  const conventional = value.startsWith("\\\\?\\") ? value.slice(4) : value;
  const normalized = conventional.replaceAll("\\", "/");
  if (!/^[A-Za-z]:\//.test(normalized)) {
    throw new Error("staged Node entrypoint is not an absolute local drive path");
  }
  return normalized;
}

const root = process.cwd();
const dataDir = process.env.SF_DATA_DIR;
const databaseUrl = process.env.DATABASE_URL;
if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("Packaged runtime smoke supports Windows x64 only");
}
if (!dataDir || !isAbsolute(dataDir)) {
  throw new Error("SF_DATA_DIR must be an absolute path");
}
if (!databaseUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL must be an absolute file URL");
}

const databasePath = databaseUrl.slice("file:".length);
if (!isAbsolute(databasePath)) {
  throw new Error("DATABASE_URL must contain an absolute SQLite path");
}
const sourceStandalone = resolve(root, "src-tauri", "resources", "standalone");
const bundledNode = resolve(root, "src-tauri", "resources", "runtime", "node.exe");
const runtimeManifestPath = resolve(
  root,
  "src-tauri",
  "resources",
  "runtime",
  "runtime-manifest.json",
);
const queryEngine = resolve(
  root,
  "src-tauri",
  "resources",
  "runtime",
  "query_engine-windows.dll.node",
);
const migrations = resolve(root, "prisma", "migrations");
const authority = JSON.parse(
  readFileSync(resolve(root, "sahelflow.version.json"), "utf8"),
) as { version?: unknown };
if (typeof authority.version !== "string") {
  throw new Error("version authority is missing");
}
for (const required of [
  sourceStandalone,
  bundledNode,
  runtimeManifestPath,
  queryEngine,
  databasePath,
]) {
  if (!existsSync(required)) {
    throw new Error(`Packaged runtime smoke input is missing: ${required}`);
  }
}
const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8")) as {
  formatVersion?: unknown;
  node?: { file?: unknown; sha256?: unknown; licenseFile?: unknown };
};
const nodeSha256 = createHash("sha256")
  .update(readFileSync(bundledNode))
  .digest("hex");
if (
  runtimeManifest.formatVersion !== 3 ||
  runtimeManifest.node?.file !== "node.exe" ||
  runtimeManifest.node?.sha256 !== nodeSha256 ||
  runtimeManifest.node?.licenseFile !== "NODE-LICENSE.txt" ||
  !existsSync(resolve(root, "src-tauri", "resources", "runtime", "NODE-LICENSE.txt"))
) {
  throw new Error("packaged Node.js runtime manifest is invalid or incomplete");
}
const packagedManifest = JSON.parse(
  readFileSync(resolve(sourceStandalone, STANDALONE_MANIFEST_FILE), "utf8"),
) as {
  formatVersion?: unknown;
  appVersion?: unknown;
  treeSha256?: unknown;
  fileCount?: unknown;
};
if (
  packagedManifest.formatVersion !== 1 ||
  packagedManifest.appVersion !== authority.version ||
  typeof packagedManifest.treeSha256 !== "string" ||
  !/^[0-9a-f]{64}$/.test(packagedManifest.treeSha256) ||
  !Number.isSafeInteger(packagedManifest.fileCount) ||
  Number(packagedManifest.fileCount) < 1
) {
  throw new Error("packaged standalone manifest is invalid or version-mismatched");
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("could not allocate a loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

const stageParent = process.env.TEMP ?? process.env.TMP;
if (!stageParent || !isAbsolute(stageParent)) {
  throw new Error("Windows temporary directory is unavailable");
}
const stage = mkdtempSync(resolve(stageParent, "SahelFlow Program Files runtime smoke-"));
const stagedStandalone = resolve(stage, "standalone");
const stagedRuntime = resolve(stage, "runtime");
const stagedWork = resolve(stage, "runtime-work");
const logPath = resolve(root, ".sf-windows-runtime-smoke.log");
let child: BunSubprocess | null = null;
let stdoutPromise: Promise<string> | null = null;
let stderrPromise: Promise<string> | null = null;
let stdout = "";
let stderr = "";

try {
  cpSync(sourceStandalone, stagedStandalone, { recursive: true });
  cpSync(resolve(root, "src-tauri", "resources", "runtime"), stagedRuntime, {
    recursive: true,
  });
  mkdirSync(stagedWork);
  const stagedServer = resolve(stagedStandalone, "server.js");
  const stagedNode = resolve(stagedRuntime, "node.exe");
  const stagedQueryEngine = resolve(
    stagedRuntime,
    "query_engine-windows.dll.node",
  );
  if (!existsSync(stagedServer)) {
    throw new Error("staged server.js is missing");
  }
  const stagedNodeEntrypoint = nodeEntrypointPath(stagedServer);

  const port = await availablePort();
  const sidecarPort = await availablePort();
  const instanceId = randomBytes(16).toString("hex");
  const runtimeToken = randomBytes(32).toString("hex");
  const appToken = randomBytes(32).toString("hex");
  const sidecarToken = randomBytes(32).toString("hex");
  const databaseFile = basename(databasePath);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    resolve(dataDir, "shop-registry.json"),
    `${JSON.stringify(
      {
        formatVersion: 1,
        revision: 1,
        installationId: "windows-packaged-runtime-smoke",
        activeShopId: "test",
        shops: [
          {
            id: "test",
            name: "Windows Runtime Smoke",
            databaseFile,
            icon: null,
            createdAt: "1970-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const parentEnvironment = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP"]
      .map((name) => [name, process.env[name]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const environment: Record<string, string> = {
    ...parentEnvironment,
    DATABASE_URL: `file:${databasePath}`,
    SF_DATA_DIR: dataDir,
    SIDECAR_TOKEN: sidecarToken,
    SIDECAR_TOKEN_FILE: resolve(stage, "sidecar-token"),
    PRISMA_MIGRATIONS_DIR: migrations,
    PRISMA_QUERY_ENGINE_LIBRARY: stagedQueryEngine,
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    SF_APP_URL: `http://127.0.0.1:${port}`,
    SF_RUNTIME_INSTANCE_ID: instanceId,
    SF_RUNTIME_TOKEN: runtimeToken,
    SF_RUNTIME_APP_TOKEN: appToken,
    SF_RUNTIME_PORT: String(port),
    SF_RUNTIME_MANIFEST_PATH: resolve(stage, "runtime-endpoint.json"),
    SF_MIGRATION_STATUS: "ready",
    SF_ACTIVE_SHOP_ID: "test",
    SF_REGISTRY_REVISION: "1",
    SF_MIGRATION_SET_SHA256: "0".repeat(64),
    WHATSAPP_SIDECAR_URL: `http://127.0.0.1:${sidecarPort}`,
    WHATSAPP_SIDECAR_PORT: String(sidecarPort),
    APP_VERSION: authority.version,
    NODE_ENV: "production",
    SF_AUTH_MODE: "setup",
    SF_NODE_ENTRYPOINT: stagedNodeEntrypoint,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  child = bunRuntime.spawn([stagedNode, "--eval", NODE_ENTRYPOINT_BOOTSTRAP], {
    cwd: stagedWork,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  stdoutPromise = new Response(child.stdout).text();
  stderrPromise = new Response(child.stderr).text();

  const deadline = Date.now() + 30_000;
  let readyBody: Record<string, unknown> | null = null;
  let lastResponse = "no response";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/internal/runtime-ready`,
        {
          headers: { Authorization: `Bearer ${runtimeToken}` },
          cache: "no-store",
        },
      );
      const text = await response.text();
      lastResponse = `HTTP ${response.status}: ${text}`;
      if (response.ok) {
        readyBody = JSON.parse(text) as Record<string, unknown>;
        break;
      }
    } catch (error) {
      lastResponse = error instanceof Error ? error.message : String(error);
    }
    await bunRuntime.sleep(250);
  }

  const checks = readyBody?.checks as Record<string, unknown> | undefined;
  if (
    !readyBody ||
    readyBody.status !== "ready" ||
    readyBody.instanceId !== instanceId ||
    readyBody.appVersion !== authority.version ||
    readyBody.shopId !== "test" ||
    readyBody.registryRevision !== 1 ||
    readyBody.migrationSetSha256 !== "0".repeat(64) ||
    !checks ||
    ["app", "database", "migration", "registry", "shop", "auth"].some(
      (name) => checks[name] !== "ready",
    )
  ) {
    throw new Error(
      `staged packaged runtime did not become ready; child exit ${String(child.exitCode)}; ${lastResponse}`,
    );
  }
  console.log(
    `Staged packaged runtime verified: ${authority.version}; HTTP 200; process ${String(readyBody.processId)}; port ${port}`,
  );
} finally {
  if (child && child.exitCode === null) child.kill();
  if (child) {
    await Promise.race([child.exited, bunRuntime.sleep(5_000)]);
    stdout = stdoutPromise ? await stdoutPromise : "";
    stderr = stderrPromise ? await stderrPromise : "";
  }
  writeFileSync(
    logPath,
    ["STDOUT", stdout, "STDERR", stderr].join("\n"),
    "utf8",
  );
  rmSync(stage, { recursive: true, force: true });
}
