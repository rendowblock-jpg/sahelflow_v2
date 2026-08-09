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

  it("keeps one hidden workspace non-authoritative until bounded authenticated UI-ready evidence", () => {
    const desktop = read("src-tauri/src/lib.rs");
    const recovery = read("src-tauri/src/startup_recovery.rs");
    const tauriConfig = read("src-tauri/tauri.conf.json");
    const windows = (
      JSON.parse(tauriConfig) as {
        app?: { windows?: Array<Record<string, unknown>> };
      }
    ).app?.windows;
    const mainWindow = windows?.find((window) => window.label === "main");
    const beacon = read("src/components/runtime/runtime-ui-ready-beacon.tsx");
    const dashboardLayout = read("src/components/layout/dashboard-layout.tsx");
    const uiRoute = read("src/app/api/internal/runtime-ui-ready/route.ts");
    const runtimeRoute = read("src/app/api/internal/runtime-ready/route.ts");
    const shutdownRoute = read("src/app/api/internal/runtime-shutdown/route.ts");
    const proxy = read("src/proxy.ts");
    const compileCache = read("src/lib/runtime/compile-cache.ts");
    const rootLayout = read("src/app/layout.tsx");
    const dashboardRouteLayout = read("src/app/(dashboard)/layout.tsx");
    const setupPage = read("src/app/setup/page.tsx");
    const loginPage = read("src/app/login/page.tsx");

    expect(desktop).not.toContain("startup_recovery::show_starting");
    expect(desktop).not.toContain('get_webview_window("startup")');
    expect(desktop).not.toContain('label == "main" || label == "startup"');
    expect(desktop).toContain("if window.is_visible().unwrap_or(false)");
    expect(desktop).toContain('"workspace-window-pending"');
    expect(desktop).toContain("std::thread::spawn(move ||");
    expect(desktop).toContain("struct PreparedRuntime");
    expect(desktop).toContain("let prepared = prepare_runtime(app)?");
    expect(desktop).toContain("MANDATORY_RUNTIME_READY_TIMEOUT");
    expect(desktop).toContain('"runtime-listening"');
    expect(desktop).toContain('"NODE_COMPILE_CACHE"');
    expect(desktop).toContain('.join("node-compile-cache")');

    expect(recovery).toContain('STARTUP_TRACE_FILE: &str = "startup-trace.json"');
    expect(recovery).toContain(
      'RUNTIME_UI_DIAGNOSTIC_FILE: &str = "runtime-ui-diagnostic.json"',
    );
    expect(recovery).toContain('"SF-RUNTIME-UI-SESSION-BLOCKED"');
    expect(recovery).toContain('"SF-RUNTIME-UI-BEACON-MISSING"');
    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(recovery).toContain("mod shop_lifecycle_host;");
    expect(recovery).toContain("shop_lifecycle_host::ensure_started(app)?;");
    expect(recovery).toContain("window.hide()?;");
    expect(recovery).toContain(
      "window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;",
    );
    expect(recovery).toContain("window.navigate(handoff.workspace_url)?;");
    expect(recovery).toContain("workspace_url.set_path(\"/\")");
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).toContain(".http_only(true)");
    expect(recovery).toContain(".same_site(SameSite::Lax)");
    expect(recovery).not.toContain("STARTUP_WINDOW_LABEL");
    expect(recovery).not.toContain("activate_startup_renderer(");
    expect(recovery).not.toContain("activate_configured_workspace(");
    expect(recovery).not.toContain("renderer_prime_html(");
    expect(recovery).not.toContain("run_on_main_thread");
    expect(recovery).not.toContain("WebviewWindowBuilder::new(");
    expect(recovery).not.toContain("WebviewUrl::External(url)");
    expect(recovery).not.toContain("WORKSPACE_RENDERER_PROBE_SCRIPT");
    expect(recovery).toContain(
      "if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT)",
    );
    expect(recovery).toContain("window.show().and_then(|_| window.set_focus())");
    expect(recovery).toContain("SahelFlow - Startup blocked");
    expect(windows).toHaveLength(1);
    expect(mainWindow).toMatchObject({
      label: "main",
      title: "SahelFlow",
      visible: false,
    });

    expect(beacon).toContain("const RETRY_WINDOW_MS = 75_000");
    expect(beacon).toContain("const REQUEST_TIMEOUT_MS = 5_000");
    expect(beacon).not.toContain("MAX_ATTEMPTS");
    expect(rootLayout).not.toContain("<RuntimeUiReadyBeacon />");
    const setupGuard = dashboardRouteLayout.indexOf("if (!(await isAuthSetup())");
    const authGuard = dashboardRouteLayout.indexOf("if (!(await isAuthenticated())");
    const beaconIndex = dashboardRouteLayout.indexOf("<RuntimeUiReadyBeacon />");
    const childrenIndex = dashboardRouteLayout.indexOf("{children}");
    expect(setupGuard).toBeGreaterThan(-1);
    expect(authGuard).toBeGreaterThan(setupGuard);
    expect(beaconIndex).toBeGreaterThan(authGuard);
    expect(childrenIndex).toBeGreaterThan(beaconIndex);
    expect(setupPage).toContain("<RuntimeUiReadyBeacon />");
    expect(loginPage).toContain("<RuntimeUiReadyBeacon />");

    expect(dashboardLayout).toContain('import dynamic from "next/dynamic"');
    expect(dashboardLayout).toContain('import("@/components/command-palette")');
    expect(dashboardLayout).toContain("{commandOpen && (");
    expect(dashboardLayout).toContain("{cheatsheetOpen && (");

    expect(uiRoute).toContain('UI_DIAGNOSTIC_FILE = "runtime-ui-diagnostic.json"');
    expect(uiRoute).toContain('code: "RUNTIME_SESSION_REQUIRED"');
    expect(uiRoute).toContain('code: "RUNTIME_UI_READY_PERSIST_FAILED"');
    expect(compileCache).toContain("getBuiltinModule?.(");
    expect(compileCache).toContain('"node:module"');
    expect(compileCache).toContain("moduleApi.flushCompileCache()");
    expect(uiRoute).toContain('locale: runtimeLocale(request)');
    expect(runtimeRoute).not.toContain("flushPackagedCompileCache");
    expect(uiRoute).not.toContain("flushPackagedCompileCache");
    expect(shutdownRoute).toContain("flushPackagedCompileCache()");
    expect(shutdownRoute).toContain('request.headers.get("authorization")');
    expect(shutdownRoute).toContain(
      'request.headers.get("x-sahelflow-runtime-instance")',
    );
    expect(shutdownRoute).toContain("constantTimeEqual(suppliedToken, expectedToken)");
    expect(shutdownRoute).toContain(
      'SHUTDOWN_DIAGNOSTIC_FILE = "runtime-shutdown-diagnostic.json"',
    );
    expect(shutdownRoute).toContain('code: "RUNTIME_COMPILE_CACHE_FLUSHED"');
    expect(shutdownRoute).toContain("cacheFileCount: cache.fileCount");
    expect(shutdownRoute).toContain("fsyncSync(handle)");
    expect(proxy).toContain("pathname === RUNTIME_SHUTDOWN_PATH");
    expect(proxy).toContain('request.method !== "POST"');
    expect(proxy).toContain("constantTimeEqual(suppliedInstanceId, expectedInstanceId)");
    expect(compileCache).not.toContain('await import("node:module")');
    expect(uiRoute).not.toMatch(/recordUiDiagnostic\([^)]*expectedToken/s);
    expect(uiRoute).not.toMatch(/recordUiDiagnostic\([^)]*suppliedToken/s);
  });

  it("authorizes updater IPC from the authenticated loopback workspace", () => {
    const capability = JSON.parse(
      read("src-tauri/capabilities/default.json"),
    ) as {
      windows?: string[];
      remote?: { urls?: string[] };
      permissions?: string[];
    };
    const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      app?: {
        windows?: Array<{
          label?: string;
          title?: string;
          visible?: boolean;
          focus?: boolean;
        }>;
        security?: { csp?: string };
      };
    };
    const nextConfig = read("next.config.ts");
    const updater = read("src/components/updater/update-checker.tsx");
    const rootLayout = read("src/app/layout.tsx");
    const dashboardLayout = read("src/components/layout/dashboard-layout.tsx");
    const mainWindow = tauriConfig.app?.windows?.find(
      (window) => window.label === "main",
    );

    expect(capability.windows).toContain("main");
    expect(capability.remote?.urls).toEqual([
      "http://127.0.0.1:*",
      "http://localhost:*",
    ]);
    expect(capability.permissions).toContain("updater:default");
    expect(capability.permissions).not.toContain("process:default");
    expect(tauriConfig.app?.security?.csp).toContain(
      "connect-src 'self' ipc: http://ipc.localhost",
    );
    expect(tauriConfig.app?.windows).toHaveLength(1);
    expect(mainWindow).toMatchObject({
      label: "main",
      title: "SahelFlow",
      visible: false,
    });
    expect(nextConfig).toContain(
      '"connect-src \'self\' ipc: http://ipc.localhost',
    );
    expect(updater).toContain("isUpdaterAccessFailure(err)");
    expect(updater).toContain("isUpdaterTransientFailure(err)");
    expect(updater).toContain("!transientFailure && isUpdaterAccessFailure(err)");
    expect(updater).toContain("wsaeacces");
    expect(updater).not.toContain("not allowed|permission|capabilit|ipc");
    expect(updater).toContain("UPDATER_RETRY_DELAYS_MS");
    expect(updater).toContain("UPDATER_CURRENT_POLL_INTERVAL_MS");
    expect(updater).toContain("retryIndex < UPDATER_RETRY_DELAYS_MS.length");
    expect(updater).toContain("check failed; periodic recovery retained:");
    expect(updater).not.toContain("setDialogOpen(true);\n            return;");
    expect(updater).not.toContain("if (cancelled || !update) return");
    expect(updater).not.toContain("Silently fail on auto-check");
    expect(updater).not.toContain("Manual check button");
    expect(rootLayout).toContain('import { Toaster } from "@/components/ui/sonner"');
    expect(rootLayout).toContain("<Toaster");
    expect(dashboardLayout).not.toContain("<Toaster");
  });

  it("builds and launches the installed executable twice on an ephemeral Windows runner", () => {
    const workflow = read(".github/workflows/windows-installed-e2e.yml");
    const classifier = read("scripts/classify-pr-risk.ts");
    const harness = read("scripts/verify-installed-windows-msi.ps1");
    const treeVerifier = read("scripts/verify-installed-standalone.ts");
    const uiHarness = read("scripts/verify-installed-windows-ui.ps1");
    const packagedRuntimeHarness = read(
      "scripts/verify-windows-packaged-runtime.ts",
    );
    const desktop = read("src-tauri/src/lib.rs");
    const containment = read("src-tauri/src/child_containment.rs");
    const expectedNodeBootstrap =
      "(entry=>{const fs=require('fs'),crypto=require('crypto'),frame=Buffer.alloc(40);let offset=0;while(offset<frame.length){const read=fs.readSync(0,frame,offset,frame.length-offset,null);if(read===0){frame.fill(0);throw Error('SF_INSTALLATION_ROOT_FRAME_missing')}offset+=read}const extra=Buffer.alloc(1),extraRead=fs.readSync(0,extra,0,1,null);extra.fill(0);const expected=Buffer.from('SFRK0001','ascii');if(extraRead!==0||!crypto.timingSafeEqual(frame.subarray(0,8),expected)){frame.fill(0);throw Error('SF_INSTALLATION_ROOT_FRAME_invalid')}const key=Buffer.alloc(32);frame.copy(key,0,8);frame.fill(0);let used=false;const symbol=Symbol.for('sahelflow.installation-root.v1');Object.defineProperty(globalThis,symbol,{configurable:true,enumerable:false,value:()=>{if(used)throw Error('SF_INSTALLATION_ROOT_FRAME_consumed');used=true;delete globalThis[symbol];return key}});if(!entry)throw(Error('SF_NODE_ENTRYPOINT_missing'));if(entry.length<3||entry[1]!==':'||entry[2]!=='/')throw(Error('SF_NODE_ENTRYPOINT_invalid'));process.argv[1]=entry;require(entry)})(process.env.SF_NODE_ENTRYPOINT)";

    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(classifier).toContain('path === "sahelflow.version.json"');
    expect(workflow).not.toContain("Persist lifecycle-proven");
    expect(workflow).toContain("bunx tauri build --bundles msi");
    expect(workflow).toContain("verify-installed-windows-msi.ps1");
    expect(classifier).toContain('path === "scripts/standalone-manifest.ts"');
    expect(workflow).toContain("runtime-probe-diagnostic.json");
    expect(harness).toContain('$env:GITHUB_ACTIONS -cne "true"');
    expect(harness).toContain('"C:\\Program Files\\SahelFlow\\sahelflow.exe"');
    expect(harness).toContain("$lifecyclePasses = 3");
    expect(harness).toContain(
      "for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++)",
    );
    const lifecycleLoop = harness.indexOf(
      "for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++)",
    );
    const lifecycleEvidenceReset = harness.indexOf(
      "Remove-Item -LiteralPath $runtimeEndpointPath, $startupDiagnosticPath",
      lifecycleLoop,
    );
    const lifecycleLaunch = harness.indexOf(
      "$process = Start-Process -FilePath $exe -PassThru",
      lifecycleLoop,
    );
    expect(lifecycleEvidenceReset).toBeGreaterThan(lifecycleLoop);
    expect(lifecycleEvidenceReset).toBeLessThan(lifecycleLaunch);
    expect(uiHarness).toContain("$lifecyclePasses = 3");
    expect(uiHarness).toContain(
      "for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++)",
    );
    expect(uiHarness).not.toContain("Wait-ForPromptVisibleWindow");
    expect(uiHarness).not.toContain("StartupWindowHandle");
    expect(uiHarness).toContain(
      "workspace became visible before authenticated readiness evidence",
    );
    expect(uiHarness).toContain("workspace-window-pending");
    expect(uiHarness).toContain("Wait-ForNodeCompileCache");
    expect(uiHarness).toContain("Wait-ForRuntimeShutdownDiagnostic");
    expect(uiHarness).toContain("runtime-shutdown-launch-$attempt.json");
    expect(uiHarness).not.toContain("Reset-NodeCompileCacheForCloseProof");
    expect(
      uiHarness.lastIndexOf("$closures += Close-SahelFlowNormally"),
    ).toBeLessThan(uiHarness.lastIndexOf("Wait-ForNodeCompileCache"));
    expect(uiHarness).toContain("Wait-ForCompleteStartupTrace");
    expect(uiHarness).toContain("startup trace did not settle within 5 seconds");
    expect(uiHarness).toContain("executableOrSourceFiles = 0");
    expect(uiHarness).toContain("$workspaceWindows.Count -ne 1");
    expect(uiHarness).toContain("RUNTIME_UI_READY_PERSISTED");
    expect(uiHarness).toContain("startup-trace-launch-$attempt.json");
    expect(uiHarness).toContain("$maxRuntimePrepareMilliseconds = 15000");
    expect(uiHarness).toContain("$maxAuthenticatedUiMilliseconds = 100000");
    expect(uiHarness).toContain("Last observation:");
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
    expect(desktop).toContain("spawn_in_capturing_stderr_with_stdin_frame");
    expect(desktop).toContain("summarize_runtime_stderr");
    expect(desktop).toContain("raw output suppressed");
    expect(desktop).toContain('NODE_ENTRYPOINT_ENV: &str = "SF_NODE_ENTRYPOINT"');
    expect(desktop).toContain("node_entrypoint_environment_value");
    expect(desktop).toContain('raw.strip_prefix(r"\\\\?\\")');
    expect(desktop).toContain('OsString::from("--eval")');
    expect(desktop).toContain(expectedNodeBootstrap);
    expect(containment).toContain("std::fs::canonicalize(&script)");
    expect(containment).toContain("crate::node_entrypoint_environment_value");
    expect(containment).toContain("crate::NODE_ENTRYPOINT_ENV");
    expect(containment).toContain("crate::NODE_ENTRYPOINT_BOOTSTRAP");
    expect(packagedRuntimeHarness).toContain("nodeEntrypointPath");
    expect(packagedRuntimeHarness).toContain(
      "SF_NODE_ENTRYPOINT: stagedNodeEntrypoint",
    );
    expect(packagedRuntimeHarness).toContain(expectedNodeBootstrap);
    expect(packagedRuntimeHarness).toContain(
      'SF_INSTALLATION_ROOT_SOURCE: "native-stdin-v1"',
    );
    expect(packagedRuntimeHarness).toContain("installationRootFrame.fill(0)");
    expect(packagedRuntimeHarness).toContain(
      '[stagedNode, "--eval", NODE_ENTRYPOINT_BOOTSTRAP]',
    );
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
      "A later launch changed the protected installed runtime or staged an AppData copy",
    );
    expect(desktop).toContain("resolve_installed_standalone");
    expect(desktop).not.toContain("stage_standalone");
    expect(desktop).toContain(".run(|_app_handle, _event| {");
    expect(desktop).toContain(".on_window_event(|_window, _event| {");
    expect(desktop).toContain("api.prevent_close();");
    expect(desktop).toContain("let _ = _window.hide();");
    expect(desktop).toContain("begin_normal_close(_window.app_handle().clone())");
    expect(desktop).toContain("struct ShutdownCoordinator");
    expect(desktop).toContain("struct RuntimeShutdownAuthority");
    expect(desktop).toContain(
      "RuntimeShutdownAuthority::from_protocol(&runtime_protocol)",
    );
    expect(desktop).toContain("children.shutdown_authority = None;");
    expect(desktop).not.toContain("remember_runtime_shutdown_authority");
    expect(desktop).toContain("POST /api/internal/runtime-shutdown");
    expect(desktop).toContain("Duration::from_secs(3)");
    expect(desktop).toContain("app.exit(0);");
    expect(desktop).not.toContain("cleanup_before_exit();");
    const rotationBranchStart = desktop.indexOf("if rotate_installation_root {");
    const ordinaryStartupStart = desktop.indexOf(
      "// Validate the registry and migrate every registered shop",
      rotationBranchStart,
    );
    expect(rotationBranchStart).toBeGreaterThan(-1);
    expect(ordinaryStartupStart).toBeGreaterThan(rotationBranchStart);
    const applicationBuildFailureStart = desktop.indexOf(
      "let application = match application",
      ordinaryStartupStart,
    );
    const applicationRunStart = desktop.indexOf(
      "application.run(",
      applicationBuildFailureStart,
    );
    expect(applicationBuildFailureStart).toBeGreaterThan(ordinaryStartupStart);
    expect(applicationRunStart).toBeGreaterThan(applicationBuildFailureStart);
    const rotationBranch = desktop.slice(rotationBranchStart, ordinaryStartupStart);
    const ordinaryStartup = desktop.slice(
      ordinaryStartupStart,
      applicationBuildFailureStart,
    );
    const applicationBuildFailure = desktop.slice(
      applicationBuildFailureStart,
      applicationRunStart,
    );
    expect(rotationBranch).toContain("std::process::exit(0);");
    expect(rotationBranch).toContain("std::process::exit(1);");
    expect(rotationBranch).not.toContain("runtime_protocol::remove_manifest");
    expect(ordinaryStartup).not.toContain("std::process::exit(0);");
    expect(ordinaryStartup).not.toContain("std::process::exit(1);");
    expect(applicationBuildFailure).toContain('"desktop startup"');
    expect(applicationBuildFailure).toContain("std::process::exit(1);");
    expect(desktop).toContain("let builder = if rotate_installation_root");
  });

  it("holds native process authority before migration or root rotation", () => {
    const desktop = read("src-tauri/src/lib.rs");
    const authority = read("src-tauri/src/process_authority.rs");
    const acquire = desktop.indexOf(
      "let process_authority = process_authority::acquire()?",
    );
    const migration = desktop.indexOf(
      "migration_coordinator::prepare_packaged_installation(",
      acquire,
    );
    const rotation = desktop.indexOf(
      "installation_root_rotation::rotate_packaged_installation_root(",
      acquire,
    );

    expect(desktop).toContain("let builder = if rotate_installation_root");
    expect(acquire).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(acquire);
    expect(rotation).toBeGreaterThan(acquire);
    expect(desktop).toContain("app.manage(process_authority)");
    expect(authority).toContain(
      'PROCESS_AUTHORITY_MUTEX: &str = "Local\\\\SahelFlow.NativeProcessAuthority.v1"',
    );
    expect(authority).toContain("WaitForSingleObject(handle, 0)");
    expect(authority).toContain("WAIT_OBJECT_0 | WAIT_ABANDONED");
    expect(authority).toContain(
      "another SahelFlow desktop or installation-root rotation process is active",
    );
    expect(authority).toContain("concurrent_process_authority_is_rejected");
    expect(authority).toContain("released_process_authority_can_be_reacquired");
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
    expect(observer).toContain("      - completed");
    expect(observer).not.toContain("      - requested");
    expect(dispatcher).toContain('source_ref="${SOURCE_SHA}"');
    expect(dispatcher).toContain("gh workflow run release.yml");
    expect(dispatcher).toContain("gh run list");
    expect(dispatcher).toContain("signed workflow dispatch was accepted");
    expect(dispatcher).toContain("Protected signed candidate dispatched");
  });
});
