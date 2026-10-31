/**
 * Boot set from Next's own file traces (nft), with no strace and no Windows trace.
 *
 * Next already computes, per route, the exact files the server needs:
 * `.next/next-server.js.nft.json`, `.next/server/middleware.js.nft.json`,
 * `.next/server/instrumentation.js.nft.json` and `.next/server/app/<route>/page.js.nft.json`.
 * Each nft file lists paths relative to its own folder. This module turns them into the
 * ordered boot-set.json the desktop shell warms (src-tauri/src/warm_set.rs).
 *
 * The pure core takes `readText` and `exists`, so tests need no disk. The disk shell and
 * the CLI are at the bottom:
 *   bun run scripts/boot-set-nft.ts --tree DIR [--routes /setup,/login] [--out FILE] [--build-root DIR]
 *   bun run scripts/boot-set-nft.ts --tree DIR --compare TRACE.json
 */
import { lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { areaOf, serializeBootSet, type BootSetEntry, type BootSetManifest } from "./boot-set";

/**
 * Routes a new seller opens on the first run. "/" is the very first request (it redirects
 * to /setup, measured); /setup and /login are the two doors; /dashboard, /orders, /inbox
 * and /settings are what the seller opens right after, so their chunks are warm too.
 * A longer list costs bytes warmed for nothing, so add a route only with a measurement.
 */
export const FIRST_RUN_ROUTES = [
  "/",
  "/setup",
  "/login",
  "/dashboard",
  "/orders",
  "/inbox",
  "/settings",
  // Called by the first page itself (measured): the auth probe and the PWA manifest.
  "/api/auth/status",
  "/manifest.webmanifest",
] as const;

/** Files the first page asks for that no nft names. Each needs a reason. */
export const FIRST_RUN_EXTRAS: readonly ExtraFile[] = [
  { path: "public/sw.js", reason: "the page registers the service worker; it is a public file, so no nft names it" },
];

/** The warm-up keeps running until the server answers only for a set this small. */
export const BOOT_SET_MAX_FILES = 1500;
export const BOOT_SET_MAX_BYTES = 60_000_000;

export const BOOT_SET_FILE = "boot-set.json";

/** Files every start opens before any route is known. Missing ones are skipped. */
export const BASE_FILES = [
  "server.js",
  "package.json",
  ".next/BUILD_ID",
  ".next/required-server-files.json",
  ".next/routes-manifest.json",
  ".next/build-manifest.json",
  ".next/prerender-manifest.json",
  ".next/app-path-routes-manifest.json",
  ".next/react-loadable-manifest.json",
  ".next/server/functions-config-manifest.json",
  ".next/server/preview-props.json",
  ".next/server/next-font-manifest.json",
  ".next/server/prefetch-hints.json",
  ".next/server/middleware-manifest.json",
  ".next/server/app-paths-manifest.json",
  ".next/server/pages-manifest.json",
  ".next/server/server-reference-manifest.json",
  ".next/server/middleware.js",
  ".next/server/instrumentation.js",
] as const;

/** nft files that describe the whole server rather than one route. */
export const BASE_NFT_FILES = [
  ".next/next-server.js.nft.json",
  ".next/server/middleware.js.nft.json",
  ".next/server/instrumentation.js.nft.json",
] as const;

export type ExtraFile = Readonly<{ path: string; reason: string }>;

export type NftSources = Readonly<{
  /** Text of a tree-relative POSIX path, or undefined when it is not there. */
  readText: (path: string) => string | undefined;
  /** Size of a REGULAR file in the tree; undefined for missing, directory or symlink. */
  exists: (path: string) => number | undefined;
  routes: readonly string[];
  extraFiles?: readonly ExtraFile[];
}>;

export type NftReport = Readonly<{
  missingNft: readonly string[];
  unknownRoutes: readonly string[];
  refusedOutsideTree: number;
  missingFromTree: number;
}>;

export type NftResult = Readonly<{ manifest: BootSetManifest; report: NftReport }>;

const NATIVE_FILE = /\.(?:node|so|dll|dylib|exe)$|\.so\.\d/;

/**
 * Resolve `raw` (relative to the tree folder `dir`, "" = tree root) to a normalised POSIX
 * path inside the tree. Backslashes count as separators. undefined = outside the tree,
 * absolute, a drive path or empty: the caller refuses it.
 */
export function resolveInTree(dir: string, raw: string): string | undefined {
  if (raw.includes("\0")) return undefined;
  const unified = raw.replaceAll("\\", "/");
  if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified)) return undefined;
  const out: string[] = dir === "" ? [] : dir.split("/");
  for (const part of unified.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return undefined;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length === 0 ? undefined : out.join("/");
}

function dirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** "/(dashboard)/orders/page" -> "/orders"; route groups and parallel slots do not show in the URL. */
export function routeOfAppKey(key: string): string | undefined {
  const parts = key.split("/").filter((part) => part !== "");
  const last = parts[parts.length - 1];
  if (last !== "page" && last !== "route") return undefined;
  parts.pop();
  const visible = parts.filter((part) => !/^\(.*\)$/.test(part) && !part.startsWith("@"));
  return `/${visible.join("/")}`;
}

const STATIC_REF = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./\[\]()@%~+=]+?\.(?:js|css))/g;

/** Browser files named inside a page_client-reference-manifest.js, as `.next/static/...`. */
export function staticRefsOf(manifestText: string): string[] {
  const found: string[] = [];
  for (const match of manifestText.matchAll(STATIC_REF)) {
    const ref = match[1];
    if (ref !== undefined && !found.includes(`.next/${ref}`)) found.push(`.next/${ref}`);
  }
  return found;
}

export type PruneOptions = Readonly<{
  /** Keep a next-server.js.nft.json file only if its package is also named by a route, middleware or instrumentation nft, or is `next` itself. */
  packages: boolean;
  /** Folders of the `next` package (relative to the package, e.g. "dist/build/") dropped from next-server.js.nft.json. */
  nextSubtrees: readonly string[];
}>;

/** Measured on the production tree (see the B8 notes): next-server's nft names the whole of `next` and every optional tool it can load. */
export const DEFAULT_PRUNE: PruneOptions = {
  packages: true,
  // Zero files opened in two real first-page traces, 8+ nft files each: dev server, TypeScript, babel, webpack config.
  nextSubtrees: [
    "dist/build/webpack/",
    "dist/compiled/@next/",
    "dist/next-devtools/",
    "dist/compiled/babel/",
    "dist/client/dev/",
    "dist/server/typescript/",
    "dist/build/babel/",
    "dist/build/polyfills/",
  ],
};

