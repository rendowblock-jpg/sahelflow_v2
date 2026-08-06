import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("keeps the single configured workspace hidden until native session and durable UI authority", () => {
    const recovery = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const configuration = JSON.parse(
      readRepositoryFile("src-tauri/tauri.conf.json"),
    ) as {
      app?: {
        windows?: Array<{
          label?: string;
          title?: string;
          visible?: boolean;
          focus?: boolean;
          url?: string;
        }>;
      };
    };
    const windows = configuration.app?.windows ?? [];
    const mainWindow = windows[0];

    const validatedHandoff = recovery.indexOf(
      "let Some(handoff) = packaged_handoff(&requested_url)? else {",
    );
    const lifecycleHost = recovery.indexOf(
      "shop_lifecycle_host::ensure_started(app)?;",
      validatedHandoff,
    );
    const clearUiReady = recovery.indexOf(
      "clear_file(&app_data_dir.join(RUNTIME_UI_READY_FILE))?;",
      lifecycleHost,
    );
    const hideWorkspace = recovery.indexOf("window.hide()?;", clearUiReady);
    const nativeCookie = recovery.indexOf(
      "window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;",
      hideWorkspace,
    );
    const directRootNavigation = recovery.indexOf(
      "window.navigate(handoff.workspace_url)?;",
      nativeCookie,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(app.clone(), window, app_data_dir);",
      directRootNavigation,
    );

    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(lifecycleHost).toBeGreaterThan(validatedHandoff);
    expect(clearUiReady).toBeGreaterThan(lifecycleHost);
    expect(hideWorkspace).toBeGreaterThan(clearUiReady);
    expect(nativeCookie).toBeGreaterThan(hideWorkspace);
    expect(directRootNavigation).toBeGreaterThan(nativeCookie);
    expect(readinessMonitor).toBeGreaterThan(directRootNavigation);

    expect(windows).toHaveLength(1);
    expect(mainWindow).toMatchObject({
      label: "main",
      title: "SahelFlow",
      visible: false,
    });
    expect(windows.some((window) => window.label === "startup")).toBe(false);
    expect(mainWindow?.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(mainWindow?.url ?? "")).not.toContain("<script");

    expect(recovery).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(recovery).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(recovery).toContain("mod shop_lifecycle_host;");
    expect(recovery).toContain("workspace_url.set_path(\"/\")");
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).toContain(".http_only(true)");
    expect(recovery).toContain(".same_site(SameSite::Lax)");
    expect(recovery).toContain(
      "if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT)",
    );
    expect(recovery).toContain("window.show().and_then(|_| window.set_focus())");

    expect(recovery).not.toContain("STARTUP_WINDOW_LABEL");
    expect(recovery).not.toContain("STARTUP_RENDERER_MARKER");
    expect(recovery).not.toContain("activate_startup_renderer(");
    expect(recovery).not.toContain("activate_configured_workspace(");
    expect(recovery).not.toContain("renderer_prime_html(");
    expect(recovery).not.toContain("run_on_main_thread");
    expect(recovery).not.toContain("WebviewWindowBuilder::new(");
    expect(recovery).not.toContain("WebviewUrl::External(url)");
    expect(recovery).not.toContain("handoff.bootstrap_url");
    expect(recovery).not.toContain("window.location.replace(target)");
  });
});
