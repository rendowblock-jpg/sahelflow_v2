import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOOT_SET_MAX_BYTES,
  BOOT_SET_MAX_FILES,
  FIRST_RUN_ROUTES,
  bootSetFromNft,
  compareBootSets,
  mediaRefsOf,
  packageOf,
  resolveInTree,
  routeOfAppKey,
  staticRefsOf,
  withinBounds,
  writeBootSetForTree,
} from "../scripts/boot-set-nft";
import type { BootSetManifest } from "../scripts/boot-set";

type Files = Record<string, string | number>;
function sources(files: Files) {
  return {
    readText: (path: string) => {
      const value = files[path];
      return typeof value === "string" ? value : undefined;
    },
    exists: (path: string) => {
      const value = files[path];
      return value === undefined ? undefined : typeof value === "string" ? value.length : value;
    },
  };
}
const nft = (...files: string[]) => JSON.stringify({ version: 1, files });
const APP_PATHS = JSON.stringify({ "/(dashboard)/orders/page": "app/(dashboard)/orders/page.js", "/setup/page": "app/setup/page.js", "/api/auth/status/route": "app/api/auth/status/route.js" });

function tree(extra: Files = {}): Files {
  return {
    "server.js": 10,
    "package.json": 5,
    ".next/server/app-paths-manifest.json": APP_PATHS,
    ".next/server/middleware.js": 20,
    ".next/server/app/setup/page.js": 30,
    ".next/server/app/(dashboard)/orders/page.js": 31,
    "node_modules/next/dist/server/next-server.js": 40,
    "node_modules/app-dep/index.js": 50,
    ...extra,
  };
}
const paths = (set: BootSetManifest) => set.entries.map((e) => e.path);

describe("resolveInTree", () => {
  it.each([
    ["", "a/b.js", "a/b.js"],
    [".next/server/app/setup", "../../../../node_modules/x/i.js", "node_modules/x/i.js"],
    [".next", "./static//chunks/a.js", ".next/static/chunks/a.js"],
    [".next/server", "..\\..\\node_modules\\x\\i.js", "node_modules/x/i.js"],
    [".next", "../../outside.js", undefined],
    ["", "../x", undefined],
    ["", "/etc/passwd", undefined],
    ["", "C:\\Windows\\x.dll", undefined],
    ["", "c:/x", undefined],
    ["", "a\0b", undefined],
    ["a", "..", undefined],
    ["", "", undefined],
  ])("dir %j + %j -> %j", (dir, raw, want) => {
    expect(resolveInTree(dir, raw)).toBe(want);
  });
});

describe("routes, packages and references", () => {
  it("drops route groups and slots from the URL and keeps route handlers", () => {
    expect(routeOfAppKey("/(dashboard)/orders/page")).toBe("/orders");
    expect(routeOfAppKey("/page")).toBe("/");
    expect(routeOfAppKey("/(a)/@modal/(.)x/page")).toBe("/(.)x");
    expect(routeOfAppKey("/api/auth/status/route")).toBe("/api/auth/status");
    expect(routeOfAppKey("/orders/loading")).toBeUndefined();
  });
  it("names the package of a bun-store or flat node_modules path", () => {
    expect(packageOf("node_modules/.bun/next@16.4.2+abc/node_modules/next/dist/a.js")).toEqual(["next", "dist/a.js"]);
    expect(packageOf("node_modules/.bun/x@1/node_modules/@prisma/client/index.js")).toEqual(["@prisma/client", "index.js"]);
    expect(packageOf("node_modules/react/index.js")).toEqual(["react", "index.js"]);
    expect(packageOf(".next/server/a.js")).toBeUndefined();
  });
  it("reads static chunk and css references in both spellings, once each", () => {
    const text = '{"a":["static/chunks/1-aa.js","/_next/static/chunks/1-aa.js","static/css/c.css"],"b":"static/chunks/app/(x)/page-bb.js"}';
    expect(staticRefsOf(text)).toEqual([".next/static/chunks/1-aa.js", ".next/static/css/c.css", ".next/static/chunks/app/(x)/page-bb.js"]);
    expect(mediaRefsOf("@font-face{src:url(/_next/static/media/a-s.p.woff2) format('woff2')}x{background:url(/_next/static/media/b.png)}")).toEqual([".next/static/media/a-s.p.woff2", ".next/static/media/b.png"]);
  });
});

