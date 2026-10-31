// W3-F3 step C(2): the orders screen is a LAZY chunk with its own gzip budget; the 70 KB first-load gate (build.test.ts) stays.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPwa, type BuildResult } from "../build.mjs";

let out: BuildResult; let dir: string;
const read = (p: string): string => readFileSync(join(dir, p), "utf8");
const gz = (p: string): number => gzipSync(readFileSync(join(dir, p))).length;
const chunks = (): string[] => Object.entries(out.assets).filter(([k]) => k.startsWith("chunk-")).map(([, v]) => v);

beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), "sfpwa-chunks-")); out = await buildPwa({ outDir: dir }); }, 60_000);

describe("lazy screen chunks", () => {
  it("the orders screen is split out of the entry: a chunk holds it, the entry does not", () => {
    const withOrders = chunks().filter((c) => read(c).includes('data-screen="orders"'));
    expect(withOrders.length).toBe(1);
    expect(read(out.assets.app ?? "")).not.toContain('data-screen="orders"');
  });
  it("every screen chunk is <= 35 KB gz", () => {
    expect(chunks().length).toBeGreaterThan(0);
    for (const c of chunks()) expect(gz(c), c).toBeLessThanOrEqual(35 * 1024);
  });
  it("index.html loads only the entry and boot: chunks are fetched on demand", () => {
    const html = read("index.html");
    for (const c of chunks()) expect(html).not.toContain(c);
  });
  it("every chunk is precached (the screen opens offline) and the entry imports it by its FINAL hashed name", () => {
    const entry = read(out.assets.app ?? "");
    for (const c of chunks()) { expect(out.precache).toContain(c); expect(entry.includes(c.split("/").pop() ?? "?") || chunks().some((o) => read(o).includes(c.split("/").pop() ?? "?"))).toBe(true); }
  });
  it("no esbuild placeholder name is left in any script (every import points at a file that exists)", () => {
    for (const p of [out.assets.app ?? "", ...chunks()]) expect(read(p), p).not.toMatch(/chunk-[A-Z0-9]{8}\.js/);
  });
  it("the first-load gate is intact: entry + boot <= 70 KB gz", () => {
    expect(gz(out.assets.app ?? "") + gz(out.assets.boot ?? "")).toBeLessThanOrEqual(70 * 1024);
  });
});
