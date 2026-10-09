import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// FD-068: the launch screen covers the wait but never becomes a second
// startup authority. FD-025's hidden main window still decides readiness.
describe("FD-068 launch screen", () => {
  const launchModule = read("src-tauri/src/launch_screen.rs");
  const template = read("src-tauri/src/launch_screen.html");
  const desktop = read("src-tauri/src/lib.rs");
  const capability = JSON.parse(read("src-tauri/capabilities/default.json")) as {
    windows: string[];
  };

  it("is presentation only: no navigation, scripts, IPC or business data", () => {
    expect(launchModule).toContain('LAUNCH_WINDOW_LABEL: &str = "launch"');
    expect(launchModule).not.toContain(".navigate(");
    expect(launchModule).not.toContain("set_cookie");
    expect(launchModule).not.toContain("runtime-endpoint");
    expect(template.toLowerCase()).not.toContain("<script");
    expect(template).not.toMatch(/https?:\/\//);
    expect(template).toContain("data-pct");
    expect(launchModule).toContain(".always_on_top(true)");
    expect(launchModule).toContain("launch-screen.html");
    expect(capability.windows).toEqual(["main"]);
  });

  it("never shares the workspace title that installed evidence keys on", () => {
    expect(launchModule).toContain('LAUNCH_WINDOW_TITLE: &str = "SahelFlow - Starting"');
    expect(launchModule).not.toMatch(/\.title\("SahelFlow"\)/);
  });

  it("closes as soon as the main window is visible, success or recovery", () => {
    const loop = launchModule.slice(launchModule.indexOf("fn follow_startup"));
    expect(loop).toContain("if workspace_visible(&app)");
    expect(loop).toContain("window.destroy()");
    expect(launchModule).toContain('WORKSPACE_WINDOW_LABEL: &str = "main"');
  });

  it("opens after the startup trace resets and never during root rotation", () => {
    const pending = desktop.indexOf('"workspace-window-pending"');
    const open = desktop.indexOf("launch_screen::open(&app_handle, &app_data_dir)");
    expect(pending).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(pending);
    expect(desktop.slice(pending, open)).toContain("if !rotate_installation_root");
  });

  it("paints natively before recovery, Tauri or any WebView, and never during rotation", () => {
    const main = read("src-tauri/src/main.rs");
    const splash = read("src-tauri/src/native_splash.rs");
    const rotationReturn = main.indexOf("sahelflow_lib::run();\n            return;");
    const start = main.indexOf("sahelflow_lib::native_splash::start();");
    const recovery = main.indexOf("survivability_controller::recover_pending_before_run()", start);
    expect(rotationReturn).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(rotationReturn);
    expect(recovery).toBeGreaterThan(start);
    // A second launch only focuses the running instance: no splash flashes.
    expect(splash).toContain('format!("{IDENTIFIER}-sim")');
    expect(splash).toContain("if another_instance_running()");
    // Presentation only.
    expect(splash).not.toContain(".navigate(");
    expect(splash).not.toContain("set_cookie");
    expect(splash).not.toContain("runtime-endpoint");
    expect(splash).toContain("launch_screen::LAUNCH_WINDOW_TITLE");
    // Honest progress from this launch's trace only, never the previous one.
    expect(splash).toContain("current_launch_stage(&self.trace_path, self.started_unix_ms)");
    expect(splash).toContain(".clamp(1, 99)");
  });

  it("hands the native splash its close signal instead of building a second launch surface", () => {
    const open = launchModule.slice(launchModule.indexOf("pub fn open("));
    const native = open.indexOf("if crate::native_splash::is_active()");
    const webview = open.indexOf("WebviewWindowBuilder::new(");
    expect(native).toBeGreaterThan(-1);
    expect(webview).toBeGreaterThan(native);
    const follower = open.slice(native, webview);
    expect(follower).toContain("!workspace_visible(&app)");
    expect(follower).toContain("crate::native_splash::request_close()");
    expect(follower).toContain("return;");
  });

  it("keeps saying 'opening' through the final workspace load", () => {
    expect(launchModule).toContain('"ui-navigation-started" => (Phase::Opening');
    expect(launchModule).toContain('"ui-ready" => (Phase::Opening');
  });

  it("builds the hidden workspace window after the startup thread starts", () => {
    const configuration = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      app: { windows: Array<{ label: string; create?: boolean }> };
    };
    expect(configuration.app.windows[0]).toMatchObject({ label: "main", create: false });
    const setup = desktop.slice(desktop.indexOf(".setup(move |app| {"));
    const thread = setup.indexOf("std::thread::spawn(move || {");
    const workspace = setup.indexOf("create_workspace_window(app)?;");
    expect(thread).toBeGreaterThan(-1);
    expect(workspace).toBeGreaterThan(thread);
    const proven = read("src-tauri/src/startup_recovery/proven.rs");
    expect(proven).toContain("fn workspace_window(app: &tauri::AppHandle)");
  });

  it("keeps the configured window list to the single hidden workspace", () => {
    const configuration = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      app: { windows: Array<{ label: string; visible: boolean }> };
    };
    expect(configuration.app.windows).toHaveLength(1);
    expect(configuration.app.windows[0]).toMatchObject({ label: "main", visible: false });
  });

  // Installed Internal.42 painted "Sahe Flo": GDI+ character trimming dropped
  // the last glyph of each wordmark run, and the halo showed stepped rings.
  it("never trims splash text and paints a dithered halo", () => {
    const splash = read("src-tauri/src/native_splash.rs");
    expect(splash).toContain("StringFormatFlagsNoWrap | StringFormatFlagsNoClip");
    expect(splash).toContain("GdipSetStringFormatTrimming(format, StringTrimmingNone)");
    expect(splash).toMatch(/sahel \+ WORD_SLACK/);
    expect(splash).toMatch(/flow \+ WORD_SLACK/);
    expect(splash).not.toMatch(/(sahel|flow) \+ 8\.0/);
    expect(splash).toContain("fn dither(x: u32, y: u32)");
    expect(splash).toContain("self.glow.paint(");
    expect(splash).not.toContain("GdipCreatePathGradientFromPath");
  });
});
