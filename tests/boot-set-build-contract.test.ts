import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BOOT_SET_MAX_FILES } from "../scripts/boot-set-nft";
import { STANDALONE_MANIFEST_FILE, verifyStandaloneManifest, writeStandaloneManifest } from "../scripts/standalone-manifest";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const VERSION = "1.2.3-internal.4";

describe("boot set build wiring (source contract: build-frontend.ts has no harness)", () => {
  const build = read("src-tauri/build-frontend.ts");
  it("imports the generator and writes boot-set.json into the standalone tree before the tree hash", () => {
    expect(build).toContain('from "../scripts/boot-set-nft"');
    const generate = build.indexOf("writeBootSetForTree(standaloneDir");
    const hash = build.indexOf("writeStandaloneManifest(standaloneDir");
    expect(generate).toBeGreaterThan(0);
    expect(hash).toBeGreaterThan(generate);
    expect(build).toContain("buildRoot: ROOT");
  });
  it("generates it after server.js is hardened, so the listed size is the shipped size", () => {
    expect(build.indexOf("writeBootSetForTree(standaloneDir")).toBeGreaterThan(build.indexOf("hardenStandaloneServer(serverSource)"));
  });
});

describe("boot set stop policy wiring (source contract: lib.rs needs a window to run)", () => {
  const lib = read("src-tauri/src/lib.rs");
  const warm = read("src-tauri/src/warm_set.rs");
  it("asks warm_stop_point at migration end and always stops once the runtime start returned", () => {
    expect(lib).toContain("warm_set::warm_stop_point(");
    const spawn = lib.indexOf("let spawned = spawn_initial_services(&app_handle);");
    expect(spawn).toBeGreaterThan(0);
    expect(lib.indexOf("warm_stop.store(true", spawn)).toBeGreaterThan(spawn);
    expect(lib.indexOf("warm_stop.store(true", spawn)).toBeLessThan(lib.indexOf("let runtime = match spawned"));
  });
  it("keeps the record of why the full walk must stop at migration end", () => {
    expect(lib).toContain("67s");
    expect(lib).toContain("540s");
    expect(lib).toContain("must never gate startup");
  });
  it("uses the same bound as the generator", () => {
    const rust = /MAX_BOUNDED_PLAN_FILES: usize = (\d+);/.exec(warm)?.[1];
    expect(Number(rust)).toBe(BOOT_SET_MAX_FILES);
  });
});

describe("boot-set.json is a normal listed file of the standalone tree", () => {
  const withTree = (run: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), "standalone-"));
    try {
      writeFileSync(join(dir, "server.js"), "console.log(1)");
      writeFileSync(join(dir, "boot-set.json"), '{"formatVersion":1,"fileCount":1,"totalBytes":14,"entries":[\n  {"path":"server.js","size":14}\n]}\n');
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  it("is hashed when it exists before the manifest, and verifies", () => {
    withTree((dir) => {
      const manifest = writeStandaloneManifest(dir, VERSION);
      expect(manifest.fileCount).toBe(2);
      expect(() => verifyStandaloneManifest(dir, VERSION)).not.toThrow();
    });
  });
  it("fails verification when it is edited or added after the manifest", () => {
    withTree((dir) => {
      writeStandaloneManifest(dir, VERSION);
      writeFileSync(join(dir, "boot-set.json"), '{"formatVersion":1,"fileCount":0,"totalBytes":0,"entries":[]}\n');
      expect(() => verifyStandaloneManifest(dir, VERSION)).toThrow();
    });
    withTree((dir) => {
      rmSync(join(dir, "boot-set.json"));
      writeStandaloneManifest(dir, VERSION);
      writeFileSync(join(dir, "boot-set.json"), "{}\n");
      expect(() => verifyStandaloneManifest(dir, VERSION)).toThrow();
      expect(STANDALONE_MANIFEST_FILE).toBe("sahelflow-standalone-manifest.json");
    });
  });
});