describe("bootSetFromNft", () => {
  it("orders base files, server nft, middleware nft, build manifest, then each route, then extras", () => {
    const files = tree({
      ".next/next-server.js.nft.json": nft("../node_modules/next/dist/server/next-server.js"),
      ".next/server/middleware.js.nft.json": nft("../../node_modules/app-dep/index.js"),
      ".next/build-manifest.json": JSON.stringify({ rootMainFiles: ["static/chunks/main-app.js"], polyfillFiles: ["static/chunks/poly.js"] }),
      ".next/static/chunks/main-app.js": 1,
      ".next/static/chunks/poly.js": 1,
      ".next/server/app/setup/page.js.nft.json": nft("../../../../node_modules/app-dep/page-only.js"),
      "node_modules/app-dep/page-only.js": 2,
      ".next/server/app/setup/page_client-reference-manifest.js": 'x["static/chunks/setup-1.js","static/css/s.css"]',
      ".next/static/chunks/setup-1.js": 3,
      ".next/static/css/s.css": "@font-face{src:url(/_next/static/media/f.woff2)}",
      ".next/static/media/f.woff2": 4,
      "public/extra.js": 6,
    });
    const { manifest, report } = bootSetFromNft({ ...sources(files), routes: ["/setup"], extraFiles: [{ path: "public/extra.js", reason: "test" }] });
    const expected = [
      "server.js",
      "package.json",
      ".next/build-manifest.json",
      ".next/server/app-paths-manifest.json",
      ".next/server/middleware.js",
      "node_modules/next/dist/server/next-server.js",
      "node_modules/app-dep/index.js",
      ".next/static/chunks/main-app.js",
      ".next/static/chunks/poly.js",
      ".next/server/app/setup/page.js",
      "node_modules/app-dep/page-only.js",
      ".next/server/app/setup/page_client-reference-manifest.js",
      ".next/static/chunks/setup-1.js",
      ".next/static/css/s.css",
      ".next/static/media/f.woff2",
      "public/extra.js",
    ];
    expect(paths(manifest)).toEqual(expected);
    expect(manifest.fileCount).toBe(expected.length);
    expect(manifest.totalBytes).toBe(manifest.entries.reduce((n, e) => n + e.size, 0));
    expect(report.missingFromTree).toBeGreaterThan(0);
  });

  it("serves a route group page and a route handler through app-paths-manifest", () => {
    const files = tree({ ".next/server/app/api/auth/status/route.js": 7, ".next/server/app/api/auth/status/route_client-reference-manifest.js": 8 });
    const { manifest, report } = bootSetFromNft({ ...sources(files), routes: ["/orders", "/api/auth/status", "/nope"] });
    expect(paths(manifest)).toEqual(expect.arrayContaining([".next/server/app/(dashboard)/orders/page.js", ".next/server/app/api/auth/status/route.js", ".next/server/app/api/auth/status/route_client-reference-manifest.js"]));
    expect(report.unknownRoutes).toEqual(["/nope"]);
  });

  it("de-duplicates a file named by several nft files and keeps the first position", () => {
    const files = tree({
      ".next/next-server.js.nft.json": nft("../node_modules/app-dep/index.js", "../node_modules/app-dep/index.js"),
      ".next/server/middleware.js.nft.json": nft("../../node_modules/app-dep/index.js"),
      ".next/server/app/setup/page.js.nft.json": nft("../../../../node_modules/app-dep/index.js"),
    });
    const { manifest } = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    expect(paths(manifest).filter((p) => p === "node_modules/app-dep/index.js")).toHaveLength(1);
    expect(paths(manifest).indexOf("node_modules/app-dep/index.js")).toBeLessThan(paths(manifest).indexOf(".next/server/app/setup/page.js"));
  });

  it("records a missing nft and a file the tree does not have, without throwing", () => {
    const files = tree({ ".next/server/app/setup/page.js.nft.json": nft("../../../../node_modules/gone/index.js", "../../../../node_modules/app-dep/index.js") });
    const { manifest, report } = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    expect(report.missingNft).toEqual([".next/next-server.js.nft.json", ".next/server/middleware.js.nft.json", ".next/server/instrumentation.js.nft.json"]);
    expect(paths(manifest)).not.toContain("node_modules/gone/index.js");
    expect(paths(manifest)).toContain("node_modules/app-dep/index.js");
    expect(report.missingFromTree).toBeGreaterThanOrEqual(1);
  });

  it("treats a corrupt nft like a missing one", () => {
    const { report } = bootSetFromNft({ ...sources(tree({ ".next/next-server.js.nft.json": "{not json" })), routes: [] });
    expect(report.missingNft).toContain(".next/next-server.js.nft.json");
  });

  it("normalises Windows backslashes and resolves .. inside the tree", () => {
    const files = tree({ ".next/server/app/setup/page.js.nft.json": nft("..\\..\\..\\..\\node_modules\\app-dep\\index.js", "../../../../node_modules/./app-dep/../app-dep/index.js") });
    const { manifest } = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    expect(paths(manifest).filter((p) => p.startsWith("node_modules/app-dep"))).toEqual(["node_modules/app-dep/index.js"]);
  });

  it("refuses paths that leave the tree or are absolute and counts them", () => {
    const files = tree({ ".next/server/app/setup/page.js.nft.json": nft("../../../../../etc/passwd", "/abs/x.js", "C:\\x.dll", "../../../../node_modules/app-dep/index.js") });
    const { manifest, report } = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    expect(report.refusedOutsideTree).toBe(3);
    expect(paths(manifest).every((p) => !p.startsWith("/") && !p.includes(".."))).toBe(true);
  });

  it("flags native files and keeps a missing native out of the list", () => {
    const files = tree({
      ".next/server/app/setup/page.js.nft.json": nft("../../../../node_modules/p/engine.so.node", "../../../../node_modules/p/lib.dll", "../../../../node_modules/p/missing.node", "../../../../node_modules/app-dep/index.js"),
      "node_modules/p/engine.so.node": 900,
      "node_modules/p/lib.dll": 90,
    });
    const { manifest } = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    const natives = manifest.entries.filter((e) => e.native).map((e) => e.path);
    expect(natives).toEqual(["node_modules/p/engine.so.node", "node_modules/p/lib.dll"]);
    expect(manifest.entries.find((e) => e.path === "node_modules/app-dep/index.js")?.native).toBeUndefined();
  });

  it("prunes the big server nft to the packages the app names, and the listed next folders", () => {
    const files = tree({
      ".next/next-server.js.nft.json": nft("../node_modules/webpack/lib/a.js", "../node_modules/app-dep/index.js", "../node_modules/next/dist/build/webpack/x.js", "../node_modules/next/dist/server/next-server.js"),
      ".next/server/app/setup/page.js.nft.json": nft("../../../../node_modules/app-dep/index.js"),
      "node_modules/webpack/lib/a.js": 1,
      "node_modules/next/dist/build/webpack/x.js": 1,
    });
    const pruned = bootSetFromNft({ ...sources(files), routes: ["/setup"], prune: { packages: true, nextSubtrees: ["dist/build/webpack/"] } });
    expect(paths(pruned.manifest)).not.toContain("node_modules/webpack/lib/a.js");
    expect(paths(pruned.manifest)).not.toContain("node_modules/next/dist/build/webpack/x.js");
    expect(paths(pruned.manifest)).toContain("node_modules/next/dist/server/next-server.js");
    const whole = bootSetFromNft({ ...sources(files), routes: ["/setup"] });
    expect(paths(whole.manifest)).toContain("node_modules/webpack/lib/a.js");
  });

  it("appends extras and refuses an extra without a reason", () => {
    const files = tree({ "public/sw.js": 3 });
    const { manifest } = bootSetFromNft({ ...sources(files), routes: [], extraFiles: [{ path: "public/sw.js", reason: "registered by the page" }] });
    expect(paths(manifest).at(-1)).toBe("public/sw.js");
    expect(() => bootSetFromNft({ ...sources(files), routes: [], extraFiles: [{ path: "public/sw.js", reason: "  " }] })).toThrow(/reason/);
  });

  it("lists the six first-run routes the brief names, once each", () => {
    for (const route of ["/setup", "/login", "/dashboard", "/orders", "/inbox", "/settings"]) expect(FIRST_RUN_ROUTES).toContain(route);
    expect(new Set(FIRST_RUN_ROUTES).size).toBe(FIRST_RUN_ROUTES.length);
    expect(FIRST_RUN_ROUTES.every((r) => r.startsWith("/"))).toBe(true);
  });
});

