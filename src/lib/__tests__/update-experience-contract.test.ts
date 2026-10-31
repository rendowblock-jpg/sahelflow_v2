import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

/**
 * Pins how the pieces of the update experience fit together, in the web code
 * and in the desktop shell, so none can be quietly undone.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const checker = read("src/components/updater/update-checker.tsx");
const chip = read("src/components/updater/update-chip.tsx");
const controller = read("src/lib/updater/update-controller.ts");
const topbar = read("src/components/layout/topbar.tsx");
const rust = read("src-tauri/src/lib.rs");

/** A top-level Rust function's text, up to its closing brace at column 0. */
function rustFunction(signature: string): string {
  const start = rust.indexOf(signature);
  expect(start, `missing ${signature}`).toBeGreaterThan(-1);
  const end = rust.indexOf("\n}\n", start);
  return rust.slice(start, end + 3);
}

describe("the page never interrupts the seller", () => {
  it("has no dialog, no relaunch and no one-step install", () => {
    for (const source of [checker, chip]) {
      expect(source).not.toContain("DialogContent");
      expect(source).not.toContain("relaunch");
      expect(source).not.toContain("downloadAndInstall");
      expect(source).not.toContain("plugin-process");
    }
    expect(checker).toContain("offerUpdate(update)");
  });

  it("checks calmly: after the workspace settled, then every six hours", () => {
    expect(checker).toContain("UPDATER_FIRST_CHECK_DELAY_MS = 90_000");
    expect(checker).toContain("UPDATER_CURRENT_POLL_INTERVAL_MS = 6 * 60 * 60_000");
  });

  it("never downloads or installs by itself", () => {
    expect(checker).not.toContain("downloadUpdate");
    expect(checker).not.toContain("installUpdate");
    const offer = controller.slice(
      controller.indexOf("export function offerUpdate"),
      controller.indexOf("export function withdrawUpdate"),
    );
    expect(offer).not.toContain(".download(");
    expect(offer).not.toContain(".install(");
    expect(offer).not.toContain("downloadUpdate(");
    // The chip starts a download from one click handler and nowhere else.
    expect(chip.match(/void downloadUpdate\(\)/g)).toHaveLength(1);
    expect(chip.match(/void installUpdate\(\)/g)).toHaveLength(1);
  });

  it("does not check again while an update is already downloading, ready or installing", () => {
    expect(checker).toContain("if (!updateIsInHand())");
    for (const phase of ["downloading", "ready", "installing"]) {
      expect(checker).toContain(`phase === "${phase}"`);
    }
  });

  it("puts the chip in the top bar, before the theme toggle", () => {
    expect(topbar).toContain('import { UpdateChip } from "@/components/updater/update-chip"');
    expect(topbar.indexOf("<UpdateChip />")).toBeGreaterThan(-1);
    expect(topbar.indexOf("<UpdateChip />")).toBeLessThan(topbar.indexOf("<ThemeToggle />"));
  });

  it("grants the page no process-control permission", () => {
    const capability = JSON.parse(read("src-tauri/capabilities/default.json")) as {
      permissions: string[];
    };
    expect(capability.permissions.filter((entry) => entry.startsWith("process:"))).toEqual([]);
    expect(capability.permissions).toContain("updater:default");
  });
});

