import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("creates the authenticated workspace on Tauri's main thread with the loopback bootstrap as its initial URL", () => {
    const recovery = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const configuration = readRepositoryFile("src-tauri/tauri.conf.json");

    const validatedHandoff = recovery.indexOf(
      "let handoff = packaged_handoff(&requested_url)?;",
    );
    const workspaceUrl = recovery.indexOf(
      "let workspace_url = handoff",
      validatedHandoff,
    );
    const workspaceCreation = recovery.indexOf(
      "create_workspace_window(app, workspace_url, packaged)?",
      workspaceUrl,
    );
    const mainThreadDispatch = recovery.indexOf(
      "app.run_on_main_thread(move ||",
      workspaceCreation,
    );
    const initialExternalUrl = recovery.indexOf(
      "WebviewUrl::External(url)",
      mainThreadDispatch,
    );
    const creationReceipt = recovery.indexOf(
      "recv_timeout(WORKSPACE_WINDOW_CREATION_TIMEOUT)",
      initialExternalUrl,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(app.clone(), workspace, app_data_dir)",
      workspaceCreation,
    );

    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(workspaceUrl).toBeGreaterThan(validatedHandoff);
    expect(workspaceCreation).toBeGreaterThan(workspaceUrl);
    expect(mainThreadDispatch).toBeGreaterThan(workspaceCreation);
    expect(initialExternalUrl).toBeGreaterThan(mainThreadDispatch);
    expect(creationReceipt).toBeGreaterThan(initialExternalUrl);
    expect(readinessMonitor).toBeGreaterThan(workspaceCreation);

    expect(configuration).toContain('"label": "startup"');
    expect(configuration).toContain('"visible": false');
    expect(recovery).toContain('STARTUP_WINDOW_LABEL: &str = "startup"');
    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain("WebviewWindowBuilder::new(");
    expect(recovery).toContain("WebviewUrl::External(url)");
    expect(recovery).toContain("BOOTSTRAP_WINDOW_TITLE");
    expect(recovery).toContain(".visible(true)");
    expect(recovery).toContain('"workspace-window-creating"');
    expect(recovery).toContain('"workspace-window-created"');
    expect(recovery).toContain("WORKSPACE_WINDOW_CREATION_TIMEOUT");
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("renderer_is_ready(");
    expect(recovery).not.toContain("window.location.replace(target)");
  });
});
