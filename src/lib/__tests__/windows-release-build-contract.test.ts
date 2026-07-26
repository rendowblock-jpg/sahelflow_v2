import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("Windows signed release build contract", () => {
  it("keeps local release disabled and directs maintainers to the signed exact-source workflow", () => {
    const localRelease = read("scripts/release.ts");

    expect(localRelease).toContain("bun run release is disabled");
    expect(localRelease).toContain("Build Signed Internal Windows Update");
    expect(localRelease).toContain("exact protected-main merge commit SHA");
    expect(localRelease).toContain("draft signed Internal updater");
    expect(localRelease).not.toContain("unsigned internal build evidence");
  });

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

  it("seals the standalone tree and launches the protected installed runtime", () => {
    const frontendBuild = read("src-tauri/build-frontend.ts");
    const desktop = read("src-tauri/src/lib.rs");
    const installedRuntime = read("src-tauri/src/packaged_runtime.rs");
    const containment = read("src-tauri/src/child_containment.rs");
    const ci = read(".github/workflows/ci.yml");
    const release = read(".github/workflows/release.yml");
    const evidence = read("scripts/generate-evidence-manifest.ts");

    expect(frontendBuild).toContain("writeStandaloneManifest(standaloneDir, APP_VERSION)");
    expect(desktop).toContain(
      "packaged_runtime::resolve_installed_standalone",
    );
    expect(desktop).toContain("ContainedChild::spawn_in");
    expect(installedRuntime).toContain(
      'const MANIFEST_FILE: &str = "sahelflow-standalone-manifest.json"',
    );
    expect(installedRuntime).toContain("MSI-protected copy");
    expect(installedRuntime).not.toContain("fs::copy");
    expect(installedRuntime).not.toContain("stage_standalone");
    expect(installedRuntime).not.toContain("Sha256");
    expect(containment).toContain("current_directory: Option<&Path>");
    expect(containment).toContain("STARTF_USESTDHANDLES");
    expect(containment).toContain("PROC_THREAD_ATTRIBUTE_HANDLE_LIST");
    expect(containment).toContain("AssignProcessToJobObject");
    expect(containment).toContain(
      "contained_node_runs_with_explicit_stdio_handles",
    );
    expect(containment).toContain("pub fn try_wait");
    expect(containment).not.toContain("PROC_THREAD_ATTRIBUTE_JOB_LIST");
    expect(ci).toContain("verify-windows-packaged-runtime.ts");
    expect(ci).toContain(
      "Verify bundled Node.js through actual contained launcher",
    );
    expect(ci).toContain("SF_CONTAINED_NODE_PATH");
    expect(release).toContain("verify-windows-packaged-runtime.ts");
    const releaseSandbox = release.indexOf("Prepare disposable test sandbox");
    const releaseDatabase = release.indexOf(
      "Deploy signed-runtime test database migrations",
    );
    const releaseRuntime = release.indexOf(
      "Verify staged packaged runtime reaches authenticated readiness",
    );
    expect(releaseSandbox).toBeGreaterThan(-1);
    expect(releaseDatabase).toBeGreaterThan(releaseSandbox);
    expect(releaseRuntime).toBeGreaterThan(releaseDatabase);
    expect(release).toContain("bunx prisma migrate deploy");
    expect(release).toContain(
      "Attest reviewed identical PR tree and risk-aware required gate",
    );
    expect(release).toContain("$requiredChecks = @('Required PR gate')");
    expect(release).toContain("sourceCommit.tree.sha -cne $headCommit.tree.sha");
    expect(release).toContain("Cache signed-build Rust dependencies");
    expect(release).toContain("sahelflow-standalone-manifest.json");
    expect(evidence).toContain("verifyStandaloneManifest");
  });

  it("pins an official Node.js production runtime and retires packaged Bun", () => {
    const prepareRuntime = read("scripts/prepare-runtime.ts");
    const sidecarBuild = read("scripts/build-sidecar.ts");
    const desktop = read("src-tauri/src/lib.rs");
    const release = read(".github/workflows/release.yml");

    expect(prepareRuntime).toContain('const NODE_VERSION = "22.23.1"');
    expect(prepareRuntime).toContain(
      'const NODE_ARCHIVE_SHA256 = "7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29"',
    );
    expect(prepareRuntime).toContain(
      'const NODE_EXECUTABLE_SHA256 = "f8d162c0641dcee512132f3bcf8a68169c7ecb852efd8e1a46c9fec5a0f469ed"',
    );
    expect(prepareRuntime).toContain('licenseFile: "NODE-LICENSE.txt"');
    expect(prepareRuntime).toContain(
      'rmSync(resolve(runtimeDir, "bun.exe"), { force: true })',
    );
    expect(prepareRuntime).toContain(
      'role: "build-only-sidecar-compiler"',
    );
    expect(prepareRuntime).toContain("packaged: false");
    expect(prepareRuntime).toContain(
      'const BUN_COMPILER_EXECUTABLE_SHA256 = "9005d0d585d80425e9b715690de3e614651124c94458ef3d3a302ca1a6d3d813"',
    );
    expect(sidecarBuild).toContain(".sf-build");
    expect(sidecarBuild).toContain("--compile-executable-path");
    expect(sidecarBuild).not.toContain('"resources"');
    expect(release).toContain(
      ".sf-build/tools/bun-compiler-manifest.json",
    );
    expect(desktop).toContain("fn bundled_node");
    expect(desktop).toContain('"node.exe"');
    expect(desktop).not.toContain("fn bundled_bun");
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
    expect(release).toContain("Required PR gate");
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
      release.indexOf("Build signed updater artifacts into a draft release"),
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
