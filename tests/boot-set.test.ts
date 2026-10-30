import { describe, expect, it } from "vitest";
import {
  REQUIRED_ENTRY_RULES,
  analyzeStrace,
  parseStrace,
  verifyBootSet,
  type BootSetManifest,
  type TreeEntry,
} from "../scripts/boot-set";

const ROOT = "/srv/app/standalone";
const f = (path: string, size = 100): TreeEntry => ({ path, size, kind: "file" });
const TREE: TreeEntry[] = [
  f("server.js", 5000),
  f(".next/server/middleware.js", 7000),
  f(".next/server/app/page.js", 900),
  f(".next/server/chunks/1.js", 300),
  f("node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node", 20000),
  f("node_modules/better-sqlite3/build/Release/better_sqlite3.node", 2000),
  f("public/logo.svg", 40),
  { path: "node_modules/.bin/next", size: 10, kind: "symlink" },
];
const open = (p: string, ret = "3", flags = "O_RDONLY|O_CLOEXEC") =>
  `openat(AT_FDCWD, "${p}", ${flags}) = ${ret}`;

describe("parseStrace", () => {
  it("keeps a successful file open, with its size, in first-open order", () => {
    const text = [open(`${ROOT}/server.js`), open(`${ROOT}/.next/server/app/page.js`)].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => [e.path, e.size])).toEqual([
      ["server.js", 5000],
      [".next/server/app/page.js", 900],
    ]);
  });

  it("ignores failed opens (ENOENT, EACCES)", () => {
    const text = [
      open(`${ROOT}/server.js`, "-1 ENOENT (No such file or directory)"),
      open(`${ROOT}/public/logo.svg`, "-1 EACCES (Permission denied)"),
    ].join("\n");
    const a = analyzeStrace(text, ROOT, TREE);
    expect(a.manifest.entries).toEqual([]);
    expect(a.failedOpens).toBe(2);
  });

  it("ignores directory opens and counts the scanned directories once", () => {
    const text = [
      open(`${ROOT}/.next/server`, "4", "O_RDONLY|O_NONBLOCK|O_CLOEXEC|O_DIRECTORY"),
      open(`${ROOT}/.next/server`, "5", "O_RDONLY|O_NONBLOCK|O_CLOEXEC|O_DIRECTORY"),
      open(`${ROOT}/.next/server/chunks`, "6"), // opened without O_DIRECTORY: not a file in the tree
    ].join("\n");
    const a = analyzeStrace(text, ROOT, TREE);
    expect(a.manifest.entries).toEqual([]);
    expect(a.directoriesScanned).toBe(2);
  });

  it("ignores files outside the tree, including a sibling that shares the prefix", () => {
    const text = [
      open("/usr/lib/x86_64-linux-gnu/libc.so.6"),
      open("/srv/app/standalone-other/server.js"),
      open(`${ROOT}/server.js`),
    ].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => e.path)).toEqual(["server.js"]);
  });

  it("lists a file once, at its first open", () => {
    const text = [
      open(`${ROOT}/public/logo.svg`),
      open(`${ROOT}/server.js`),
      open(`${ROOT}/public/logo.svg`),
    ].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => e.path)).toEqual(["public/logo.svg", "server.js"]);
  });

  it("ignores a symlink in the tree (the shipped tree has none)", () => {
    expect(parseStrace(open(`${ROOT}/node_modules/.bin/next`), ROOT, TREE).entries).toEqual([]);
  });

  it("understands pid prefixes, [pid N] and unfinished/resumed pairs", () => {
    const text = [
      `1201 ${open(`${ROOT}/server.js`)}`,
      `[pid  1202] ${open(`${ROOT}/public/logo.svg`)}`,
      `[pid  1203] openat(AT_FDCWD, "${ROOT}/.next/server/chunks/1.js", O_RDONLY|O_CLOEXEC <unfinished ...>`,
      `[pid  1204] ${open(`${ROOT}/.next/server/app/page.js`)}`,
      `[pid  1203] <... openat resumed>)       = 21`,
    ].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => e.path)).toEqual([
      "server.js",
      "public/logo.svg",
      ".next/server/app/page.js",
      ".next/server/chunks/1.js",
    ]);
  });

  it("normalises dot segments and resolves relative paths against the tree root", () => {
    const text = [open(`${ROOT}/.next/server/../../server.js`), open("public/./logo.svg")].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => e.path)).toEqual(["server.js", "public/logo.svg"]);
  });

  it("reads the legacy open() call too, and ignores stat calls", () => {
    const text = [
      `open("${ROOT}/server.js", O_RDONLY) = 3`,
      `statx(AT_FDCWD, "${ROOT}/public/logo.svg", AT_STATX_SYNC_AS_STAT, STATX_ALL, {...}) = 0`,
    ].join("\n");
    expect(parseStrace(text, ROOT, TREE).entries.map((e) => e.path)).toEqual(["server.js"]);
  });

  it("marks platform-specific native files so another platform can skip them", () => {
    const text = [
      open(`${ROOT}/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node`),
      open(`${ROOT}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`),
      open(`${ROOT}/server.js`),
    ].join("\n");
    const byPath = new Map(parseStrace(text, ROOT, TREE).entries.map((e) => [e.path, e]));
    expect(byPath.get("node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node")?.native).toBe(true);
    expect(byPath.get("node_modules/better-sqlite3/build/Release/better_sqlite3.node")?.native).toBe(true);
    expect(byPath.get("server.js")?.native).toBeUndefined();
  });

  it("totals bytes and is byte-identical on a second run", () => {
    const text = [open(`${ROOT}/server.js`), open(`${ROOT}/public/logo.svg`)].join("\n");
    const one = parseStrace(text, ROOT, TREE);
    expect(one.fileCount).toBe(2);
    expect(one.totalBytes).toBe(5040);
    expect(JSON.stringify(parseStrace(text, ROOT, TREE))).toBe(JSON.stringify(one));
  });
});

