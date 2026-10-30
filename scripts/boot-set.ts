#!/usr/bin/env bun
/**
 * Boot set: the files of the packaged standalone tree that the server really
 * opens to start and render its first pages. The native shell reads these
 * first (and only these) instead of reading all ~4,750 files of the tree.
 *
 * The parsing and checking are pure functions (tests/boot-set.test.ts); the
 * command line at the bottom is the only part that touches the disk.
 *
 *   bun run scripts/boot-set.ts --from-strace FILE --tree DIR [--out FILE]
 *   bun run scripts/boot-set.ts --verify FILE --tree DIR
 *   bun run scripts/boot-set.ts --summary FILE --tree DIR
 */
import { lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { posix, resolve } from "node:path";

export type TreeEntry = Readonly<{ path: string; size: number; kind: "file" | "symlink" }>;
export type BootSetEntry = Readonly<{ path: string; size: number; native?: true }>;
export type BootSetManifest = Readonly<{
  formatVersion: 1;
  fileCount: number;
  totalBytes: number;
  entries: readonly BootSetEntry[];
}>;
export type StraceAnalysis = Readonly<{
  manifest: BootSetManifest;
  directoriesScanned: number;
  failedOpens: number;
}>;
export type VerifyResult = Readonly<{ ok: boolean; problems: string[] }>;

/** Files the shell must always warm. A manifest that lacks one is refused. */
export const REQUIRED_ENTRY_RULES: readonly { name: string; test: RegExp }[] = [
  { name: "server entry", test: /^server\.js$/ },
  { name: "middleware", test: /^\.next\/server\/(?:middleware|proxy)\.js$/ },
  { name: "prisma query engine", test: /(?:^|\/)(?:lib)?query_engine[^/]*\.node$/ },
  { name: "sqlite binary", test: /(?:^|\/)[^/]*sqlite[^/]*\.node$/ },
];

// Compiled binaries differ per platform (a Linux trace names .so.node files, the
// Windows tree has .dll.node), so the shell may skip these when they are absent.
const NATIVE_FILE = /\.(?:node|so|dll|dylib|exe)$|\.so\.\d/;

const OPEN_DONE =
  /^(openat|open)\((?:(AT_FDCWD|-?\d+),\s*)?"((?:[^"\\]|\\.)*)",\s*([^)]*?)\)\s*=\s*(-?\d+)/;
const OPEN_UNFINISHED =
  /^(openat|open)\((?:(AT_FDCWD|-?\d+),\s*)?"((?:[^"\\]|\\.)*)",\s*([^)]*?)\s*<unfinished \.\.\.>\s*$/;
const OPEN_RESUMED = /^<\.\.\. (?:openat|open) resumed>.*?\)\s*=\s*(-?\d+)/;
const PID_PREFIX = /^(?:\[pid\s+(\d+)\]\s+|(\d+)\s+)/;

type PendingOpen = Readonly<{ dirfd: string | undefined; path: string; flags: string }>;

