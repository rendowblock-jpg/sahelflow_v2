import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogs } from "../src/i18n";
import { installState, type InstallEnv, type InstallState } from "../src/views/install/install-state";
import { renderInstall, screen } from "../src/views/install/screen";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const env = (ua: string, o: Partial<InstallEnv> = {}): InstallEnv => ({ ua, platform: "", maxTouchPoints: 0, standalone: false, canPrompt: false, ...o });
const ROWS: ReadonlyArray<readonly [string, InstallEnv, InstallState]> = [
  ["android chrome with the prompt", env(ANDROID, { canPrompt: true }), "android"],
  ["android chrome without the prompt", env(ANDROID), "unsupported"],
  ["samsung internet with the prompt", env(`${ANDROID} SamsungBrowser/25.0`, { canPrompt: true }), "android"],
  ["edge android with the prompt", env(`${ANDROID} EdgA/126.0`, { canPrompt: true }), "android"],
  ["desktop chrome with the prompt", env("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36", { canPrompt: true }), "android"],
  ["linux desktop (Linux is not Line)", env("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"), "unsupported"],
  ["firefox android", env("Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0"), "unsupported"],
  ["empty user agent", env(""), "unsupported"],
  ["iphone safari", env(IPHONE, { platform: "iPhone" }), "ios"],
  ["iphone chrome", env(IPHONE.replace("Version/17.5 Mobile", "CriOS/126.0 Mobile")), "ios"],
  ["iphone firefox", env(IPHONE.replace("Version/17.5 Mobile", "FxiOS/127.0 Mobile")), "ios"],
  ["old ipad ua", env(IPHONE.replace("iPhone; CPU iPhone", "iPad; CPU"), { maxTouchPoints: 5 }), "ios"],
  ["ipod", env(IPHONE.replace("iPhone", "iPod touch")), "ios"],
  ["ipados 13+ reports a mac: touch points tell", env(MAC, { platform: "MacIntel", maxTouchPoints: 5 }), "ios"],
  ["a real mac has no touch", env(MAC, { platform: "MacIntel", maxTouchPoints: 0 }), "unsupported"],
  ["whatsapp android", env(`${ANDROID} WhatsApp/2.24.10.8`, { canPrompt: true }), "inapp"],
  ["whatsapp ios", env(`${IPHONE} WhatsApp/24.10.78 i`), "inapp"],
  ["facebook android", env(`${ANDROID} [FB_IAB/FB4A;FBAV/450.0.0.38.108;]`), "inapp"],
  ["facebook ios", env(`${IPHONE} [FBAN/FBIOS;FBAV/450.0.0.38.108;FBBV/1;]`), "inapp"],
  ["instagram android", env(`${ANDROID} Instagram 330.0.0.40.100 Android`), "inapp"],
  ["instagram ios", env(`${IPHONE} Instagram 330.0.0.20.100`), "inapp"],
  ["line android", env(`${ANDROID} Line/13.8.0`), "inapp"],
  ["line ios", env(`${IPHONE} Line/13.8.0`), "inapp"],
  ["tiktok android", env(`${ANDROID} musical_ly_2023305020 BytedanceWebview/d8a21c6`), "inapp"],
  ["tiktok ios", env(`${IPHONE} TikTok 33.9.0`), "inapp"],
  ["installed android", env(ANDROID, { standalone: true, canPrompt: true }), "installed"],
  ["installed ios", env(IPHONE, { standalone: true }), "installed"],
  ["installed wins over an in-app ua", env(`${ANDROID} WhatsApp/2.24`, { standalone: true }), "installed"],
];
const ctx = (o: { canInstall?: boolean; installed?: boolean; locale?: string } = {}) => ({ view: { locale: o.locale ?? "en", canInstall: o.canInstall ?? false, installed: o.installed ?? false } as never, go: () => undefined });
afterEach(() => { vi.unstubAllGlobals(); });

describe("installState", () => { it.each(ROWS)("%s", (_n, e, want) => { expect(installState(e)).toBe(want); }); it("has 20+ rows", () => { expect(ROWS.length).toBeGreaterThanOrEqual(20); }); });
describe("the install screen", () => {
  it("android: a button that triggers the app's install handler", () => { const h = renderInstall(ctx({ canInstall: true }), env(ANDROID, { canPrompt: true })); expect(h).toContain('data-act="install"'); expect(h).toContain("Install the app"); });
  it("ios: the title and the 3 steps in order, no install button", () => {
    const h = renderInstall(ctx(), env(IPHONE)); expect(h).toContain("Add SahelFlow to your home screen");
    expect([...h.matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1])).toEqual(["Tap the Share button", "Choose Add to Home Screen", "Open SahelFlow from the new icon"]); expect(h).not.toContain("data-act");
  });
  it("in-app: asks for Safari or Chrome and has the copy button", () => { const h = renderInstall(ctx(), env(`${IPHONE} Instagram 330`)); expect(h).toContain("Open this page in Safari or Chrome first"); expect(h).toContain('data-install="copy"'); });
  it("installed: nothing at all", () => { expect(renderInstall(ctx({ installed: true }), env(IPHONE, { standalone: true }))).toBe(""); });
  it("unsupported: says so, no button", () => { const h = renderInstall(ctx(), env("")); expect(h).toContain("This browser cannot install the app"); expect(h).not.toContain("<button"); });
  it("every state has text in ar, fr and en (no key shown raw)", () => {
    for (const locale of ["ar", "fr", "en"]) for (const [, e] of ROWS) { const h = renderInstall(ctx({ locale }), e); expect(h).not.toMatch(/install\.[a-z]+\.[a-z0-9]+/); }
    expect(Object.keys(catalogs.ar).filter((k) => k.startsWith("install.")).length).toBe(14);
  });
  it("copy link: copies the app address and says so; a failure is said too", async () => {
    let click: ((e: unknown) => void) | undefined; const status = { textContent: "" }; const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } }); vi.stubGlobal("location", { origin: "https://app.example" });
    const root = { addEventListener: (_t: string, f: (e: unknown) => void) => { click = f; }, removeEventListener: vi.fn(), querySelector: () => status } as never;
    const off = screen.bind(root, ctx()); click?.({ target: { closest: () => ({}) } }); await Promise.resolve(); await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("https://app.example/"); expect(status.textContent).toBe("Link copied. Open your browser and paste it.");
    writeText.mockRejectedValueOnce(new Error("no")); click?.({ target: { closest: () => ({}) } }); await Promise.resolve(); await Promise.resolve();
    expect(status.textContent).toBe("Could not copy. Press and hold the address to copy it."); click?.({ target: { closest: () => null } }); expect(writeText).toHaveBeenCalledTimes(2); off();
  });
});
