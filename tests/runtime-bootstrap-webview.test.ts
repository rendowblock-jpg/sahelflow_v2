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

  it("activates an inert startup renderer before the main-thread loopback workspace", () => {
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

    expect(startupWindow).toBeDefined();
    expect(startupWindow?.visible).toBe(false);
    expect(startupWindow?.title).toBe("SahelFlow - Starting");
    expect(startupWindow?.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(startupWindow?.url ?? "")).not.toContain(
      "<script",
    );
    expect(configuredMain).toBeUndefined();

    expect(recovery).toContain(
      "use tauri::webview::{WebviewWindow, WebviewWindowBuilder};",
    );
    expect(recovery).toContain(
      'STARTUP_RENDERER_MARKER: &str = "sahelflow-startup-renderer-v1"',
    );
    expect(recovery).toContain(
      'WORKSPACE_RENDERER_MARKER: &str = "sahelflow-workspace-renderer-v1"',
    );
    expect(recovery).toContain("renderer_prime_html()");
    expect(recovery).toContain("startup.navigate(renderer_prime_url()?)?");
    expect(recovery).toContain("startup.show()?");
    expect(recovery).toContain("startup.set_focus()?");
    expect(recovery).toContain(".eval_with_callback(");
    expect(recovery).toContain("document.readyState!=='loading'");
    expect(recovery).toContain("WebviewUrl::External(url)");
    expect(recovery).toContain("app.run_on_main_thread(move ||");
    expect(recovery).toContain(
      "recv_timeout(WORKSPACE_WINDOW_CREATION_TIMEOUT)",
    );
    expect(recovery).toContain('"startup-renderer-prime-started"');
    expect(recovery).toContain('"startup-renderer-prime-ready"');
    expect(recovery).toContain('"workspace-window-creating"');
    expect(recovery).toContain('"workspace-window-created"');
    expect(recovery).toContain('"workspace-renderer-probe-started"');
    expect(recovery).toContain('"workspace-renderer-probe-ready"');
    expect(recovery).toContain(
      '"SF-RUNTIME-UI-STARTUP-RENDERER-BLOCKED"',
    );
    expect(recovery).toContain(
      '"SF-RUNTIME-UI-WORKSPACE-RENDERER-BLOCKED"',
    );
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("window.location.replace(target)");

    const validatedHandoff = recovery.indexOf(
      "let handoff = packaged_handoff(&requested_url)?;",
    );
    const startupPrime = recovery.indexOf(
      "activate_startup_renderer(app)",
      validatedHandoff,
    );
    const workspaceCreation = recovery.indexOf(
      "create_workspace_window(app, workspace_url, packaged)?",
      startupPrime,
    );
    const workspaceProbeReady = recovery.indexOf(
      '"workspace-renderer-probe-ready"',
      workspaceCreation,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(",
      workspaceProbeReady,
    );
    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(startupPrime).toBeGreaterThan(validatedHandoff);
    expect(workspaceCreation).toBeGreaterThan(startupPrime);
    expect(workspaceProbeReady).toBeGreaterThan(workspaceCreation);
    expect(readinessMonitor).toBeGreaterThan(workspaceProbeReady);
  });

  it("commits and confirms the HttpOnly runtime cookie before workspace navigation", async () => {
    const response = await GET(request());
    const body = await response.text();
    const setCookie = response.headers.get("set-cookie") ?? "";
    const contentSecurityPolicy =
      response.headers.get("content-security-policy") ?? "";
    const handoffScript = readFileSync(
      resolve(process.cwd(), "public/runtime-bootstrap-handoff.js"),
      "utf8",
    );

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
  });

  it("remains one-time after the successful cookie handoff", async () => {
    expect((await GET(request())).status).toBe(200);

    const second = await GET(request());
    expect(second.status).toBe(410);
    await expect(second.json()).resolves.toEqual({
      status: "rejected",
      code: "RUNTIME_BOOTSTRAP_CONSUMED",
    });
  });
});