function unescapeStracePath(raw: string): string {
  return raw.replace(/\\(["\\])/g, "$1");
}

/** Every directory that holds at least one listed file, as a tree-relative path. */
function directorySet(tree: readonly TreeEntry[]): Set<string> {
  const directories = new Set<string>();
  for (const entry of tree) {
    const parts = entry.path.split("/");
    for (let end = 1; end < parts.length; end += 1) directories.add(parts.slice(0, end).join("/"));
  }
  return directories;
}

export function analyzeStrace(
  text: string,
  root: string,
  tree: readonly TreeEntry[],
): StraceAnalysis {
  const rootPath = posix.normalize(root).replace(/\/+$/, "");
  const kinds = new Map(tree.map((entry) => [entry.path, entry]));
  const directories = directorySet(tree);
  const pending = new Map<string, PendingOpen>();
  const seen = new Set<string>();
  const scanned = new Set<string>();
  const entries: BootSetEntry[] = [];
  let failedOpens = 0;

  const handle = (open: PendingOpen, result: number): void => {
    let absolute: string;
    if (open.path.startsWith("/")) absolute = posix.normalize(open.path);
    else if (open.dirfd === undefined || open.dirfd === "AT_FDCWD") absolute = posix.join(rootPath, open.path);
    else return; // relative to a descriptor we cannot resolve
    if (absolute !== rootPath && !absolute.startsWith(`${rootPath}/`)) return;
    const relative = absolute === rootPath ? "" : absolute.slice(rootPath.length + 1);
    if (result < 0) {
      failedOpens += 1;
      return;
    }
    if (relative === "" || directories.has(relative)) {
      scanned.add(relative);
      return;
    }
    const found = kinds.get(relative);
    if (found === undefined || found.kind !== "file" || seen.has(relative)) return;
    seen.add(relative);
    entries.push(NATIVE_FILE.test(relative) ? { path: relative, size: found.size, native: true } : { path: relative, size: found.size });
  };

  for (const rawLine of text.split("\n")) {
    const pidMatch = PID_PREFIX.exec(rawLine);
    const pid = pidMatch ? (pidMatch[1] ?? pidMatch[2] ?? "0") : "0";
    const line = pidMatch ? rawLine.slice(pidMatch[0].length) : rawLine;
    const unfinished = OPEN_UNFINISHED.exec(line);
    if (unfinished) {
      pending.set(pid, { dirfd: unfinished[2], path: unescapeStracePath(unfinished[3] ?? ""), flags: unfinished[4] ?? "" });
      continue;
    }
    const resumed = OPEN_RESUMED.exec(line);
    if (resumed) {
      const open = pending.get(pid);
      pending.delete(pid);
      if (open) handle(open, Number(resumed[1]));
      continue;
    }
    const done = OPEN_DONE.exec(line);
    if (done) {
      handle(
        { dirfd: done[2], path: unescapeStracePath(done[3] ?? ""), flags: done[4] ?? "" },
        Number(done[5]),
      );
    }
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  return {
    manifest: { formatVersion: 1, fileCount: entries.length, totalBytes, entries },
    directoriesScanned: scanned.size,
    failedOpens,
  };
}

export function parseStrace(text: string, root: string, tree: readonly TreeEntry[]): BootSetManifest {
  return analyzeStrace(text, root, tree).manifest;
}

/** A path the shell can join to the tree root on any OS: POSIX, relative, no dot segments. */
export function isPortableRelativePath(path: string): boolean {
  if (path === "" || path.includes("\\") || path.includes("\0")) return false;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Fails when the manifest cannot be trusted against THIS build's file list. */
export function verifyBootSet(manifest: unknown, tree: readonly TreeEntry[]): VerifyResult {
  const problems: string[] = [];
  if (!isRecord(manifest)) return { ok: false, problems: ["manifest is not an object"] };
  if (manifest.formatVersion !== 1) problems.push(`unsupported formatVersion: ${String(manifest.formatVersion)}`);
  const rawEntries = manifest.entries;
  if (!Array.isArray(rawEntries)) return { ok: false, problems: [...problems, "entries is not a list"] };

  const files = new Map(tree.filter((entry) => entry.kind === "file").map((entry) => [entry.path, entry.size]));
  const seen = new Set<string>();
  const listed: string[] = [];
  let sum = 0;
  for (const raw of rawEntries as unknown[]) {
    if (!isRecord(raw) || typeof raw.path !== "string" || typeof raw.size !== "number" || !Number.isSafeInteger(raw.size) || raw.size < 0) {
      problems.push("invalid entry: needs a string path and a whole, non-negative size");
      continue;
    }
    sum += raw.size;
    if (!isPortableRelativePath(raw.path)) {
      problems.push(`invalid path: ${JSON.stringify(raw.path)}`);
      continue;
    }
    if (seen.has(raw.path)) {
      problems.push(`duplicate entry: ${raw.path}`);
      continue;
    }
    seen.add(raw.path);
    listed.push(raw.path);
    const actual = files.get(raw.path);
    if (actual === undefined) problems.push(`listed file is missing from the build: ${raw.path}`);
    else if (actual !== raw.size) problems.push(`size changed: ${raw.path} (listed ${raw.size}, build ${actual})`);
  }
  if (manifest.fileCount !== rawEntries.length) problems.push(`fileCount ${String(manifest.fileCount)} does not match ${rawEntries.length} entries`);
  if (manifest.totalBytes !== sum) problems.push(`totalBytes ${String(manifest.totalBytes)} does not match the entries (${sum})`);
  for (const rule of REQUIRED_ENTRY_RULES) {
    if (!listed.some((path) => rule.test.test(path))) problems.push(`required entry missing: ${rule.name}`);
  }
  return { ok: problems.length === 0, problems };
}

/** One entry per line so a rebuilt manifest diffs cleanly. */
export function serializeBootSet(manifest: BootSetManifest): string {
  const lines = manifest.entries.map((entry) => `  ${JSON.stringify(entry)}`);
  return `{"formatVersion":1,"fileCount":${manifest.fileCount},"totalBytes":${manifest.totalBytes},"entries":[\n${lines.join(",\n")}\n]}\n`;
}

export function areaOf(path: string): string {
  if (path.startsWith("node_modules/")) return "node_modules";
  if (path.startsWith(".next/server/")) return ".next/server";
  if (path.startsWith(".next/static/")) return ".next/static";
  if (path.startsWith("public/")) return "public";
  if (path.startsWith("src/")) return "src (locales)";
  return "root and other";
}

export type AreaRow = Readonly<{ area: string; treeFiles: number; treeBytes: number; bootFiles: number; bootBytes: number }>;

/** Tree versus boot set by area, plus the biggest boot files. */
export function summarizeBootSet(manifest: BootSetManifest, tree: readonly TreeEntry[], top = 20) {
  const rows = new Map<string, { treeFiles: number; treeBytes: number; bootFiles: number; bootBytes: number }>();
  const row = (area: string) => {
    let found = rows.get(area);
    if (!found) {
      found = { treeFiles: 0, treeBytes: 0, bootFiles: 0, bootBytes: 0 };
      rows.set(area, found);
    }
    return found;
  };
  for (const entry of tree) {
    if (entry.kind !== "file") continue;
    const r = row(areaOf(entry.path));
    r.treeFiles += 1;
    r.treeBytes += entry.size;
  }
  for (const entry of manifest.entries) {
    const r = row(areaOf(entry.path));
    r.bootFiles += 1;
    r.bootBytes += entry.size;
  }
  const areas: AreaRow[] = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([area, r]) => ({ area, ...r }));
  const biggest = [...manifest.entries].sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1)).slice(0, top);
  return { areas, biggest };
}

// ── I/O shell ───────────────────────────────────────────────────────────────

export function listTree(root: string, directory = root, base = ""): TreeEntry[] {
  const found: TreeEntry[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = resolve(directory, entry.name);
    const relative = base === "" ? entry.name : `${base}/${entry.name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) found.push({ path: relative, size: 0, kind: "symlink" });
    else if (stat.isDirectory()) found.push(...listTree(root, path, relative));
    else if (stat.isFile()) found.push({ path: relative, size: stat.size, kind: "file" });
  }
  return found;
}

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(args: readonly string[]): number {
  const treeArg = option(args, "--tree");
  if (!treeArg) {
    console.error("usage: boot-set.ts (--from-strace FILE [--out FILE] | --verify FILE | --summary FILE) --tree DIR");
    return 2;
  }
  const root = realpathSync(treeArg);
  const tree = listTree(root);
  const fromStrace = option(args, "--from-strace");
  if (fromStrace) {
    const analysis = analyzeStrace(readFileSync(fromStrace, "utf8"), root, tree);
    const verdict = verifyBootSet(analysis.manifest, tree);
    const out = option(args, "--out");
    if (out) writeFileSync(out, serializeBootSet(analysis.manifest), "utf8");
    console.log(JSON.stringify({ treeFiles: tree.filter((t) => t.kind === "file").length, bootFiles: analysis.manifest.fileCount, bootBytes: analysis.manifest.totalBytes, directoriesScanned: analysis.directoriesScanned, failedOpens: analysis.failedOpens, verify: verdict }));
    return verdict.ok ? 0 : 1;
  }
  const manifestPath = option(args, "--verify") ?? option(args, "--summary");
  if (!manifestPath) return 2;
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  const verdict = verifyBootSet(manifest, tree);
  if (option(args, "--verify")) {
    console.log(verdict.ok ? "boot-set: OK" : `boot-set: STALE\n${verdict.problems.join("\n")}`);
    return verdict.ok ? 0 : 1;
  }
  console.log(JSON.stringify(summarizeBootSet(manifest as BootSetManifest, tree), null, 1));
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
