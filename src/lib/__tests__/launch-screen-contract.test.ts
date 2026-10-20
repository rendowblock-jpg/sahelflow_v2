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

  it("shows the full S and 100% only for a launch whose workspace reported ready", () => {
    const open = launchModule.slice(launchModule.indexOf("pub fn open("));
    const native = open.indexOf("if crate::native_splash::is_active()");
    const webview = open.indexOf("WebviewWindowBuilder::new(");
    const follower = open.slice(native, webview);
    // The hand-off needs the window visible, no quit AND this launch's trace
    // saying ui-ready; the recovery page also makes the window visible.
    expect(follower).toMatch(
      /crate::native_splash::handoff_allowed\(\s*workspace_visible\(&app\),[\s\S]*?latest_stage\.as_deref\(\)/,
    );
    expect(follower).toContain("crate::native_splash::current_launch_stage(");
    expect(follower).toContain("crate::native_splash::request_handoff()");
    expect(follower).toContain("crate::native_splash::request_close()");
    const splash = read("src-tauri/src/native_splash.rs");
    expect(splash).toMatch(/latest_stage == Some\("ui-ready"\)/);
    // The renderer paints "complete" by the same rule, from the hand-off flag.
    expect(splash).toContain("super::shows_complete(");
    expect(splash).toContain("super::WORKSPACE_READY.load(");
  });

  it("a panic in the native card ends the card, never the app", () => {
    const splash = read("src-tauri/src/native_splash.rs");
    expect(splash).toContain("run_guarded(|| imp::run(");
    expect(splash).toContain("std::panic::catch_unwind(");
    expect(splash).toMatch(
      /std::panic::catch_unwind\(\s*std::panic::AssertUnwindSafe\(\|\| r\.frame\(\)\)\s*\)/,
    );
  });

  it("treats closing the native card as quit, never as hide, and outlasts a slow launch", () => {
    const splash = read("src-tauri/src/native_splash.rs");
    const closeArm = splash.slice(
      splash.indexOf("WM_CLOSE => {"),
      splash.indexOf("WM_DESTROY => {"),
    );
    expect(closeArm).toContain("QUIT_REQUESTED.store(true");
    expect(closeArm).not.toContain("CLOSE_REQUESTED");
    expect(splash).toContain("pub fn quit_requested()");
    const open = launchModule.slice(launchModule.indexOf("pub fn open("));
    const follower = open.slice(
      open.indexOf("if crate::native_splash::is_active()"),
      open.indexOf("WebviewWindowBuilder::new("),
    );
    expect(follower).toContain("crate::native_splash::quit_requested()");
    expect(follower).toContain("quit_is_safe(&trace_path)");
    expect(follower).toContain("quit_during_startup(&app)");
    // The one stretch where an abrupt exit is not free is the shop migration.
    const safe = launchModule.slice(
      launchModule.indexOf("fn quit_is_safe("),
      launchModule.indexOf("fn launch_url("),
    );
    expect(safe).toContain('"migration-started"');
    // It stops exactly the way a normal close stops.
    expect(launchModule).toContain("crate::begin_normal_close(app.clone())");
    // Neither surface gives up while the launch is still starting.
    expect(launchModule).toContain("Duration::from_secs(30 * 60)");
    expect(splash).toContain("const MAX_LIFETIME_MS: f32 = 30.0 * 60.0 * 1_000.0;");
  });

  it("carries the closing and slow-launch copy in Arabic, French and English", () => {
    // `\s*` after the colon: rustfmt wraps a long string onto the next line.
    expect(launchModule.match(/^\s+closing:\s*"/gm)).toHaveLength(3);
    expect(launchModule.match(/^\s+slow_hint:\s*"/gm)).toHaveLength(3);
    // The brand is the wordmark; it never repeats inside a sentence (it also
    // broke Arabic bidi order: "SahelFlow" jumped to the wrong end).
    expect(launchModule).not.toMatch(/starting: "[^"]*SahelFlow/);
  });

  it("paints inside a shadow margin so the card floats and is never clipped", () => {
    const splash = read("src-tauri/src/native_splash.rs");
    expect(splash).toContain("((CARD_WIDTH + SHADOW_MARGIN * 2.0) * scale)");
    expect(splash).toContain("((CARD_HEIGHT + SHADOW_MARGIN * 2.0) * scale)");
    expect(splash).toContain("GdipTranslateWorldTransform(g, SHADOW_MARGIN, SHADOW_MARGIN");
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
});
