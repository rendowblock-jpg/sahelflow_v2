import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../../../next.config";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

/**
 * Campaign row R4/B4 root-cause contract (round 3).
 *
 * The shipped `Permissions-Policy` header used to hard-deny the app's own
 * first-party microphone (`microphone=()`). Chromium enforces the permissions
 * policy BEFORE any OS privacy toggle or WebView2 `--use-fake-ui-for-media-stream`
 * auto-grant, so every `getUserMedia` call in the installed build rejected with
 * NotAllowedError — reproduced across Internal.28/.30/.31 no matter what the
 * operator changed. The policy must allow same-origin microphone use while
 * camera and geolocation stay fully denied.
 */
describe("web security headers contract", () => {
  it("allows same-origin microphone use for the composer voice recorder", () => {
    const config = read("next.config.ts");

    expect(config).toContain("Permissions-Policy");
    expect(config).toContain('value: "camera=(), microphone=(self), geolocation=()"');
  });

  it("keeps the voice recorder on the permission-gated getUserMedia path", () => {
    const recorder = read("src/components/inbox/use-voice-recorder.ts");

    expect(recorder).toContain("navigator.mediaDevices.getUserMedia");
    // Round-2 diagnostics stay: named banners carry the raw DOMException name
    // so a future permission failure can never collapse into an anonymous
    // message again.
    expect(recorder).toContain("errorName");
  });
});

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

/** Next applies every matching rule in order; for the same header key the last one wins. */
async function effectiveCsp(pathname: string): Promise<string> {
  const rules = (await nextConfig.headers?.()) as HeaderRule[];
  let value = "";
  for (const rule of rules) {
    const matches =
      rule.source === "/:path*" ||
      (rule.source === "/storefront/:path*" &&
        (pathname === "/storefront" || pathname.startsWith("/storefront/")));
    const csp = rule.headers.find((header) => header.key === "Content-Security-Policy");
    if (matches && csp) value = csp.value;
  }
  return value;
}

function directive(csp: string, name: string): string {
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";
}

/**
 * The seller dashboard CSP is permissive on purpose (dev HMR, styled-jsx, provider
 * APIs). The public store pages that customers open must not inherit it.
 */
describe("public storefront page CSP", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not allow eval on the public store pages", async () => {
    for (const path of ["/storefront/my-shop", "/storefront/my-shop/lp/sale"]) {
      const csp = await effectiveCsp(path);
      expect(directive(csp, "script-src"), path).toContain("'self'");
      expect(directive(csp, "script-src"), path).not.toContain("'unsafe-eval'");
      expect(directive(csp, "object-src"), path).toBe("object-src 'none'");
      expect(directive(csp, "base-uri"), path).toBe("base-uri 'self'");
      expect(directive(csp, "form-action"), path).toBe("form-action 'self'");
      expect(directive(csp, "frame-ancestors"), path).toBe("frame-ancestors 'none'");
    }
  });

  it("keeps the public store's own needs: inline bootstrap, same-origin API, uploaded images", async () => {
    const csp = await effectiveCsp("/storefront/my-shop");
    expect(directive(csp, "script-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "connect-src")).toContain("'self'");
    expect(directive(csp, "img-src")).toContain("'self'");
    expect(directive(csp, "font-src")).toContain("'self'");
  });

  it("leaves the dashboard and the storefront management pages on the app policy", async () => {
    const dashboard = await effectiveCsp("/orders");
    expect(await effectiveCsp("/storefronts")).toBe(dashboard);
    expect(await effectiveCsp("/api/storefront/submit")).toBe(dashboard);
    expect(await effectiveCsp("/storefront/my-shop")).not.toBe(dashboard);
  });

  it("keeps eval for the dev server only, so hot reload still works", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(directive(await effectiveCsp("/storefront/my-shop"), "script-src")).toContain("'unsafe-eval'");
  });
});
