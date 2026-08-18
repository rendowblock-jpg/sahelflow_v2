import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");

describe("Phase 4 committed WebView acceptance transport", () => {
  it("uses the supported browser-level WebView2 CDP connection and fails closed after dispatch", () => {
    const wrapper = read("scripts/verify-phase4-replacement-install-ci.ps1");
    const transport = read("scripts/phase4-webview-committed-acceptance.ts");

    expect(wrapper).toContain(
      'phase4-webview-committed-acceptance.ts',
    );
    expect(wrapper).toContain(
      '"function Invoke-CommittedWebViewAcceptance {"',
    );
    expect(wrapper).toContain(
      '"function Get-RuntimeCookieFromTarget {"',
    );
    expect(wrapper).toContain(
      "$inputJson | & $bunCommand.Source $transportScript",
    );
    expect(wrapper).toContain(
      'phase4-committed-webview-dispatch.json',
    );
    expect(wrapper).toContain(
      "the mutating journey was not retried",
    );
    expect(wrapper).not.toContain("preflight/recycle");

    expect(transport).toContain(
      'import { chromium, type Page } from "@playwright/test"',
    );
    expect(transport).toContain("chromium.connectOverCDP(endpoint");
    expect(transport).toContain("headers: { Origin: endpoint }");
    expect(transport).toContain("browser.contexts()");
    expect(transport).toContain(".filter((candidate) => isExactAppPage(candidate, baseUrl))");
    expect(transport).toContain("candidate.port === baseUrl.port");
    expect(transport).toContain("isLoopback(candidate.hostname)");
    expect(transport).toContain("writeDispatchMarker(dispatchMarker)");
    expect(transport).toContain("const result = await page.evaluate");
    expect(transport.indexOf("writeDispatchMarker(dispatchMarker)")).toBeLessThan(
      transport.indexOf("const result = await page.evaluate"),
    );
    expect(transport).toContain('request("/api/auth/setup", "POST"');
    expect(transport).toContain('request("/api/license/trial", "POST")');
    expect(transport).toContain('request("/api/secrets/gemini-key")');
    expect(transport).toContain("for await (const chunk of process.stdin)");
    expect(transport).not.toContain("console.log");
    expect(transport).not.toContain("acceptedInput.pin)");
  });
});