function goodManifest(): BootSetManifest {
  const text = [
    open(`${ROOT}/server.js`),
    open(`${ROOT}/.next/server/middleware.js`),
    open(`${ROOT}/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node`),
    open(`${ROOT}/node_modules/better-sqlite3/build/Release/better_sqlite3.node`),
    open(`${ROOT}/.next/server/app/page.js`),
  ].join("\n");
  return parseStrace(text, ROOT, TREE);
}
const withEntries = (m: BootSetManifest, entries: unknown[]) => ({
  ...m,
  entries,
  fileCount: entries.length,
  totalBytes: entries.reduce<number>((sum, e) => sum + (e as { size: number }).size, 0),
});

describe("verifyBootSet", () => {
  it("accepts a fresh manifest that names every required entry file", () => {
    expect(REQUIRED_ENTRY_RULES.length).toBeGreaterThanOrEqual(4);
    expect(verifyBootSet(goodManifest(), TREE)).toEqual({ ok: true, problems: [] });
  });

  it("fails when a listed file is missing from the fresh build (stale manifest)", () => {
    const stale = TREE.filter((t) => t.path !== ".next/server/app/page.js");
    const r = verifyBootSet(goodManifest(), stale);
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toContain(".next/server/app/page.js");
  });

  it("fails when a listed file changed size (rebuilt under the same name)", () => {
    const grown = TREE.map((t) => (t.path === "server.js" ? { ...t, size: 6000 } : t));
    const r = verifyBootSet(goodManifest(), grown);
    expect(r.ok).toBe(false);
    expect(r.problems.join("\n")).toContain("server.js");
  });

  it.each([
    ["server.js", "server entry"],
    [".next/server/middleware.js", "middleware"],
    ["node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node", "prisma"],
    ["node_modules/better-sqlite3/build/Release/better_sqlite3.node", "sqlite"],
  ])("fails when the required entry %s is not listed", (path) => {
    const m = goodManifest();
    const r = verifyBootSet(withEntries(m, m.entries.filter((e) => e.path !== path)), TREE);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.startsWith("required entry missing"))).toBe(true);
  });

  it.each([
    ["backslash", ".next\\server\\app\\page.js"],
    ["drive letter", "C:/app/server.js"],
    ["drive letter backslash", "C:\\app\\server.js"],
    ["absolute", "/server.js"],
    ["parent segment", "../server.js"],
    ["dot segment", "./server.js"],
    ["empty segment", ".next//server/app/page.js"],
    ["empty path", ""],
    ["trailing slash", ".next/server/"],
  ])("rejects a %s path in the manifest", (_name, bad) => {
    const m = goodManifest();
    const r = verifyBootSet(withEntries(m, [...m.entries, { path: bad, size: 1 }]), TREE);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.startsWith("invalid path"))).toBe(true);
  });

  it("rejects a duplicate entry, a wrong version and a count that disagrees", () => {
    const m = goodManifest();
    const dup = verifyBootSet(withEntries(m, [...m.entries, m.entries[0]]), TREE);
    expect(dup.problems.some((p) => p.startsWith("duplicate"))).toBe(true);
    expect(verifyBootSet({ ...m, formatVersion: 2 }, TREE).ok).toBe(false);
    expect(verifyBootSet({ ...m, fileCount: m.fileCount + 1 }, TREE).ok).toBe(false);
    expect(verifyBootSet({ ...m, totalBytes: m.totalBytes + 1 }, TREE).ok).toBe(false);
  });

  it("does not throw on garbage input", () => {
    for (const bad of [null, 5, "x", [], {}, { formatVersion: 1, entries: "no" }]) {
      expect(verifyBootSet(bad, TREE).ok).toBe(false);
    }
  });
});