const PACKAGE_OF = /^node_modules\/(?:\.bun\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\/(.*)$/;

/** [package name, path inside the package] of a node_modules path (bun store or flat), else undefined. */
export function packageOf(path: string): readonly [string, string] | undefined {
  const match = PACKAGE_OF.exec(path);
  const name = match?.[1];
  const inside = match?.[2];
  return name === undefined || inside === undefined ? undefined : [name, inside];
}

const MEDIA_REF = /static\/media\/[A-Za-z0-9_\-.]+\.(?:woff2?|ttf|otf|png|jpe?g|svg|webp|avif|ico)/g;

/** Fonts and images a stylesheet names, as `.next/static/media/...`. */
export function mediaRefsOf(cssText: string): string[] {
  const found: string[] = [];
  for (const match of cssText.matchAll(MEDIA_REF)) {
    const ref = `.next/${match[0]}`;
    if (!found.includes(ref)) found.push(ref);
  }
  return found;
}

export function bootSetFromNft(input: NftSources & Readonly<{ prune?: PruneOptions }>): NftResult {
  const { readText, exists, routes, extraFiles = [], prune } = input;
  const seen = new Set<string>();
  const entries: BootSetEntry[] = [];
  const missingNft: string[] = [];
  const unknownRoutes: string[] = [];
  let refused = 0;
  let missing = 0;

  const resolveOrRefuse = (dir: string, raw: string): string | undefined => {
    const path = resolveInTree(dir, raw);
    if (path === undefined) refused += 1;
    return path;
  };
  const addPath = (path: string): void => {
    if (seen.has(path)) return;
    const size = exists(path);
    if (size === undefined) {
      missing += 1;
      return;
    }
    seen.add(path);
    entries.push(NATIVE_FILE.test(path) ? { path, size, native: true } : { path, size });
  };
  /** Paths named by one nft file, resolved against its folder; undefined = nft missing or unreadable. */
  const loadNft = (nftPath: string): string[] | undefined => {
    const doc = parseJson(readText(nftPath)) as { files?: unknown } | undefined;
    if (doc === undefined || doc === null || typeof doc !== "object") {
      missingNft.push(nftPath);
      return undefined;
    }
    const out: string[] = [];
    for (const file of stringList(doc.files)) {
      const path = resolveOrRefuse(dirOf(nftPath), file);
      if (path !== undefined) out.push(path);
    }
    return out;
  };

  // Which page file serves which URL (route groups and slots do not show in the URL).
  const appPaths = parseJson(readText(".next/server/app-paths-manifest.json"));
  const pageOf = new Map<string, string>();
  if (appPaths !== undefined && appPaths !== null && typeof appPaths === "object") {
    for (const [key, value] of Object.entries(appPaths as Record<string, unknown>)) {
      const route = routeOfAppKey(key);
      if (route !== undefined && typeof value === "string" && !pageOf.has(route)) pageOf.set(route, value);
    }
  }
  const pages: string[] = [];
  for (const route of routes) {
    const page = pageOf.get(route);
    const pagePath = page === undefined ? undefined : resolveOrRefuse(".next/server", page);
    if (pagePath === undefined) unknownRoutes.push(route);
    else pages.push(pagePath);
  }

  // Load every nft first: the app's own packages decide what to keep of the big server nft.
  const serverNft = loadNft(BASE_NFT_FILES[0]);
  const appNfts = [BASE_NFT_FILES[1], BASE_NFT_FILES[2]].map((file) => ({ file, paths: loadNft(file) }));
  const pageNfts = pages.map((page) => ({ page, paths: loadNft(`${page}.nft.json`) }));
  const appPackages = new Set<string>(["next", "@next/env"]);
  for (const list of [...appNfts.map((n) => n.paths), ...pageNfts.map((n) => n.paths)]) {
    for (const path of list ?? []) {
      const pkg = packageOf(path);
      if (pkg !== undefined) appPackages.add(pkg[0]);
    }
  }
  const keepServerPath = (path: string): boolean => {
    if (prune === undefined) return true;
    const pkg = packageOf(path);
    if (pkg === undefined) return true;
    if (prune.packages && !appPackages.has(pkg[0])) return false;
    return !(pkg[0] === "next" && prune.nextSubtrees.some((sub) => pkg[1].startsWith(sub)));
  };

  for (const base of BASE_FILES) addPath(base);
  for (const path of serverNft ?? []) if (keepServerPath(path)) addPath(path);
  for (const nft of appNfts) for (const path of nft.paths ?? []) addPath(path);

  const build = parseJson(readText(".next/build-manifest.json")) as
    | { rootMainFiles?: unknown; polyfillFiles?: unknown }
    | undefined;
  if (build !== undefined && build !== null && typeof build === "object") {
    for (const file of [...stringList(build.rootMainFiles), ...stringList(build.polyfillFiles)]) {
      const path = resolveOrRefuse(".next", file);
      if (path !== undefined) addPath(path);
    }
  }

  for (const { page, paths } of pageNfts) {
    addPath(page);
    for (const path of paths ?? []) addPath(path);
    // page.js -> page_client-reference-manifest.js, route.js -> route_client-reference-manifest.js
    const clientManifest = `${page.replace(/\.js$/, "")}_client-reference-manifest.js`;
    addPath(clientManifest);
    for (const ref of staticRefsOf(readText(clientManifest) ?? "")) {
      addPath(ref);
      if (ref.endsWith(".css")) for (const media of mediaRefsOf(readText(ref) ?? "")) addPath(media);
    }
  }

  for (const extra of extraFiles) {
    if (extra.reason.trim() === "") throw new Error(`extra boot-set file needs a reason: ${extra.path}`);
    const path = resolveOrRefuse("", extra.path);
    if (path !== undefined) addPath(path);
  }

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  return {
    manifest: { formatVersion: 1, fileCount: entries.length, totalBytes, entries },
    report: { missingNft, unknownRoutes, refusedOutsideTree: refused, missingFromTree: missing },
  };
}

export type AreaCompare = Readonly<{
  area: string;
  nftFiles: number;
  nftBytes: number;
  tracedFiles: number;
  hitFiles: number;
  wastedBytes: number;
}>;

export type CompareResult = Readonly<{
  nftFiles: number;
  nftBytes: number;
  tracedFiles: number;
  tracedNonNative: number;
  hitNonNative: number;
  /** share of traced non-native files the nft set contains (a miss is a cold read) */
  recall: number;
  /** share of nft files that were opened in the trace (the rest is warmed for nothing) */
  precision: number;
  wastedBytes: number;
  missed: readonly BootSetEntry[];
  byArea: readonly AreaCompare[];
}>;

export function compareBootSets(nft: BootSetManifest, traced: BootSetManifest, top = 20): CompareResult {
  const inNft = new Set(nft.entries.map((e) => e.path));
  const inTrace = new Set(traced.entries.map((e) => e.path));
  const tracedPlain = traced.entries.filter((e) => e.native !== true);
  const missed = tracedPlain.filter((e) => !inNft.has(e.path)).sort((a, b) => b.size - a.size);
  const hitNonNative = tracedPlain.length - missed.length;
  const areas = new Map<string, { nftFiles: number; nftBytes: number; tracedFiles: number; hitFiles: number; wastedBytes: number }>();
  const row = (area: string) => {
    const existing = areas.get(area);
    if (existing) return existing;
    const created = { nftFiles: 0, nftBytes: 0, tracedFiles: 0, hitFiles: 0, wastedBytes: 0 };
    areas.set(area, created);
    return created;
  };
  let wastedBytes = 0;
  let used = 0;
  for (const entry of nft.entries) {
    const r = row(areaOf(entry.path));
    r.nftFiles += 1;
    r.nftBytes += entry.size;
    if (inTrace.has(entry.path)) {
      used += 1;
      r.hitFiles += 1;
    } else {
      r.wastedBytes += entry.size;
      wastedBytes += entry.size;
    }
  }
  for (const entry of traced.entries) row(areaOf(entry.path)).tracedFiles += 1;
  return {
    nftFiles: nft.entries.length,
    nftBytes: nft.totalBytes,
    tracedFiles: traced.entries.length,
    tracedNonNative: tracedPlain.length,
    hitNonNative,
    recall: tracedPlain.length === 0 ? 1 : hitNonNative / tracedPlain.length,
    precision: nft.entries.length === 0 ? 1 : used / nft.entries.length,
    wastedBytes,
    missed: missed.slice(0, top),
    byArea: [...areas.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([area, r]) => ({ area, ...r })),
  };
}

export function withinBounds(
  manifest: BootSetManifest,
  limits: Readonly<{ files: number; bytes: number }> = { files: BOOT_SET_MAX_FILES, bytes: BOOT_SET_MAX_BYTES },
): boolean {
  return manifest.fileCount <= limits.files && manifest.totalBytes <= limits.bytes;
}

// ---- disk shell ---------------------------------------------------------

export type DiskOptions = Readonly<{
  routes?: readonly string[];
  extraFiles?: readonly ExtraFile[];
  /** Project root of the build: next-server.js.nft.json lives in its .next, not in the standalone tree. */
  buildRoot?: string;
  prune?: PruneOptions;
  limits?: Readonly<{ files: number; bytes: number }>;
}>;

export function bootSetFromDisk(tree: string, options: DiskOptions = {}): NftResult {
  const readIf = (file: string): string | undefined => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  };
  return bootSetFromNft({
    readText: (path) =>
      readIf(resolve(tree, path)) ??
      (options.buildRoot !== undefined && path.endsWith(".nft.json") ? readIf(resolve(options.buildRoot, path)) : undefined),
    exists: (path) => {
      try {
        const meta = lstatSync(resolve(tree, path));
        return meta.isFile() ? meta.size : undefined;
      } catch {
        return undefined;
      }
    },
    routes: options.routes ?? FIRST_RUN_ROUTES,
    extraFiles: options.extraFiles ?? FIRST_RUN_EXTRAS,
    prune: options.prune ?? DEFAULT_PRUNE,
  });
}

