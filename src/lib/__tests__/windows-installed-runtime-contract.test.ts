import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

describe("installed Windows runtime contract", () => {
  it("hard-disables Next telemetry before sealing the packaged standalone tree", () => {
    const build = read("src-tauri/build-frontend.ts");
    const bootstrap = build.indexOf("SahelFlow desktop runtime bootstrap");
    const disableTelemetry = build.indexOf(
      'process.env.NEXT_TELEMETRY_DISABLED ??= "1"',
    );
    const manifest = build.indexOf("writeStandaloneManifest(standaloneDir");

    expect(bootstrap).toBeGreaterThan(-1);
    expect(disableTelemetry).toBeGreaterThan(bootstrap);
    expect(manifest).toBeGreaterThan(disableTelemetry);
  });

  it("retains specific non-secret route and transport readiness failures", () => {
    const route = read("src/app/api/internal/runtime-ready/route.ts");
    const protocol = read("src-tauri/src/runtime_protocol.rs");

    expect(route).toContain(
      'READINESS_DIAGNOSTIC_FILE = "runtime-readiness-diagnostic.json"',
    );
    expect(route).toContain("recordReadinessFailure(payload)");
    expect(route).toContain('code: "RUNTIME_AUTH_DATABASE_INVALID"');
    expect(route).toContain('code: "RUNTIME_AUTH_MISMATCH"');
    expect(route).toContain('code: "RUNTIME_DATABASE_NOT_READY"');
    expect(route).not.toMatch(/diagnostic\s*=\s*\{[^}]*runtimeToken/s);
    expect(route).not.toMatch(/diagnostic\s*=\s*\{[^}]*authSecret/s);

    expect(protocol).toContain(
      'PROBE_DIAGNOSTIC_FILE: &str = "runtime-probe-diagnostic.json"',
    );
    expect(protocol).toContain("declared_http_message_length(&response)");
    expect(protocol).toContain(
      "complete_content_length_response_does_not_require_socket_eof",
    );
    expect(protocol).not.toContain("runtime_token: &self.runtime_token");
  });

  it("keeps low-end startup responsive and retains bounded UI-ready evidence", () => {
    const desktop = read("src-tauri/src/lib.rs");
    const recovery = read("src-tauri/src/startup_recovery.rs");
    const tauriConfig = read("src-tauri/tauri.conf.json");
    const beacon = read("src/components/runtime/runtime-ui-ready-beacon.tsx");
    const uiRoute = read("src/app/api/internal/runtime-ui-ready/route.ts");

    expect(desktop).toContain("startup_recovery::show_starting(&app_handle)");
    expect(desktop).toContain("std::thread::spawn(move ||");
    expect(desktop).toContain("struct PreparedRuntime");
    expect(desktop).toContain("let prepared = prepare_runtime(app)?");
    expect(desktop).toContain("MANDATORY_RUNTIME_READY_TIMEOUT");

    expect(recovery).toContain('STARTUP_TRACE_FILE: &str = "startup-trace.json"');
    expect(recovery).toContain(
      'RUNTIME_UI_DIAGNOSTIC_FILE: &str = "runtime-ui-diagnostic.json"',
    );
    expect(recovery).toContain('"SF-RUNTIME-UI-SESSION-BLOCKED"');
    expect(recovery).toContain('"SF-RUNTIME-UI-BEACON-MISSING"');
    expect(recovery).toContain('STARTUP_WINDOW_LABEL: &str = "startup"');
    expect(recovery).toContain("SahelFlow - Safe startup");
    expect(recovery).toContain("SahelFlow - Startup blocked");
    expect(tauriConfig).toContain('"label": "startup"');
    expect(tauriConfig).toContain('"title": "SahelFlow - Safe startup"');

    expect(beacon).toContain("const RETRY_WINDOW_MS = 75_000");
    expect(beacon).toContain("const REQUEST_TIMEOUT_MS = 5_000");
    expect(beacon).not.toContain("MAX_ATTEMPTS");

    expect(uiRoute).toContain('UI_DIAGNOSTIC_FILE = "runtime-ui-diagnostic.json"');
    expect(uiRoute).toContain('code: "RUNTIME_SESSION_REQUIRED"');
    expect(uiRoute).toContain('code: "RUNTIME_UI_READY_PERSIST_FAILED"');
    expect(uiRoute).not.toMatch(/recordUiDiagnostic\([^)]*expectedToken/s);
    expect(uiRoute).not.toMatch(/recordUiDiagnostic\([^)]*suppliedToken/s);
  });

  it("builds and launches the installed executable twice on an ephemeral Windows runner", () => {
    const workflow = read(".github/workflows/windows-installed-e2e.yml");
    const harness = read("scripts/verify-installed-windows-msi.ps1");
    const treeVerifier = read("scripts/verify-installed-standalone.ts");
    const uiHarness = read("scripts/verify-installed-windows-ui.ps1");
    const desktop = read("src-tauri/src/lib.rs");

    expect(workflow).toContain("contents: read");
    expect(workflow).toContain('      - "sahelflow.version.json"');
    expect(workflow).not.toContain("Persist lifecycle-proven");
    expect(workflow).toContain("bunx tauri build --bundles msi");
    expect(workflow).toContain("verify-installed-windows-msi.ps1");
    expect(workflow).toContain('      - "scripts/standalone-manifest.ts"');
    expect(workflow).toContain("runtime-probe-diagnostic.json");
    expect(harness).toContain('$env:GITHUB_ACTIONS -cne "true"');
    expect(harness).toContain('"C:\\Program Files\\SahelFlow\\sahelflow.exe"');
    expect(harness).toContain("for ($attempt = 1; $attempt -le 2; $attempt++)");
    expect(uiHarness).toContain("Wait-ForPromptVisibleWindow");
    expect(uiHarness).toContain('"SahelFlow - Safe startup"');
    expect(uiHarness).toContain("prompt-responsive-safe-startup-window");
    expect(uiHarness).toContain("$safeStartupWindows.Count -ne 0");
    expect(uiHarness).toContain("$workspaceWindows.Count -ne 1");
    expect(uiHarness).toContain("RUNTIME_UI_READY_PERSISTED");
    expect(uiHarness).toContain("startup-trace-launch-$attempt.json");
    expect(uiHarness).toContain("$maxRuntimePrepareMilliseconds = 15000");
    expect(uiHarness).toContain("$maxAuthenticatedUiMilliseconds = 45000");
    expect(uiHarness).toContain("runtimePreparationMilliseconds");
    expect(harness).toContain("Close-SahelFlowNormally");
    expect(harness).toContain("$installedRuntimeRoot");
    expect(harness).toContain("verify-installed-standalone.ts");
    expect(harness).toContain("completeTreeVerified");
    expect(harness).toContain(
      '$installedNodePath = Join-Path $installedJavascriptRuntimeRoot "node.exe"',
    );
    expect(harness).toContain("expectedNodeSha256");
    expect(harness).toContain("ToLowerInvariant");
    expect(harness).toContain("runtimeIdentityProblems");
    expect(desktop).toContain('app_local_data_dir()?.join("runtime-work")');
    expect(desktop).toContain("spawn_in_capturing_stderr");
    expect(desktop).toContain("redact_runtime_stderr");
    expect(harness).toContain("runtimeWorkExecutables");
    expect(harness).toContain("bunProductionRuntimePresent");
    expect(harness).toContain("Installed Node.js runtime identity does not match");
    expect(harness).toContain("currentNodeSha256");
    expect(uiHarness).toContain("$path.StartsWith");
    expect(treeVerifier).toContain("verifyStandaloneManifest");
    expect(harness).toContain(
      "appDataRuntimeCacheEntryCount = $runtimeCacheEntries.Count",
    );
    expect(harness).toContain(
      "Second launch changed the protected installed runtime or staged an AppData copy",
    );
    expect(desktop).toContain("resolve_installed_standalone");
    expect(desktop).not.toContain("stage_standalone");
    expect(desktop).toContain(".run(|_app_handle, _event| {");
    expect(desktop).toContain("_app_handle.cleanup_before_exit();");
    expect(desktop).toContain("std::process::exit(0);");
  });

  it("installs the exact signed MSI and dispatches only from protected-main release authority", () => {
    const release = read(".github/workflows/release.yml");
    const dispatcher = read(
      ".github/workflows/release-on-version-authority.yml",
    );
    const observer = read(".github/workflows/signed-release-observer.yml");

    const signatureProof = release.indexOf(
      "Verify local MSI and updater signature",
    );
    const installedRuntimeProof = release.indexOf(
      "Install and prove signed runtime launch/reopen",
    );
    const installedUiProof = release.indexOf(
      "Prove signed authenticated hydrated WebView UI twice",
    );
    const evidenceRetention = release.indexOf(
      "Retain signed candidate and evidence",
    );

    expect(signatureProof).toBeGreaterThan(-1);
    expect(installedRuntimeProof).toBeGreaterThan(signatureProof);
    expect(installedUiProof).toBeGreaterThan(installedRuntimeProof);
    expect(evidenceRetention).toBeGreaterThan(installedUiProof);
    expect(release).toContain(
      "./scripts/verify-installed-windows-msi.ps1 -MsiPath $env:SF_MSI_PATH",
    );
    expect(release).toContain("./scripts/verify-installed-windows-ui.ps1");
    expect(release).toContain(
      "${{ runner.temp }}/sahelflow-installed-e2e/**",
    );
    expect(release).toContain("scripts/install-founder-windows.ps1");
    expect(release).toContain("scripts/verify-installed-windows-ui.ps1");

    expect(dispatcher).toContain("branches:\n      - main");
    expect(dispatcher).toContain("- sahelflow.version.json");
    expect(dispatcher).toContain("- .github/release-requests/*.json");
    expect(dispatcher).toContain("workflow_dispatch:");
    expect(dispatcher).toContain("actions: write");
    expect(dispatcher).toContain("issues: write");
    expect(dispatcher).toContain("pull-requests: write");
    expect(observer).toContain("pull-requests: write");
    expect(dispatcher).toContain('source_ref="${SOURCE_SHA}"');
    expect(dispatcher).toContain("gh workflow run release.yml");
    expect(dispatcher).toContain("gh run list");
    expect(dispatcher).toContain("signed workflow dispatch was accepted");
    expect(dispatcher).toContain("Protected signed candidate dispatched");
  });
});
