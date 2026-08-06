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

  it("uses one hidden configured WebView with native session authority", () => {
    const configuration = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src-tauri/tauri.conf.json"),
        "utf8",
      ),
    ) as TauriConfiguration;
    const recovery = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery.rs"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    const windows = configuration.app.windows;
    const configuredMain = windows[0];

    expect(windows).toHaveLength(1);
    expect(configuredMain).toMatchObject({
      label: "main",
      title: "SahelFlow",
      visible: false,
    });
    expect(configuredMain.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(configuredMain.url)).not.toContain("<script");
    expect(windows.some((window) => window.label === "startup")).toBe(false);

    expect(recovery).toContain(
      "use tauri::webview::{cookie::SameSite, Cookie, WebviewWindow};",
    );
    expect(recovery).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(recovery).toContain("mod shop_lifecycle_host;");
    expect(recovery).toContain("shop_lifecycle_host::ensure_started(app)?;");
    expect(recovery).toContain("window.hide()?;");
    expect(recovery).toContain(
      "window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;",
    );
    expect(recovery).toContain("window.navigate(handoff.workspace_url)?;");
    expect(recovery).toContain("workspace_url.set_path(\"/\")");
    expect(recovery).toContain("workspace_url.set_query(None)");
    expect(recovery).toContain("workspace_url.set_fragment(None)");
    expect(recovery).toContain(".http_only(true)");
    expect(recovery).toContain(".same_site(SameSite::Lax)");
    expect(recovery).toContain(
      "monitor_packaged_ui(app.clone(), window, app_data_dir);",
    );

    const handoff = recovery.indexOf(
      "let Some(handoff) = packaged_handoff(&requested_url)? else {",
    );
    const lifecycle = recovery.indexOf(
      "shop_lifecycle_host::ensure_started(app)?;",
      handoff,
    );
    const hidden = recovery.indexOf("window.hide()?;", lifecycle);
    const cookie = recovery.indexOf("window.set_cookie(", hidden);
    const navigation = recovery.indexOf(
      "window.navigate(handoff.workspace_url)?;",
      cookie,
    );
    const monitor = recovery.indexOf("monitor_packaged_ui(", navigation);

    expect(handoff).toBeGreaterThan(-1);
    expect(lifecycle).toBeGreaterThan(handoff);
    expect(hidden).toBeGreaterThan(lifecycle);
    expect(cookie).toBeGreaterThan(hidden);
    expect(navigation).toBeGreaterThan(cookie);
    expect(monitor).toBeGreaterThan(navigation);

    expect(recovery).not.toContain("STARTUP_WINDOW_LABEL");
    expect(recovery).not.toContain("activate_startup_renderer(");
    expect(recovery).not.toContain("activate_configured_workspace(");
    expect(recovery).not.toContain("renderer_prime_html(");
    expect(recovery).not.toContain("run_on_main_thread");
    expect(recovery).not.toContain("WebviewWindowBuilder::new(");
    expect(recovery).not.toContain("WebviewUrl::External(url)");
    expect(recovery).not.toContain("handoff.bootstrap_url");
    expect(recovery).not.toContain("window.location.replace(target)");
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
