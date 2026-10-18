import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
  it("registers the updater with a before-exit hook", () => {
    expect(rust).toContain(".on_before_exit(prepare_for_update_install)");
    expect(rust).not.toContain("tauri_plugin_updater::Builder::new().build()");
  });

  it("the hook takes the shutdown, hides the workspace, then stops the contained trees", () => {
    const hook = rustFunction("fn prepare_for_update_install()");
    const begin = hook.indexOf("coordinator.begin()");
    const hide = hook.indexOf('get_webview_window("main")');
    const stop = hook.indexOf("stop_contained_trees(app)");
    expect(begin).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(begin);
    expect(stop).toBeGreaterThan(hide);
    // A normal close already in progress keeps ownership of the teardown.
    expect(hook).toContain("if !coordinator.begin() {");
    // Before the app exists there is nothing to stop.
    expect(hook).toContain("UPDATE_APP_HANDLE.get()");
  });

  it("development builds, which run no contained trees, have an inert hook", () => {
    expect(rust).toContain("#[cfg(debug_assertions)]\nfn prepare_for_update_install() {}");
    expect(rust).toContain("#[cfg(not(debug_assertions))]\nfn prepare_for_update_install()");
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

  it("remembers the app handle only after the shutdown coordinator exists", () => {
    const managed = rust.indexOf("app.manage(ShutdownCoordinator::default());");
    const stored = rust.indexOf("UPDATE_APP_HANDLE.set(app.handle().clone())");
    expect(managed).toBeGreaterThan(-1);
    expect(stored).toBeGreaterThan(managed);
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
