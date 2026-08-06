import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("keeps the configured workspace covered until native session and durable UI authority", () => {
    const recovery = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const configuration = readRepositoryFile("src-tauri/tauri.conf.json");

    const validatedHandoff = recovery.indexOf(
      "let handoff = packaged_handoff(&requested_url)?;",
    );
    const startupPrimeStarted = recovery.indexOf(
      '"startup-renderer-prime-started"',
      validatedHandoff,
    );
    const startupActivation = recovery.indexOf(
      "activate_startup_renderer(app)",
      startupPrimeStarted,
    );
    const startupPrimeReady = recovery.indexOf(
      '"startup-renderer-prime-ready"',
      startupActivation,
    );
    const workspaceUrl = recovery.indexOf(
      "let workspace_url = handoff",
      startupPrimeReady,
    );
    const nativeSessionStarted = recovery.indexOf(
      '"workspace-native-session-started"',
      workspaceUrl,
    );
    const workspaceActivation = recovery.indexOf(
      "activate_configured_workspace(",
      nativeSessionStarted,
    );
    const nativeSessionInstalled = recovery.indexOf(
      '"workspace-native-session-installed"',
      workspaceActivation,
    );
    const rootNavigationDispatched = recovery.indexOf(
      '"workspace-root-navigation-dispatched"',
      nativeSessionInstalled,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(app.clone(), workspace, app_data_dir)",
      rootNavigationDispatched,
    );
    const workspaceAuthority = recovery.slice(
      recovery.indexOf("fn activate_configured_workspace("),
      recovery.indexOf("pub fn reset_startup_trace"),
    );
    const nativeCookie = workspaceAuthority.indexOf(".set_cookie(cookie)");
    const directRootNavigation = workspaceAuthority.indexOf(".navigate(url)");

    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(startupPrimeStarted).toBeGreaterThan(validatedHandoff);
    expect(startupActivation).toBeGreaterThan(startupPrimeStarted);
    expect(startupPrimeReady).toBeGreaterThan(startupActivation);
    expect(workspaceUrl).toBeGreaterThan(startupPrimeReady);
    expect(nativeSessionStarted).toBeGreaterThan(workspaceUrl);
    expect(workspaceActivation).toBeGreaterThan(nativeSessionStarted);
    expect(nativeSessionInstalled).toBeGreaterThan(workspaceActivation);
    expect(rootNavigationDispatched).toBeGreaterThan(nativeSessionInstalled);
    expect(readinessMonitor).toBeGreaterThan(rootNavigationDispatched);
    expect(nativeCookie).toBeGreaterThan(-1);
    expect(directRootNavigation).toBeGreaterThan(nativeCookie);

    expect(configuration).toContain('"label": "startup"');
    expect(configuration).toContain('"label": "main"');
    expect(configuration).toContain('"visible": true');
    expect(configuration).toContain('"visible": false');
    expect(configuration).toContain('"focus": true');
    expect(configuration).toContain('"focus": false');
    expect(configuration).toContain('"title": "SahelFlow - Starting"');
    expect(recovery).toContain('STARTUP_WINDOW_LABEL: &str = "startup"');
    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(recovery).toContain(
      'STARTUP_RENDERER_MARKER: &str = "sahelflow-startup-renderer-v1"',
    );
    expect(recovery).toContain("renderer_prime_html()");
    expect(recovery).toContain(".eval_with_callback(");
    expect(recovery).toContain("workspace_url.set_path(\"/\")");
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).toContain("runtime_cookie(&host, &token)");
    expect(recovery).toContain(".http_only(true)");
    expect(recovery).toContain(".same_site(SameSite::Lax)");
    expect(workspaceAuthority).toContain("app.run_on_main_thread(move ||");
    expect(workspaceAuthority).toContain("workspace_for_activation");
    expect(workspaceAuthority).toContain(".set_cookie(cookie)");
    expect(workspaceAuthority).toContain(".show()");
    expect(workspaceAuthority).toContain(".set_focus()");
    expect(workspaceAuthority).toContain(".navigate(url)");
    expect(workspaceAuthority).toContain("startup.set_focus()");
    expect(workspaceAuthority).toContain(
      "recv_timeout(WORKSPACE_ACTIVATION_TIMEOUT)",
    );
    expect(recovery).toContain(
      '"SF-RUNTIME-UI-STARTUP-RENDERER-BLOCKED"',
    );
    expect(recovery).not.toContain("WebviewWindowBuilder::new(");
    expect(recovery).not.toContain("WebviewUrl::External(url)");
    expect(recovery).not.toContain("WORKSPACE_RENDERER_PROBE_SCRIPT");
    expect(recovery).not.toContain("WORKSPACE_RENDERER_MARKER");
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("handoff.bootstrap_url");
    expect(recovery).not.toContain("window.location.replace(target)");
  });
});