describe("compareBootSets", () => {
  const set = (list: Array<[string, number, boolean?]>): BootSetManifest => ({
    formatVersion: 1,
    fileCount: list.length,
    totalBytes: list.reduce((n, [, size]) => n + size, 0),
    entries: list.map(([path, size, native]) => (native ? { path, size, native: true as const } : { path, size })),
  });
  it("counts recall over non-native traced files and precision over the nft set", () => {
    const nftSet = set([["a.js", 10], ["b.js", 20], ["node_modules/c.js", 70], ["e.node", 500, true]]);
    const traced = set([["a.js", 10], ["node_modules/c.js", 70], ["miss-big.js", 300], ["miss-small.js", 5], ["linux.so", 9, true]]);
    const r = compareBootSets(nftSet, traced);
    expect(r.tracedNonNative).toBe(4);
    expect(r.hitNonNative).toBe(2);
    expect(r.recall).toBe(0.5);
    expect(r.precision).toBe(0.5);
    expect(r.wastedBytes).toBe(520);
    expect(r.missed.map((m) => m.path)).toEqual(["miss-big.js", "miss-small.js"]);
    expect(r.byArea.find((a) => a.area === "node_modules")).toMatchObject({ nftFiles: 1, hitFiles: 1, wastedBytes: 0 });
  });
  it("keeps only the biggest N misses and handles empty sets", () => {
    const traced = set([["a", 1], ["b", 3], ["c", 2]]);
    expect(compareBootSets(set([]), traced, 2).missed.map((m) => m.path)).toEqual(["b", "c"]);
    expect(compareBootSets(set([]), set([])).recall).toBe(1);
  });
  it("applies the size and file bounds the warm-up relies on", () => {
    const make = (files: number, bytes: number): BootSetManifest => ({ formatVersion: 1, fileCount: files, totalBytes: bytes, entries: [] });
    expect(withinBounds(make(BOOT_SET_MAX_FILES, BOOT_SET_MAX_BYTES))).toBe(true);
    expect(withinBounds(make(BOOT_SET_MAX_FILES + 1, 1))).toBe(false);
    expect(withinBounds(make(1, BOOT_SET_MAX_BYTES + 1))).toBe(false);
  });
});

