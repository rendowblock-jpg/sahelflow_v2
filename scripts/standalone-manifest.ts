import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

export const STANDALONE_MANIFEST_FILE = "sahelflow-standalone-manifest.json";
const TREE_HASH_DOMAIN = "sahelflow-standalone-tree-v1\n";

type StandaloneManifestFile = Readonly<{
  path: string;
  size: number;
  sha256: string;
}>;

export type StandaloneManifest = Readonly<{
  formatVersion: 1;
  appVersion: string;
  treeSha256: string;
  fileCount: number;
}>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesBelow(root: string, directory = root): StandaloneManifestFile[] {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    compareText(left.name, right.name),
  );
  const files: StandaloneManifestFile[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Standalone resource contains a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...filesBelow(root, path));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Standalone resource has an unsupported file type: ${path}`);
    }
    const file = relative(root, path).replaceAll("\\", "/");
    if (
      directory === root &&
      (file === STANDALONE_MANIFEST_FILE || file === ".gitkeep")
    ) {
      continue;
    }
    const size = statSync(path).size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Standalone resource has an invalid size: ${path}`);
    }
    files.push({ path: file, size, sha256: sha256(path) });
  }
  return files;
}

export function standaloneTreeSha256(
  files: readonly StandaloneManifestFile[],
): string {
  const hash = createHash("sha256");
  hash.update(TREE_HASH_DOMAIN, "utf8");
  for (const file of [...files].sort((left, right) =>
    compareText(left.path, right.path),
  )) {
    hash.update(`${Buffer.byteLength(file.path, "utf8")}:${file.path}\n`, "utf8");
    hash.update(`${file.size}:${file.sha256}\n`, "utf8");
  }
  return hash.digest("hex");
}

function currentManifest(root: string, appVersion: string): StandaloneManifest {
  if (!/^\d+\.\d+\.\d+-internal\.\d+$/.test(appVersion)) {
    throw new Error(`Standalone manifest app version is invalid: ${appVersion}`);
  }
  const files = filesBelow(root).sort((left, right) =>
    compareText(left.path, right.path),
  );
  if (!files.some((file) => file.path === "server.js")) {
    throw new Error("Standalone resources do not contain server.js");
  }
  return Object.freeze({
    formatVersion: 1,
    appVersion,
    treeSha256: standaloneTreeSha256(files),
    fileCount: files.length,
  });
}

export function writeStandaloneManifest(
  root: string,
  appVersion: string,
): StandaloneManifest {
  const manifest = currentManifest(root, appVersion);
  writeFileSync(
    resolve(root, STANDALONE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export function verifyStandaloneManifest(
  root: string,
  expectedAppVersion: string,
): StandaloneManifest {
  const path = resolve(root, STANDALONE_MANIFEST_FILE);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<StandaloneManifest>;
  if (
    parsed.formatVersion !== 1 ||
    parsed.appVersion !== expectedAppVersion ||
    typeof parsed.treeSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(parsed.treeSha256) ||
    !Number.isSafeInteger(parsed.fileCount) ||
    (parsed.fileCount ?? 0) < 1
  ) {
    throw new Error("Standalone manifest is invalid or version-mismatched");
  }
  const observed = currentManifest(root, expectedAppVersion);
  if (
    observed.fileCount !== parsed.fileCount ||
    observed.treeSha256 !== parsed.treeSha256
  ) {
    throw new Error(
      `Standalone tree mismatch: expected ${parsed.fileCount} files/${parsed.treeSha256}, observed ${observed.fileCount} files/${observed.treeSha256}`,
    );
  }
  return Object.freeze({
    formatVersion: 1,
    appVersion: expectedAppVersion,
    treeSha256: parsed.treeSha256,
    fileCount: parsed.fileCount,
  });
}
