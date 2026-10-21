import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDocs } from "../docs-gate";

type Manifest = {
  formatVersion: number;
  files: Record<string, { maxBytes: number }>;
  releaseNameFiles: string[];
  undefinedFdAllowed: string[];
  deadPathAllowed: Record<string, string[]>;
};

const roots: string[] = [];

function baseManifest(): Manifest {
  return {
    formatVersion: 1,
    files: {
      "README.md": { maxBytes: 2000 },
      "AGENTS.md": { maxBytes: 2000 },
      "CHANGELOG.md": { maxBytes: 2000 },
      "documentation/README.md": { maxBytes: 2000 },
      "documentation/product/DECISIONS.md": { maxBytes: 2000 },
    },
    releaseNameFiles: ["CHANGELOG.md"],
    undefinedFdAllowed: [],
    deadPathAllowed: {},
  };
}

function baseFiles(): Record<string, string> {
  return {
    "README.md": "# Readme\n",
    "AGENTS.md": "# Agents\n",
    "CHANGELOG.md": "# Changelog\n\nInternal.45 shipped.\n",
    "documentation/README.md": "# Docs\n",
    "documentation/product/DECISIONS.md": "# Decisions\n\n## FD-001 — one\n",
  };
}

function makeTree(
  files: Record<string, string> = {},
  manifest: Manifest | string = baseManifest(),
): string {
  const root = mkdtempSync(join(tmpdir(), "docs-gate-"));
  roots.push(root);
  const all = { ...baseFiles(), ...files };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, "utf8");
  }
  mkdirSync(join(root, "documentation"), { recursive: true });
  writeFileSync(
    join(root, "documentation/MANIFEST.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    "utf8",
  );
  return root;
}

function rules(root: string): string[] {
  return checkDocs(root).map((finding) => finding.rule);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("docs gate", () => {
  it("passes a clean tree", () => {
    expect(checkDocs(makeTree())).toEqual([]);
  });

  it("flags a doc that is not in the manifest", () => {
    const root = makeTree({ "documentation/extra.md": "# Extra\n" });
    expect(checkDocs(root)).toEqual([
      expect.objectContaining({ rule: "unlisted-doc", file: "documentation/extra.md" }),
    ]);
  });

  it("flags a manifest file that does not exist", () => {
    const manifest = baseManifest();
    manifest.files["documentation/gone.md"] = { maxBytes: 100 };
    expect(checkDocs(makeTree({}, manifest))).toEqual([
      expect.objectContaining({ rule: "missing-doc", file: "documentation/gone.md" }),
    ]);
  });

  it("flags a doc over its byte ceiling", () => {
    const root = makeTree({ "README.md": `# Readme\n${"x".repeat(2100)}\n` });
    expect(checkDocs(root)).toEqual([
      expect.objectContaining({ rule: "too-big", file: "README.md" }),
    ]);
  });

  it("measures the byte ceiling on LF text, so a CRLF checkout does not trip it", () => {
    const lines = Array.from({ length: 99 }, () => "x".repeat(19)).join("\n");
    const lf = `${lines}\n`;
    expect(Buffer.byteLength(lf)).toBe(1980);
    expect(Buffer.byteLength(lf.replace(/\n/g, "\r\n"))).toBeGreaterThan(2000);
    expect(checkDocs(makeTree({ "README.md": lf }))).toEqual([]);
    expect(checkDocs(makeTree({ "README.md": lf.replace(/\n/g, "\r\n") }))).toEqual([]);
  });

  it("flags an FD id that no heading defines", () => {
    const root = makeTree({ "README.md": "See FD-099 for the rule.\n" });
    expect(checkDocs(root)).toEqual([
      expect.objectContaining({ rule: "undefined-fd", file: "README.md" }),
    ]);
  });

  it("accepts an FD id defined by a table row", () => {
    const root = makeTree({
      "README.md": "See FD-034 for the rule.\n",
      "documentation/product/DECISIONS.md":
        "## FD-001 — one\n\n| FD-034 | one-line summary | release request |\n",
    });
    expect(checkDocs(root)).toEqual([]);
  });

  it("accepts an allowed FD id and flags the allowance once the id is defined", () => {
    const manifest = baseManifest();
    manifest.undefinedFdAllowed = ["099"];
    expect(checkDocs(makeTree({ "README.md": "See FD-099.\n" }, manifest))).toEqual([]);
    const defined = makeTree(
      {
        "README.md": "See FD-099.\n",
        "documentation/product/DECISIONS.md": "## FD-099 — now defined\n",
      },
      manifest,
    );
    expect(rules(defined)).toEqual(["stale-allowance"]);
  });

  it("flags a backticked path that resolves nowhere", () => {
    const root = makeTree({ "AGENTS.md": "Edit `src/nope/file.ts` first.\n" });
    expect(checkDocs(root)).toEqual([
      expect.objectContaining({ rule: "dead-path", file: "AGENTS.md" }),
    ]);
  });

  it("accepts a path that resolves from the root, by suffix, or from the doc folder", () => {
    const root = makeTree({
      "src/components/foo/bar.tsx": "export {};\n",
      "documentation/system/data.json": "{}\n",
      "AGENTS.md": "Root `src/components/foo/bar.tsx`, suffix `foo/bar.tsx`.\n",
      "documentation/product/DECISIONS.md":
        "## FD-001 — one\n\nSee `../system/data.json` and `src/components/foo/bar.tsx:12`.\n",
    });
    expect(checkDocs(root)).toEqual([]);
  });

  it("does not check bare file names, placeholders, absolute paths or URLs", () => {
    const root = makeTree({
      "AGENTS.md":
        "Runtime `latest.json`, `src/<name>/x.ts`, `src/*/y.ts`, `/opt/box/z.md`, `node_modules/next/a.js`, https://example.com/a/b.ts.\n",
    });
    expect(checkDocs(root)).toEqual([]);
  });

  it("ignores paths inside a docs-gate:ignore fence", () => {
    const root = makeTree({
      "AGENTS.md":
        "<!-- docs-gate:ignore-start -->\n`src/old/gone.ts`\n<!-- docs-gate:ignore-end -->\n`src/old/live.ts`\n",
    });
    const found = checkDocs(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("src/old/live.ts");
  });

  it("accepts an allowed dead path and flags the allowance once the path resolves", () => {
    const manifest = baseManifest();
    manifest.deadPathAllowed = { "AGENTS.md": ["src/old/gone.ts"] };
    const dead = makeTree({ "AGENTS.md": "Was `src/old/gone.ts`.\n" }, manifest);
    expect(checkDocs(dead)).toEqual([]);
    const alive = makeTree(
      { "AGENTS.md": "Was `src/old/gone.ts`.\n", "src/old/gone.ts": "export {};\n" },
      manifest,
    );
    expect(rules(alive)).toEqual(["stale-allowance"]);
  });

  it("flags a release name in a file outside releaseNameFiles", () => {
    const root = makeTree({ "AGENTS.md": "Latest is Internal.45.\n" });
    expect(checkDocs(root)).toEqual([
      expect.objectContaining({ rule: "release-name", file: "AGENTS.md" }),
    ]);
  });

  it("flags an unparsable or missing manifest without throwing", () => {
    expect(rules(makeTree({}, "{ not json"))).toEqual(["bad-manifest"]);
    const empty = mkdtempSync(join(tmpdir(), "docs-gate-"));
    roots.push(empty);
    expect(rules(empty)).toEqual(["bad-manifest"]);
  });

  it("passes on the real repository", () => {
    expect(checkDocs(process.cwd())).toEqual([]);
  });
});