describe("the desktop shell closes properly before the installer runs", () => {
  it("builds every update with the before-exit hook, not the plugin's default", () => {
    // The hook belongs to each update, so it is attached where updates are made.
    expect(rust).toContain(".on_before_exit(move || prepare_for_update_install(&app))");
    // The plugin itself is registered plainly: its Builder has no such method.
    expect(rust).toContain(".plugin(tauri_plugin_updater::Builder::new().build())");
    expect(rust).not.toMatch(/Builder::new\(\)\s*\.on_before_exit/);
    const command = rustFunction("async fn check_for_update(");
    expect(command).toMatch(/webview\s*\.updater_builder\(\)/);
    // The update goes where the plugin's own download and install look for it.
    expect(command).toContain("webview.resources_table().add(update)");
    expect(rust).toContain("#[tauri::command]\nasync fn check_for_update(");
    // The registered commands are pinned in "registers those three commands" below.
  });

  it("the hook takes the shutdown, hides the workspace, then stops the contained trees", () => {
    const hook = rustFunction("fn prepare_for_update_install(app: &tauri::AppHandle)");
    const begin = hook.indexOf("coordinator.begin()");
    const hide = hook.indexOf('get_webview_window("main")');
    const stop = hook.indexOf("stop_contained_trees(app)");
    expect(begin).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(begin);
    expect(stop).toBeGreaterThan(hide);
    // The installed-runtime contract keeps the framework's manual cleanup call
    // out of lib.rs (every normal close ends through app.exit(0)). SahelFlow has
    // no tray icon, so skipping it in the update hook loses nothing.
    expect(hook).not.toContain("cleanup_before_exit");
    expect(rust).not.toContain("cleanup_before_exit();");
  });

  it("a normal close already running is waited for, never raced", () => {
    const hook = rustFunction("fn prepare_for_update_install(app: &tauri::AppHandle)");
    expect(hook).toContain("wait_for_shutdown(&coordinator, UPDATE_SHUTDOWN_WAIT)");
    expect(hook).not.toContain("if !coordinator.begin() {\n            return;");
    expect(rust).toContain("const UPDATE_SHUTDOWN_WAIT: std::time::Duration");
  });

  it("development builds, which run no contained trees, have an inert hook", () => {
    expect(rust).toContain(
      "#[cfg(debug_assertions)]\nfn prepare_for_update_install(_app: &tauri::AppHandle) {}",
    );
    expect(rust).toContain(
      "#[cfg(not(debug_assertions))]\nfn prepare_for_update_install(app: &tauri::AppHandle)",
    );
  });

  it("a normal close and an update share one teardown", () => {
    const teardown = rustFunction("fn stop_contained_trees(");
    expect(teardown).toContain("children.kill_all()");
    expect(teardown).toContain("runtime_protocol::remove_manifest(&app_data_dir)");
    expect(teardown).toContain("coordinator.finish()");
    const normalClose = rustFunction("fn begin_normal_close(");
    expect(normalClose).toContain("stop_contained_trees(&app)");
    expect(normalClose).not.toContain("kill_all");
  });

  it("keeps no global app handle: the command carries the handle it needs", () => {
    expect(rust).not.toContain("UPDATE_APP_HANDLE");
  });
});

