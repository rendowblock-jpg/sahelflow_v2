import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("keeps the configured workspace covered until durable UI authority", () => {
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
    const workspaceActivation = recovery.indexOf(
      "activate_configured_workspace(",
      workspaceUrl,
    );
    const navigationDispatched = recovery.indexOf(
      '"workspace-navigation-dispatched"',
      workspaceActivation,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(app.clone(), workspace, app_data_dir)",
      navigationDispatched,
    );

    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(startupPrimeStarted).toBeGreaterThan(validatedHandoff);
    expect(startupActivation).toBeGreaterThan(startupPrimeStarted);
    expect(startupPrimeReady).toBeGreaterThan(startupActivation);
    expect(workspaceUrl).toBeGreaterThan(startupPrimeReady);
    expect(workspaceActivation).toBeGreaterThan(workspaceUrl);
    expect(navigationDispatched).toBeGreaterThan(workspaceActivation);
    expect(readinessMonitor).toBeGreaterThan(navigationDispatched);

    expect(configuration).toContain('"label": "startup"');
    expect(configuration).toContain('"label": "main"');
    expect(configuration).toContain('"visible": true');
    expect(configuration).toContain('"visible": false');
    expect(configuration).toContain('"title": "SahelFlow - Starting"');
    expect(recovery).toContain('STARTUP_WINDOW_LABEL: &str = "startup"');
    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain(
      'STARTUP_RENDERER_MARKER: &str = "sahelflow-startup-renderer-v1"',
    );
    expect(recovery).toContain("renderer_prime_html()");
    expect(recovery).toContain(".eval_with_callback(");
    expect(recovery).toContain("app.run_on_main_thread(move ||");
    expect(recovery).toContain("workspace_for_activation.show()");
    expect(recovery).toContain("workspace_for_activation.set_focus()");
    expect(recovery).toContain("workspace_for_activation.navigate(url)");
    expect(recovery).toContain("startup.set_focus()");
    expect(recovery).toContain(
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
    expect(recovery).not.toContain("window.location.replace(target)");
  });
});
