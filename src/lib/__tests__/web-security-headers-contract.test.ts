import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
