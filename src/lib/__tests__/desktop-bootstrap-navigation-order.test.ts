import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readRepositoryFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("packaged desktop bootstrap navigation", () => {
  it("primes a safe renderer before the hidden authenticated workspace handoff", () => {
    const wrapper = readRepositoryFile("src-tauri/src/startup_recovery.rs");
    const proven = readRepositoryFile(
      "src-tauri/src/startup_recovery/proven.rs",
    );
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

    const rendererPrime = wrapper.indexOf(
      "if !prime_packaged_renderer(app, app_url)? {",
    );
    const delegatedHandoff = wrapper.indexOf(
      "proven::show_ready(app, app_url)?;",
      rendererPrime,
    );
    const postUiAuthority = wrapper.indexOf(
      "start_post_ui_authorities(app.clone())?;",
      delegatedHandoff,
    );
    const safePrimeNavigation = wrapper.indexOf(
      "window.navigate(renderer_prime_url()?)?;",
    );
    const visibleStartingSurface = wrapper.indexOf(
      "window.show()?;",
      safePrimeNavigation,
    );
    const executableRendererProof = wrapper.indexOf(
      "if renderer_is_ready(&window) {",
      visibleStartingSurface,
    );
    const hideBeforeWorkspace = wrapper.indexOf(
      "window.hide()?;",
      executableRendererProof,
    );
    const durableUiGate = wrapper.indexOf(
      "if matching_ui_ready_is_durable(&app_data_dir) {",
    );
    const lifecycleHost = wrapper.indexOf(
      "ensure_shop_lifecycle_started(&app)",
      durableUiGate,
    );
    const validatedHandoff = proven.indexOf(
      "let Some(handoff) = packaged_handoff(&requested_url)? else {",
    );
    const clearUiReady = proven.indexOf(
      "clear_file(&app_data_dir.join(RUNTIME_UI_READY_FILE))?;",
      validatedHandoff,
    );
    const hideWorkspace = proven.indexOf("window.hide()?;", clearUiReady);
    const nativeCookie = proven.indexOf(
      "window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;",
      hideWorkspace,
    );
    const directRootNavigation = proven.indexOf(
      "window.navigate(handoff.workspace_url)?;",
      nativeCookie,
    );
    const readinessMonitor = proven.indexOf(
      "monitor_packaged_ui(app.clone(), window, app_data_dir);",
      directRootNavigation,
    );

    expect(rendererPrime).toBeGreaterThan(-1);
    expect(delegatedHandoff).toBeGreaterThan(rendererPrime);
    expect(postUiAuthority).toBeGreaterThan(delegatedHandoff);
    expect(safePrimeNavigation).toBeGreaterThan(-1);
    expect(visibleStartingSurface).toBeGreaterThan(safePrimeNavigation);
    expect(executableRendererProof).toBeGreaterThan(visibleStartingSurface);
    expect(hideBeforeWorkspace).toBeGreaterThan(executableRendererProof);
    expect(durableUiGate).toBeGreaterThan(-1);
    expect(lifecycleHost).toBeGreaterThan(durableUiGate);
    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(clearUiReady).toBeGreaterThan(validatedHandoff);
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

    expect(wrapper).toContain('RENDERER_PRIME_MARKER: &str = "sahelflow-renderer-prime-v1"');
    expect(wrapper).toContain("eval_with_callback");
    expect(wrapper).toContain("SF-RUNTIME-UI-RENDERER-BLOCKED");
    expect(proven).toContain('MAIN_WINDOW_LABEL: &str = "main"');
    expect(proven).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(wrapper).toContain("mod shop_lifecycle_host;");
    expect(proven).toContain("workspace_url.set_path(\"/\")");
    expect(proven).toContain("workspace_url.set_query(None)");
    expect(proven).toContain("workspace_url.set_fragment(None)");
    expect(proven).toContain(".http_only(true)");
    expect(proven).toContain(".same_site(SameSite::Lax)");
    expect(proven).toContain(
      "if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT)",
    );
    expect(proven).toContain("window.show().and_then(|_| window.set_focus())");

    const combined = `${wrapper}\n${proven}`;
    expect(combined).not.toContain("STARTUP_WINDOW_LABEL");
    expect(combined).not.toContain("activate_startup_renderer(");
    expect(combined).not.toContain("activate_configured_workspace(");
    expect(combined).not.toContain("run_on_main_thread");
    expect(combined).not.toContain("WebviewWindowBuilder::new(");
    expect(combined).not.toContain("WebviewUrl::External(url)");
    expect(combined).not.toContain("handoff.bootstrap_url");
    expect(combined).not.toContain("window.location.replace(target)");
  });
});
