import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("creates the authenticated workspace with the loopback bootstrap as its initial URL", () => {
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
    const builder = recovery.indexOf(
      "WebviewWindowBuilder::new(",
      workspaceCreation,
    );
    const mainLabel = recovery.indexOf("MAIN_WINDOW_LABEL", builder);
    const initialExternalUrl = recovery.indexOf(
      "WebviewUrl::External(url)",
      mainLabel,
    );
    const startingTitle = recovery.indexOf(
      "BOOTSTRAP_WINDOW_TITLE",
      initialExternalUrl,
    );
    const visibleWorkspace = recovery.indexOf(".visible(true)", startingTitle);
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(",
      visibleWorkspace,
    );

    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(workspaceUrl).toBeGreaterThan(validatedHandoff);
    expect(workspaceCreation).toBeGreaterThan(workspaceUrl);
    expect(builder).toBeGreaterThan(workspaceCreation);
    expect(mainLabel).toBeGreaterThan(builder);
    expect(initialExternalUrl).toBeGreaterThan(mainLabel);
    expect(startingTitle).toBeGreaterThan(initialExternalUrl);
    expect(visibleWorkspace).toBeGreaterThan(startingTitle);
    expect(readinessMonitor).toBeGreaterThan(visibleWorkspace);

    expect(configuration).toContain('"label": "startup"');
    expect(configuration).toContain('"visible": false');
    expect(recovery).toContain('STARTUP_WINDOW_LABEL: &str = "startup"');
    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain('"workspace-window-creating"');
    expect(recovery).toContain('"workspace-window-created"');
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("renderer_is_ready(");
    expect(recovery).not.toContain("run_on_main_thread(");
    expect(recovery).not.toContain("window.location.replace(target)");
  });
});