/**
 * Writes <tree>/boot-set.json. Call it BEFORE the tree manifest hash so the file is listed.
 * A set over the limits is NOT written (the shell keeps the warm-up running until the server
 * answers only for a bounded set) and a stale file from an earlier build is removed.
 */
export function writeBootSetForTree(tree: string, options: DiskOptions = {}): NftResult & Readonly<{ written: boolean }> {
  const result = bootSetFromDisk(tree, options);
  const target = resolve(tree, BOOT_SET_FILE);
  const written = withinBounds(result.manifest, options.limits);
  if (written) writeFileSync(target, serializeBootSet(result.manifest), "utf8");
  else rmSync(target, { force: true });
  return { ...result, written };
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

export function main(argv: readonly string[]): number {
  const tree = argValue(argv, "--tree");
  if (tree === undefined) {
    console.error("usage: boot-set-nft.ts --tree DIR [--routes /a,/b] [--out FILE] [--build-root DIR] [--compare TRACE.json]");
    return 2;
  }
  const routes = argValue(argv, "--routes")?.split(",").filter((r) => r !== "");
  const buildRoot = argValue(argv, "--build-root");
  const result = bootSetFromDisk(tree, { ...(routes ? { routes } : {}), ...(buildRoot ? { buildRoot } : {}) });
  const out = argValue(argv, "--out");
  if (out !== undefined) writeFileSync(out, serializeBootSet(result.manifest), "utf8");
  console.log(JSON.stringify({ files: result.manifest.fileCount, bytes: result.manifest.totalBytes, bounded: withinBounds(result.manifest), report: result.report }));
  const tracePath = argValue(argv, "--compare");
  if (tracePath !== undefined) {
    const traced = JSON.parse(readFileSync(tracePath, "utf8")) as BootSetManifest;
    console.log(JSON.stringify(compareBootSets(result.manifest, traced), null, 1));
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
