import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");
}

// tao 0.35.x (what Cargo.lock resolves) applies ShowWindow(SW_MAXIMIZE) to a
// hidden window whose maximized flag is set. A workspace window configured
// `maximized: true` + `visible: false` is therefore briefly VISIBLE the moment
// it is created, seconds before the authenticated UI is ready. tao 0.37.0 fixed
// this upstream (tauri-apps/tao#1306, "delay maximizing the window if it's
// hidden"). The installed-UI gate correctly rejects a visible workspace window
// that has no readiness evidence, so the hidden window stays un-maximized and is
// maximized only after the durable `ui-ready` stage, immediately before the
// gated show. Remove this pin only together with a tao >= 0.37 upgrade that has
// passed the same installed-UI gate.
describe("hidden workspace window is maximized only after readiness", () => {
  const proven = read("src-tauri/src/startup_recovery/proven.rs");
  const configuration = JSON.parse(read("src-tauri/tauri.conf.json")) as {
    app: {
      windows: Array<{ label: string; visible?: boolean; maximized?: boolean }>;
    };
  };

  it("does not configure the hidden workspace window as maximized", () => {
    const workspace = configuration.app.windows.find(
      (window) => window.label === "main",
    );
    expect(workspace).toBeDefined();
    expect(workspace?.visible).toBe(false);
    expect(workspace?.maximized ?? false).toBe(false);
  });

  it("maximizes after the ui-ready record and before the gated show", () => {
    const monitor = proven.slice(proven.indexOf("fn monitor_packaged_ui("));
    const readyRecorded = monitor.indexOf(
      'record_startup_stage(&app_data_dir, "ui-ready", None);',
    );
    const maximized = monitor.indexOf("maximize_before_show(&window);");
    const gatedShow = monitor.indexOf(
      "window.show().and_then(|_| window.set_focus())",
    );

    expect(readyRecorded).toBeGreaterThan(-1);
    expect(maximized).toBeGreaterThan(readyRecorded);
    expect(gatedShow).toBeGreaterThan(maximized);
  });

  it("only ever maximizes immediately before a show", () => {
    const calls = proven.match(/maximize_before_show\(&window\);/g) ?? [];
    const guarded =
      proven.match(
        /maximize_before_show\(&window\);\n\s*(?:if let Err\(error\) = )?window\.show\(\)/g,
      ) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    expect(guarded).toHaveLength(calls.length);
    expect(proven.match(/\.maximize\(\)/g) ?? []).toHaveLength(1);
  });
});