describe("the page may call exactly three commands of its own: look, download, install", () => {
  const capability = JSON.parse(read("src-tauri/capabilities/default.json")) as {
    permissions: string[];
    remote?: { urls: string[] };
  };
  const permissionFile = read("src-tauri/permissions/check-for-update.toml");
  const bridge = read("src/lib/updater/desktop-update-check.ts");

  it("names the command in a capability, because the page is a remote origin", () => {
    // The loopback workspace is not Tauri's local origin, so an app command is
    // refused unless a capability for that origin lists its permission.
    expect(capability.remote?.urls).toContain("http://127.0.0.1:*");
    const ownPermissions = capability.permissions.filter((entry) => !entry.includes(":"));
    expect(ownPermissions).toEqual([
      "allow-check-for-update",
      "allow-download-update",
      "allow-install-downloaded-update",
    ]);
    expect(permissionFile).toContain('identifier = "allow-check-for-update"');
    expect(permissionFile).toContain('commands.allow = ["check_for_update"]');
    expect(permissionFile).toContain('identifier = "allow-download-update"');
    expect(permissionFile).toContain('commands.allow = ["download_update"]');
    expect(permissionFile).toContain('identifier = "allow-install-downloaded-update"');
    expect(permissionFile).toContain('commands.allow = ["install_downloaded_update"]');
    expect(permissionFile.match(/\[\[permission\]\]/g)).toHaveLength(3);
    // Nothing is newly reachable: the page already holds the plugin's own download and install.
    expect(capability.permissions).toContain("updater:default");
  });

  it("registers those three commands and no other", () => {
    const handlers = /generate_handler!\[([^\]]*)\]/.exec(rust);
    expect(handlers?.[1]?.split(",").map((name) => name.trim()).filter(Boolean)).toEqual([
      "check_for_update",
      "download_update",
      "install_downloaded_update",
    ]);
  });

  it("the command only looks: it cannot download, install, stop or exit", () => {
    const command = rustFunction("async fn check_for_update(");
    for (const forbidden of [".download(", ".install(", "download_and_install", ".exit(", "stop_contained_trees"]) {
      expect(command, forbidden).not.toContain(forbidden);
    }
  });

  it("the download tells the window a few times a second, not once per network chunk", () => {
    const command = rustFunction("async fn download_update(");
    expect(command).toContain("update_progress::ProgressThrottle::new()");
    expect(command).toContain("throttle.record(");
    // The only sends are the throttled report, the final figure and the end.
    expect(command.match(/on_event\.send\(/g)).toHaveLength(3);
    expect(command).toContain("throttle.finish(");
    // The raw chunk callback never sends by itself.
    const callback = command.slice(command.indexOf("|chunk_length, total|"), command.indexOf("|| {},"));
    expect(callback.match(/on_event\.send\(/g)).toHaveLength(1);
    expect(callback).toContain("if let Some(report)");
    for (const forbidden of [".install(", ".exit(", "stop_contained_trees", "download_and_install"]) {
      expect(command, forbidden).not.toContain(forbidden);
    }
    expect(rust).toContain("mod update_progress;");
  });

  it("the install command is the only place that starts the installer, and it never stops or exits by itself", () => {
    const command = rustFunction("async fn install_downloaded_update(");
    // rustfmt may split the call over several lines; the text is compared without whitespace.
    expect(command.replace(/\s+/g, "")).toContain("update.install(&bytes.0)");
    for (const forbidden of [".download(", ".exit(", "stop_contained_trees", "download_and_install"]) {
      expect(command, forbidden).not.toContain(forbidden);
    }
    expect(rust.match(/\.install\(/g)).toHaveLength(1);
    // Async, so the hook's blocking teardown never runs on the window's thread.
    expect(rust).toContain("#[tauri::command]\nasync fn install_downloaded_update(");
    expect(rust).toContain("#[tauri::command]\nasync fn download_update(");
  });

  it("the bridge downloads and installs through those commands, not the plugin's", () => {
    expect(bridge).toContain('DOWNLOAD_UPDATE_COMMAND = "download_update"');
    expect(bridge).toContain('INSTALL_DOWNLOADED_UPDATE_COMMAND = "install_downloaded_update"');
    const bridgeCode = bridge.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const forbidden of ["resource.download(", "resource.install(", "downloadAndInstall", "plugin:updater"]) {
      expect(bridgeCode, forbidden).not.toContain(forbidden);
    }
  });

  it("the page asks through the bridge, not through the plugin's own check()", () => {
    expect(checker).toContain("checkForDesktopUpdate()");
    expect(checker).not.toMatch(/\{\s*check\s*\}\s*=\s*await import\("@tauri-apps\/plugin-updater"\)/);
    expect(checker).not.toContain("await check()");
    expect(bridge).toContain('CHECK_FOR_UPDATE_COMMAND = "check_for_update"');
    expect(bridge).toContain("invoke<unknown>(CHECK_FOR_UPDATE_COMMAND)");
    // Code only: the doc comment may mention the plugin's check().
    const bridgeCode = bridge.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bridgeCode).not.toMatch(/\bcheck\s*\(/);
  });
});

describe("the update copy exists in Arabic, French and English", () => {
  const locales = ["en", "fr", "ar"] as const;
  const catalog = Object.fromEntries(
    locales.map((locale) => [
      locale,
      JSON.parse(read(`src/lib/i18n/locales/${locale}.json`)) as Record<string, string>,
    ]),
  ) as Record<(typeof locales)[number], Record<string, string>>;

  const used = [
    ...new Set(
      [checker, chip].flatMap((source) =>
        [...source.matchAll(/\bt\(\s*"(updater\.[\w.]+)"/g)].flatMap((match) =>
          match[1] ? [match[1]] : [],
        ),
      ),
    ),
  ].sort();

  // Some update copy lives in a runtime catalog (src/lib/i18n/*-runtime.ts), not in the JSON.
  for (const locale of locales) {
    for (const key of used) {
      const runtime = getRuntimeTranslation(locale, key);
      if (catalog[locale][key] === undefined && runtime !== undefined) catalog[locale][key] = runtime;
    }
  }

  it("finds the keys the components use", () => {
    expect(used.length).toBeGreaterThanOrEqual(20);
  });

  it.each(locales)("%s has every key, non-empty", (locale) => {
    for (const key of used) {
      expect(catalog[locale][key], `${locale} is missing ${key}`).toBeTruthy();
    }
  });

  it("every placeholder is carried over into all three languages", () => {
    const placeholders = (value: string | undefined) =>
      [...(value ?? "").matchAll(/\{\{(\w+)\}\}/g)].flatMap((match) => (match[1] ? [match[1]] : [])).sort();
    for (const key of used) {
      const expected = placeholders(catalog.en[key]);
      expect(placeholders(catalog.fr[key]), `fr ${key}`).toEqual(expected);
      expect(placeholders(catalog.ar[key]), `ar ${key}`).toEqual(expected);
    }
  });

  it("keeps the Latin brand name out of Arabic sentences (it breaks the reading order)", () => {
    for (const key of used) {
      expect(catalog.ar[key], key).not.toMatch(/SahelFlow/);
    }
  });

  it("no longer carries the strings of the removed one-step install", () => {
    for (const locale of locales) {
      for (const key of ["updater.downloadInstall", "updater.installed", "updater.restarting"]) {
        expect(catalog[locale][key], `${locale} still has ${key}`).toBeUndefined();
      }
    }
  });
});
