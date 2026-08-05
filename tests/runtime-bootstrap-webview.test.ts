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

  it("creates the authenticated main WebView on Tauri's main thread from the loopback bootstrap URL", () => {
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
    expect(recovery).toContain("WebviewUrl::External(url)");
    expect(recovery).toContain("MAIN_WINDOW_LABEL");
    expect(recovery).toContain("BOOTSTRAP_WINDOW_TITLE");
    expect(recovery).toContain('"workspace-window-creating"');
    expect(recovery).toContain('"workspace-window-created"');
    expect(recovery).toContain("app.run_on_main_thread(move ||");
    expect(recovery).toContain(
      "recv_timeout(WORKSPACE_WINDOW_CREATION_TIMEOUT)",
    );
    expect(recovery).toContain(".visible(true)");
    expect(recovery).toContain(".focused(true)");
    expect(recovery).not.toContain("renderer_is_ready(");
    expect(recovery).not.toContain("schedule_packaged_navigation(");
    expect(recovery).not.toContain("window.location.replace(target)");

    const validatedHandoff = recovery.indexOf(
      "let handoff = packaged_handoff(&requested_url)?;",
    );
    const mainThreadDispatch = recovery.indexOf(
      "app.run_on_main_thread(move ||",
    );
    const builder = recovery.indexOf(
      "WebviewWindowBuilder::new(",
      mainThreadDispatch,
    );
    const externalInitialUrl = recovery.indexOf(
      "WebviewUrl::External(url)",
      builder,
    );
    const creationReceipt = recovery.indexOf(
      "recv_timeout(WORKSPACE_WINDOW_CREATION_TIMEOUT)",
      externalInitialUrl,
    );
    const readinessMonitor = recovery.indexOf(
      "monitor_packaged_ui(",
      creationReceipt,
    );
    expect(validatedHandoff).toBeGreaterThan(-1);
    expect(mainThreadDispatch).toBeGreaterThan(validatedHandoff);
    expect(builder).toBeGreaterThan(mainThreadDispatch);
    expect(externalInitialUrl).toBeGreaterThan(builder);
    expect(creationReceipt).toBeGreaterThan(externalInitialUrl);
    expect(readinessMonitor).toBeGreaterThan(creationReceipt);
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
