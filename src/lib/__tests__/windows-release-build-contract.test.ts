import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("Windows signed release build contract", () => {
  it("uses the canonical Webpack build and preserves the tracked placeholder bytes", () => {
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
    expect(frontendBuild).toContain("const placeholderBytes = readFileSync(placeholderPath)");
    expect(frontendBuild).toContain("writeFileSync(placeholderPath, placeholderBytes)");
    expect(frontendBuild).not.toContain(
      'writeFileSync(resolve(resDir, ".gitkeep"), ""',
    );
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

  it("verifies approved packaging drift but generates evidence from a clean exact worktree", () => {
    const workflow = read(".github/workflows/release.yml");
    const evidenceHelper = read("scripts/generate-release-evidence-worktree.ts");
    const verifyHelper = read("scripts/verify-release-source.ts");
    const attest = workflow.indexOf("Attest clean exact source checkout");
    const build = workflow.indexOf("Build signed updater artifacts into a draft release");
    const verify = workflow.indexOf("Verify deterministic build source rewrites");
    const evidence = workflow.indexOf(
      "Generate signed candidate evidence manifest from clean worktree",
    );

    expect(attest).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(attest);
    expect(verify).toBeGreaterThan(build);
    expect(evidence).toBeGreaterThan(verify);
    expect(workflow).toContain("bun run scripts/verify-release-source.ts");
    expect(workflow).toContain(
      "bun run scripts/generate-release-evidence-worktree.ts",
    );
    expect(evidenceHelper).toContain(
      '["run", "scripts/verify-release-source.ts"]',
    );
    expect(verifyHelper).toContain("toml.parse");
    expect(verifyHelper).toContain("const allowedTrackedChanges = new Set([cargoManifest])");
    expect(verifyHelper).toContain('code !== " M"');
    expect(verifyHelper).not.toContain("restoreCommittedPath");
    expect(verifyHelper).not.toContain('git(["restore"');
    expect(evidenceHelper).toMatch(/worktree[\s\S]*add[\s\S]*--detach/);
    expect(evidenceHelper).toContain("--require-clean");
    expect(evidenceHelper).toContain("--signed-updater");
    expect(workflow).toContain("SF_SOURCE_COMMIT");
    expect(workflow).toContain("SF_SOURCE_TREE");
    expect(`${workflow}\n${evidenceHelper}\n${verifyHelper}`).not.toContain(
      "git clean -fd",
    );
    expect(`${workflow}\n${evidenceHelper}\n${verifyHelper}`).not.toContain(
      "gh release delete",
    );
  });

  it("binds each unpublished internal draft tag to the exact source commit", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toMatch(
      /\$tag\s*=\s*"sahelflow-v\$\(\$authority\.version\)-\$env:SF_SOURCE_COMMIT"/,
    );
    expect(workflow).toMatch(
      /tagName:\s*sahelflow-v__VERSION__-\$\{\{\s*inputs\.source_ref\s*\}\}/,
    );
    expect(workflow).toMatch(
      /releaseCommitish:\s*\$\{\{\s*inputs\.source_ref\s*\}\}/,
    );
  });

  it("stages and verifies the packaged standalone runtime before Bun launch", () => {
    const frontendBuild = read("src-tauri/build-frontend.ts");
    const desktop = read("src-tauri/src/lib.rs");
    const staging = read("src-tauri/src/packaged_runtime.rs");
    const containment = read("src-tauri/src/child_containment.rs");
    const ci = read(".github/workflows/ci.yml");
    const release = read(".github/workflows/release.yml");
    const evidence = read("scripts/generate-evidence-manifest.ts");

    expect(frontendBuild).toContain("writeStandaloneManifest(standaloneDir, APP_VERSION)");
    expect(desktop).toContain("packaged_runtime::stage_standalone");
    expect(desktop).toContain("ContainedChild::spawn_in");
    expect(staging).toContain('const MANIFEST_FILE: &str = "sahelflow-standalone-manifest.json"');
    expect(staging).toContain("cached standalone runtime failed verification");
    expect(containment).toContain("current_directory: Option<&Path>");
    expect(containment).toContain("STARTF_USESTDHANDLES");
    expect(containment).toContain("PROC_THREAD_ATTRIBUTE_HANDLE_LIST");
    expect(containment).toContain("AssignProcessToJobObject");
    expect(containment).toContain("contained_bun_runs_with_explicit_stdio_handles");
    expect(containment).not.toContain("PROC_THREAD_ATTRIBUTE_JOB_LIST");
    expect(ci).toContain("verify-windows-packaged-runtime.ts");
    expect(ci).toContain("Verify bundled Bun through actual contained launcher");
    expect(ci).toContain("SF_CONTAINED_BUN_PATH");
    expect(release).toContain("verify-windows-packaged-runtime.ts");
    expect(release).toContain("Verify Rust runtime and actual contained Bun launcher");
    expect(release).toContain("SF_CONTAINED_BUN_PATH");
    expect(release).toContain("sahelflow-standalone-manifest.json");
    expect(evidence).toContain("verifyStandaloneManifest");
  });

  it("pins the patched sharp runtime and keeps unrelated early failures diagnostic-safe", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      overrides?: Record<string, string>;
    };
    const sidecarPackage = JSON.parse(read("sidecars/whatsapp/package.json")) as {
      dependencies?: Record<string, string>;
    };
    const lockfile = read("bun.lock");
    const release = read(".github/workflows/release.yml");

    expect(packageJson.overrides?.sharp).toBe("0.35.3");
    expect(sidecarPackage.dependencies?.sharp).toBe("0.35.3");
    expect(lockfile).toContain('"sharp": ["sharp@0.35.3"');
    expect(release).toContain("Blocking production dependency audit");
    expect(release).toMatch(
      /Upload staged packaged runtime diagnostics[\s\S]*if-no-files-found:\s*ignore/,
    );
  });

  it("prepares a signed and digest-pinned local libsodium distribution before every Windows Rust build", () => {
    const prepare = read("scripts/prepare-libsodium-windows.ps1");
    const ci = read(".github/workflows/ci.yml");
    const parity = read(".github/workflows/windows-rust-release-parity.yml");
    const release = read(".github/workflows/release.yml");

    expect(prepare).toContain('$libsodiumVersion = "1.0.22"');
    expect(prepare).toContain(
      '$pointArchiveName = "libsodium-$libsodiumVersion-msvc.zip"',
    );
    expect(prepare).toContain('$releaseTag = "$libsodiumVersion-RELEASE"');
    expect(prepare).toContain(
      "3e03a726fac4bc09cb61d8f29d658ef7a5eca0811de59082130414f7ca2e4279",
    );
    expect(prepare).toContain("SODIUM_DIST_DIR");
    expect(prepare).toContain(
      "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3",
    );
    expect(prepare).not.toContain("http://download.libsodium.org");
    expect(ci).toContain("prepare-libsodium-windows.ps1");
    expect(parity).toContain("prepare-libsodium-windows.ps1");
    expect(release).toContain("prepare-libsodium-windows.ps1");
    expect(
      release.indexOf("Prepare signed local libsodium distribution"),
    ).toBeLessThan(
      release.indexOf("Verify Rust runtime and actual contained Bun launcher"),
    );
    expect(release).toContain("sahelflow-libsodium-build-manifest.json");
  });

  it("retains hidden release evidence without widening the upload path", () => {
    const release = read(".github/workflows/release.yml");
    const retainStart = release.indexOf("Retain signed candidate and evidence");
    const handoffStart = release.indexOf("Record publication handoff");
    const retain = release.slice(retainStart, handoffStart);

    expect(retainStart).toBeGreaterThan(-1);
    expect(handoffStart).toBeGreaterThan(retainStart);
    expect(retain).toContain(".sf-evidence/candidate-manifest.json");
    expect(retain).toContain(
      ".sf-build/libsodium-dist/sahelflow-libsodium-build-manifest.json",
    );
    expect(retain).toMatch(/^\s*include-hidden-files:\s*true\s*$/m);
    expect(retain).not.toContain(".env");
    expect(retain).not.toContain(".git/");
  });
});
