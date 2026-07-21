import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("Windows signed release build contract", () => {
  it("uses the canonical Webpack build with a disposable build-only ShopContext", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const frontendBuild = read("src-tauri/build-frontend.ts");

    expect(packageJson.scripts?.build).toContain("next build --webpack");
    expect(packageJson.scripts?.build).not.toContain("--turbopack");
    expect(frontendBuild).toContain('execSync("bun run build"');
    expect(frontendBuild).toContain("prepareDesktopBuildContext()");
    expect(frontendBuild).toContain("...buildContext.env");
    expect(frontendBuild).toMatch(/finally\s*{\s*buildContext\.cleanup\(\);\s*}/);
    expect(frontendBuild).not.toContain(
      "node_modules/next/dist/bin/next build\"",
    );
  });

  it("uses only updater inputs supported by tauri-action v0.6.2", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain("tauri-apps/tauri-action@v0.6.2");
    expect(workflow).toMatch(/^\s*includeUpdaterJson:\s*true\s*$/m);
    expect(workflow).toMatch(/^\s*updaterJsonPreferNsis:\s*false\s*$/m);
    expect(workflow).not.toMatch(/^\s*uploadUpdaterJson:/m);
    expect(workflow).not.toMatch(/^\s*uploadUpdaterSignatures:/m);
    expect(workflow).toContain("*.msi.sig");
    expect(workflow).toContain("latest.json");
  });

  it("attests clean source before build and generates evidence in a clean worktree", () => {
    const workflow = read(".github/workflows/release.yml");
    const evidenceHelper = read(
      "scripts/generate-release-evidence-worktree.ts",
    );
    const attest = workflow.indexOf("Attest clean exact source checkout");
    const build = workflow.indexOf("Build signed updater artifacts into a draft release");
    const tracked = workflow.indexOf("Verify build preserved tracked source");
    const evidence = workflow.indexOf(
      "Generate signed candidate evidence manifest from clean worktree",
    );

    expect(attest).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(attest);
    expect(tracked).toBeGreaterThan(build);
    expect(evidence).toBeGreaterThan(tracked);
    expect(workflow).toContain(
      "bun run scripts/generate-release-evidence-worktree.ts",
    );
    expect(evidenceHelper).toContain(
      'run("git", ["worktree", "add", "--detach"',
    );
    expect(evidenceHelper).toContain('"--require-clean"');
    expect(evidenceHelper).toContain('"--signed-updater"');
    expect(workflow).toContain("SF_SOURCE_COMMIT");
    expect(workflow).toContain("SF_SOURCE_TREE");
    expect(`${workflow}\n${evidenceHelper}`).not.toContain("git clean -fd");
    expect(`${workflow}\n${evidenceHelper}`).not.toContain("gh release delete");
  });

  it("binds each unpublished internal draft tag to the exact source commit", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain(
      '$tag = "sahelflow-v$($authority.version)-$env:SF_SOURCE_COMMIT"',
    );
    expect(workflow).toContain(
      "tagName: sahelflow-v__VERSION__-${{ inputs.source_ref }}",
    );
    expect(workflow).toContain(
      'releaseCommitish: ${{ inputs.source_ref }}',
    );
  });
});
