import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GET,
  resetRuntimeBootstrapForTest,
} from "@/app/api/internal/runtime-bootstrap/route";

const token = "a".repeat(64);
const originalEnvironment = {
  SF_RUNTIME_APP_TOKEN: process.env.SF_RUNTIME_APP_TOKEN,
  VITEST: process.env.VITEST,
};

type TauriWindowConfiguration = {
  label: string;
  title: string;
  url: string;
  visible: boolean;
  focus?: boolean;
};

type TauriConfiguration = {
  app: {
    windows: TauriWindowConfiguration[];
  };
};

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function request(): Request {
  return new Request(
    `http://127.0.0.1:43123/api/internal/runtime-bootstrap?token=${token}`,
  );
}

describe("packaged runtime bootstrap WebView handoff", () => {
  beforeEach(() => {
    process.env.VITEST = "true";
    process.env.SF_RUNTIME_APP_TOKEN = token;
    resetRuntimeBootstrapForTest();
  });

  afterEach(() => {
    restoreEnvironment(
      "SF_RUNTIME_APP_TOKEN",
      originalEnvironment.SF_RUNTIME_APP_TOKEN,
    );
    restoreEnvironment("VITEST", originalEnvironment.VITEST);
  });

  it("installs the native runtime session before token-free root navigation", () => {
    const configuration = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src-tauri/tauri.conf.json"),
        "utf8",
      ),
    ) as TauriConfiguration;
    const startupWindow = configuration.app.windows.find(
      (window) => window.label === "startup",
    );
    const configuredMain = configuration.app.windows.find(
      (window) => window.label === "main",
    );
    const recovery = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery.rs"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    const workspaceAuthority = recovery.slice(
      recovery.indexOf("fn activate_configured_workspace("),
      recovery.indexOf("pub fn reset_startup_trace"),
    );

    expect(startupWindow).toBeDefined();
    expect(startupWindow?.visible).toBe(true);
    expect(startupWindow?.focus).toBe(true);
    expect(startupWindow?.title).toBe("SahelFlow - Starting");
    expect(startupWindow?.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(startupWindow?.url ?? "")).not.toContain(
      "<script",
    );
    expect(configuredMain).toBeDefined();
    expect(configuredMain?.visible).toBe(false);
    expect(configuredMain?.focus).toBe(false);
    expect(configuredMain?.title).toBe("SahelFlow - Starting");
    expect(configuredMain?.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(configuredMain?.url ?? "")).not.toContain(
      "<script",
    );

    expect(recovery).toContain(
      "use tauri::webview::{cookie::SameSite, Cookie, WebviewWindow};",
    );
    expect(recovery).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(recovery).toContain(
      'STARTUP_RENDERER_MARKER: &str = "sahelflow-startup-renderer-v1"',
    );
    expect(recovery).toContain("renderer_prime_html()");
    expect(recovery).toContain("startup.navigate(renderer_prime_url()?)?");
    expect(recovery).toContain("startup.show()?");
    expect(recovery).toContain("startup.set_focus()?");
    expect(recovery).toContain(".eval_with_callback(");
    expect(recovery).toContain("activate_configured_workspace(");
    expect(workspaceAuthority).toContain("workspace_for_activation");
    expect(workspaceAuthority).toContain("runtime_cookie(&host, &token)");
    expect(workspaceAuthority).toContain(".set_cookie(cookie)");
    expect(workspaceAuthority).toContain(".show()");
    expect(workspaceAuthority).toContain(".set_focus()");
    expect(workspaceAuthority).toContain(".navigate(url)");
    expect(workspaceAuthority).toContain("app.run_on_main_thread(move ||");
    expect(workspaceAuthority).toContain(
      "recv_timeout(WORKSPACE_ACTIVATION_TIMEOUT)",
    );
    expect(recovery).toContain("workspace_url.set_path(\"/\")");
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).toContain(".http_only(true)");
    expect(recovery).toContain(".same_site(SameSite::Lax)");
    expect(recovery).toContain('"startup-renderer-prime-started"');
    expect(recovery).toContain('"startup-renderer-prime-ready"');
    expect(recovery).toContain('"workspace-window-activating"');
    expect(recovery).toContain('"workspace-native-session-started"');
    expect(recovery).toContain('"workspace-native-session-installed"');
    expect(recovery).toContain('"workspace-root-navigation-dispatched"');
    expect(recovery).toContain(
      '"SF-RUNTIME-UI-STARTUP-RENDERER-BLOCKED"',
    );
    expect(recovery).not.toContain("WebviewWindowBuilder::new(");
    expect(recovery).not.toContain("WebviewUrl::External(url)");
    expect(recovery).not.toContain("WORKSPACE_RENDERER_PROBE_SCRIPT");
    expect(recovery).not.toContain("WORKSPACE_RENDERER_MARKER");
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("window.location.replace(target)");

    const validatedHandoff = recovery.indexOf(
      "let handoff = packaged_handoff(&requested_url)?;",
    );
    const startupPrime = recovery.indexOf(
      "activate_startup_renderer(app)",
      validatedHandoff,
    );
    const workspaceActivation = recovery.indexOf(
      "activate_configured_workspace(",
      startupPrime,
    );
    const nativeCookie = workspaceAuthority.indexOf(".set_cookie(cookie)");
    const rootNavigation = workspaceAuthority.indexOf(".navigate(url)");
    const navigationDispatched = recovery.indexOf(
      '"workspace-root-navigation-dispatched"',
      workspaceActivation,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(",
      navigationDispatched,
    );
    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(startupPrime).toBeGreaterThan(validatedHandoff);
    expect(workspaceActivation).toBeGreaterThan(startupPrime);
    expect(nativeCookie).toBeGreaterThan(-1);
    expect(rootNavigation).toBeGreaterThan(nativeCookie);
    expect(navigationDispatched).toBeGreaterThan(workspaceActivation);
    expect(readinessMonitor).toBeGreaterThan(navigationDispatched);
  });

  it("retains the confirmed browser bootstrap only as a legacy fallback", async () => {
    const response = await GET(request());
    const body = await response.text();
    const setCookie = response.headers.get("set-cookie") ?? "";
    const contentSecurityPolicy =
      response.headers.get("content-security-policy") ?? "";
    const handoffScript = readFileSync(
      resolve(process.cwd(), "public/runtime-bootstrap-handoff.js"),
      "utf8",
    );
    const recovery = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery.rs"),
      "utf8",
    ).replace(/\r\n?/g, "\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(setCookie).toContain(`sf_runtime=${token}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=strict");
    expect(setCookie).toContain("Path=/");
    expect(contentSecurityPolicy).toContain("script-src 'self'");
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).not.toContain("'unsafe-inline'");
    expect(body).toContain(
      '<script src="/runtime-bootstrap-handoff.js" defer></script>',
    );
    expect(body).not.toContain("<script>window.location");
    expect(handoffScript).toContain(
      '"/api/internal/runtime-bootstrap/confirm"',
    );
    expect(handoffScript).toContain('credentials: "same-origin"');
    expect(handoffScript).toContain("response.status === 204");
    expect(handoffScript.indexOf("response.status === 204")).toBeLessThan(
      handoffScript.indexOf('window.location.replace("/")'),
    );
    expect(handoffScript).not.toContain(token);
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).not.toContain("handoff.bootstrap_url");
  });

  it("remains one-time after the successful fallback cookie handoff", async () => {
    expect((await GET(request())).status).toBe(200);

    const second = await GET(request());
    expect(second.status).toBe(410);
    await expect(second.json()).resolves.toEqual({
      status: "rejected",
      code: "RUNTIME_BOOTSTRAP_CONSUMED",
    });
  });
});
