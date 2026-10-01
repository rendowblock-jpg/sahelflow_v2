import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// FD-068: the launch screen covers the wait but never becomes a second
// startup authority. FD-025's hidden main window still decides readiness.
describe("FD-068 launch screen", () => {
  const module = read("src-tauri/src/launch_screen.rs");
  const template = read("src-tauri/src/launch_screen.html");
  const desktop = read("src-tauri/src/lib.rs");
  const capability = JSON.parse(read("src-tauri/capabilities/default.json")) as {
    windows: string[];
  };

  it("is presentation only: no navigation, scripts, IPC or business data", () => {
    expect(module).toContain('LAUNCH_WINDOW_LABEL: &str = "launch"');
    expect(module).not.toContain(".navigate(");
    expect(module).not.toContain("set_cookie");
    expect(module).not.toContain("runtime-endpoint");
    expect(template.toLowerCase()).not.toContain("<script");
    expect(template).not.toMatch(/https?:\/\//);
    expect(capability.windows).toEqual(["main"]);
  });

  it("never shares the workspace title that installed evidence keys on", () => {
    expect(module).toContain('LAUNCH_WINDOW_TITLE: &str = "SahelFlow - Starting"');
    expect(module).not.toMatch(/\.title\("SahelFlow"\)/);
  });

  it("closes as soon as the main window is visible, success or recovery", () => {
    const loop = module.slice(module.indexOf("fn follow_startup"));
    expect(loop).toContain("if workspace_visible(&app)");
    expect(loop).toContain("window.destroy()");
    expect(module).toContain('WORKSPACE_WINDOW_LABEL: &str = "main"');
  });

  it("opens after the startup trace resets and never during root rotation", () => {
    const pending = desktop.indexOf('"workspace-window-pending"');
    const open = desktop.indexOf("launch_screen::open(&app_handle, &app_data_dir)");
    expect(pending).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(pending);
    expect(desktop.slice(pending, open)).toContain("if !rotate_installation_root");
  });

  it("keeps the configured window list to the single hidden workspace", () => {
    const configuration = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      app: { windows: Array<{ label: string; visible: boolean }> };
    };
    expect(configuration.app.windows).toHaveLength(1);
    expect(configuration.app.windows[0]).toMatchObject({ label: "main", visible: false });
  });
});
