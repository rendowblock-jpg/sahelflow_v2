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

  it("proves a safe renderer before native-cookie workspace navigation", () => {
    const configuration = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "src-tauri/tauri.conf.json"),
        "utf8",
      ),
    ) as TauriConfiguration;
    const wrapper = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery.rs"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    const proven = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery/proven.rs"),
      "utf8",
    ).replace(/\r\n?/g, "\n");
    const windows = configuration.app.windows;
    const configuredMain = windows[0];

    expect(windows).toHaveLength(1);
    expect(configuredMain).toBeDefined();
    if (!configuredMain) {
      throw new Error("configured main WebView is missing");
    }
    expect(configuredMain).toMatchObject({
      label: "main",
      title: "SahelFlow",
      visible: false,
    });
    expect(configuredMain.url).toMatch(/^data:text\/html/);
    expect(decodeURIComponent(configuredMain.url)).not.toContain("<script");
    expect(windows.some((window) => window.label === "startup")).toBe(false);

    expect(wrapper).toContain("prime_packaged_renderer(app, app_url)?");
    expect(wrapper).toContain("window.navigate(renderer_prime_url()?)?;");
    expect(wrapper).toContain("window.show()?;");
    expect(wrapper).toContain("eval_with_callback");
    expect(wrapper).toContain("window.hide()?;");
    expect(wrapper).toContain("SF-RUNTIME-UI-RENDERER-BLOCKED");
    expect(proven).toContain(
      "use tauri::webview::{cookie::SameSite, Cookie, WebviewWindow};",
    );
    expect(proven).toContain('RUNTIME_COOKIE: &str = "sf_runtime"');
    expect(wrapper).toContain("mod shop_lifecycle_host;");
    expect(wrapper).toContain("start_post_ui_authorities(app.clone())?;");
    expect(wrapper).toContain(
      "if matching_ui_ready_is_durable(&app_data_dir) {",
    );
    expect(wrapper).toContain("ensure_shop_lifecycle_started(&app)");
    expect(proven).toContain("window.hide()?;");
    expect(proven).toContain(
      "window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;",
    );
    expect(proven).toContain("window.navigate(handoff.workspace_url)?;");
    expect(proven).toContain("workspace_url.set_path(\"/\")");
    expect(proven).toContain("workspace_url.set_query(None)");
    expect(proven).toContain("workspace_url.set_fragment(None)");
    expect(proven).toContain(".http_only(true)");
    expect(proven).toContain(".same_site(SameSite::Lax)");
    expect(proven).toContain(
      "monitor_packaged_ui(app.clone(), window, app_data_dir);",
    );

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
    const rendererProof = wrapper.indexOf(
      "if renderer_is_ready(&window) {",
      safePrimeNavigation,
    );
    const primeHide = wrapper.indexOf("window.hide()?;", rendererProof);
    const handoff = proven.indexOf(
      "let Some(handoff) = packaged_handoff(&requested_url)? else {",
    );
    const hidden = proven.indexOf("window.hide()?;", handoff);
    const cookie = proven.indexOf("window.set_cookie(", hidden);
    const navigation = proven.indexOf(
      "window.navigate(handoff.workspace_url)?;",
      cookie,
    );
    const monitor = proven.indexOf("monitor_packaged_ui(", navigation);

    expect(rendererPrime).toBeGreaterThan(-1);
    expect(delegatedHandoff).toBeGreaterThan(rendererPrime);
    expect(postUiAuthority).toBeGreaterThan(delegatedHandoff);
    expect(safePrimeNavigation).toBeGreaterThan(-1);
    expect(rendererProof).toBeGreaterThan(safePrimeNavigation);
    expect(primeHide).toBeGreaterThan(rendererProof);
    expect(handoff).toBeGreaterThan(-1);
    expect(hidden).toBeGreaterThan(handoff);
    expect(cookie).toBeGreaterThan(hidden);
    expect(navigation).toBeGreaterThan(cookie);
    expect(monitor).toBeGreaterThan(navigation);

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
    const proven = readFileSync(
      resolve(process.cwd(), "src-tauri/src/startup_recovery/proven.rs"),
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
    expect(proven).toContain("workspace_url.set_query(None)");
    expect(proven).toContain("workspace_url.set_fragment(None)");
    expect(proven).not.toContain("handoff.bootstrap_url");
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
