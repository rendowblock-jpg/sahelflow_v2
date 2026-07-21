import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const script = resolve(repoRoot, "scripts", "restore-release-source.ts");
const fixtures: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function fixture(): {
  root: string;
  cargoPath: string;
  placeholderPath: string;
  extraPath: string;
  committedCargo: string;
  commit: string;
  tree: string;
} {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-release-source-"));
  fixtures.push(root);
  const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
  const placeholderPath = resolve(
    root,
    "src-tauri",
    "resources",
    "standalone",
    ".gitkeep",
  );
  const extraPath = resolve(root, "tracked.txt");
  const committedCargo = `[package]\nname = "fixture"\nversion = "1.0.0"\n\n[features]\ncustom-protocol = ["tauri/custom-protocol"]\n`;

  write(cargoPath, committedCargo);
  write(placeholderPath, "");
  write(extraPath, "canonical\n");
  git(root, ["init"]);
  git(root, ["config", "user.name", "SahelFlow Test"]);
  git(root, ["config", "user.email", "test@sahelflow.local"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "fixture"]);

  return {
    root,
    cargoPath,
    placeholderPath,
    extraPath,
    committedCargo,
    commit: git(root, ["rev-parse", "HEAD"]),
    tree: git(root, ["rev-parse", "HEAD^{tree}"]),
  };
}

function run(
  root: string,
  commit: string,
  tree: string,
): ReturnType<typeof spawnSync> {
  return spawnSync("bun", ["run", script], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SF_REPO_DIR: root,
      SF_SOURCE_COMMIT: commit,
      SF_SOURCE_TREE: tree,
    },
  });
}

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop()!, { recursive: true, force: true });
  }
});

describe("release tracked-source hygiene", () => {
  it("restores a TOML-equivalent Cargo rewrite and deleted placeholder", () => {
    const state = fixture();
    write(
      state.cargoPath,
      `# Tauri rewrite\n[features]\ncustom-protocol=["tauri/custom-protocol"]\n\n[package]\nversion="1.0.0"\nname="fixture"\n`,
    );
    unlinkSync(state.placeholderPath);

    const result = run(state.root, state.commit, state.tree);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Verified and restored deterministic build rewrites");
    expect(readFileSync(state.cargoPath, "utf8")).toBe(state.committedCargo);
    expect(readFileSync(state.placeholderPath, "utf8")).toBe("");
    expect(git(state.root, ["status", "--porcelain", "--untracked-files=no"])).toBe("");
  });

  it("rejects a semantic Cargo manifest change", () => {
    const state = fixture();
    write(
      state.cargoPath,
      state.committedCargo.replace('version = "1.0.0"', 'version = "2.0.0"'),
    );

    const result = run(state.root, state.commit, state.tree);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Tauri packaging changed Cargo.toml semantics",
    );
  });

  it("rejects any unapproved tracked-source modification", () => {
    const state = fixture();
    write(state.extraPath, "changed\n");

    const result = run(state.root, state.commit, state.tree);

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "build modified unexpected tracked source",
    );
  });
});