describe("writeBootSetForTree (real files)", () => {
  it("writes boot-set.json, skips a symlink and reads a build-only nft from the build root", () => {
    const root = mkdtempSync(join(tmpdir(), "bootset-"));
    try {
      const tree = join(root, "standalone");
      const build = join(root, "build");
      mkdirSync(join(tree, ".next", "server"), { recursive: true });
      mkdirSync(join(tree, "node_modules", "next"), { recursive: true });
      mkdirSync(join(build, ".next"), { recursive: true });
      writeFileSync(join(tree, "server.js"), "x");
      writeFileSync(join(tree, "node_modules", "next", "real.js"), "yy");
      writeFileSync(join(build, ".next", "next-server.js.nft.json"), nft("../node_modules/next/real.js", "../node_modules/next/link.js"));
      try {
        symlinkSync(join(tree, "node_modules", "next", "real.js"), join(tree, "node_modules", "next", "link.js"));
      } catch {
        // Windows without the privilege: the entry is then simply absent, the same result
      }
      const result = writeBootSetForTree(tree, { buildRoot: build, routes: [], extraFiles: [] });
      const written = JSON.parse(readFileSync(join(tree, "boot-set.json"), "utf8")) as BootSetManifest;
      expect(written.entries.map((e) => e.path)).toEqual(["server.js", "node_modules/next/real.js"]);
      expect(written.fileCount).toBe(2);
      expect(written.totalBytes).toBe(3);
      expect(result.written).toBe(true);
      expect(result.report.missingFromTree).toBeGreaterThanOrEqual(1);
      // a set over the limits is not written and a stale file from an earlier build goes away
      const over = writeBootSetForTree(tree, { buildRoot: build, routes: [], extraFiles: [], limits: { files: 1, bytes: 1_000 } });
      expect(over.written).toBe(false);
      expect(() => readFileSync(join(tree, "boot-set.json"), "utf8")).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
