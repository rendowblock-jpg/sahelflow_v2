import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STANDALONE_MANIFEST_FILE,
  writeStandaloneManifest,
} from "../../../scripts/standalone-manifest";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-standalone-manifest-"));
  roots.push(root);
  mkdirSync(resolve(root, ".next", "server"), { recursive: true });
  writeFileSync(resolve(root, "server.js"), "console.log('server')\n", "utf8");
  writeFileSync(
    resolve(root, ".next", "server", "app.js"),
    "module.exports = 1\n",
    "utf8",
  );
  writeFileSync(resolve(root, ".gitkeep"), "tracked placeholder\n", "utf8");
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe("standalone runtime manifest", () => {
  it("binds the exact staged file set and changes when runtime bytes change", () => {
    const root = fixture();
    const first = writeStandaloneManifest(root, "1.0.0-internal.2");

    expect(first.fileCount).toBe(2);
    expect(first.treeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(
      JSON.parse(
        readFileSync(resolve(root, STANDALONE_MANIFEST_FILE), "utf8"),
      ),
    ).toEqual(first);

    writeFileSync(resolve(root, "server.js"), "console.log('changed')\n", "utf8");
    const second = writeStandaloneManifest(root, "1.0.0-internal.2");
    expect(second.fileCount).toBe(first.fileCount);
    expect(second.treeSha256).not.toBe(first.treeSha256);
  });

  it("rejects a standalone tree without the mandatory server entrypoint", () => {
    const root = fixture();
    rmSync(resolve(root, "server.js"));

    expect(() => writeStandaloneManifest(root, "1.0.0-internal.2")).toThrow(
      "do not contain server.js",
    );
  });
});
