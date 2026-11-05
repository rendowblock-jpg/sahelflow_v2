// W4SEC-07: app.ts and main.ts have no DOM test (see app-mounts.test.ts), so this reads the sources and pins the joins. The update
// wiring is only worth anything if the app calls it at the three moments, counts every relay request, and hands the controller its options.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const app = read("../src/app/app.ts"); const main = read("../src/main.ts"); const sw = read("../src/sw/sw.ts");
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

describe("the app mounts the automatic update", () => {
  it("builds the wiring once, from the real root, database, request counter and screen", () => {
    expect(count(app, /createUpdateWiring\(/g)).toBe(1);
    expect(app).toMatch(/from "\.\/update-wiring"/);
    expect(app).toContain("inflight, pairing: () => view.screen === \"pair\" || view.state === \"keygen\"");
    expect(app).toContain("setBlocking: (blocking) => { set({ updateBlocking: blocking });");
  });
  it("looks at launch (when the controller is attached), on return to the foreground (not when hidden) and when back online", () => {
    expect(count(app, /updateWiring\.attach\(c\)/g)).toBe(1);
    expect(count(app, /updateWiring\.check\(/g)).toBe(2);
    expect(app).toContain('sync.onOnline(); checkToken(); updateWiring.check("online");');
    expect(app).toContain('if (!document.hidden) updateWiring.check("resume");');
  });
  it("every request to the relay goes through the counter: the poll, the pairing, the token swap and the commands", () => {
    expect(count(app, /inflight\.track\(/g)).toBe(1);
    expect(app).toContain("createRelayClient({ baseUrl: __RELAY_URL__, getDb: () => getDb(), fetchImpl: trackedFetch })");
    expect(app).toContain("createFetchTransport({ baseUrl: __RELAY_URL__, fetchImpl: trackedFetch })");
    expect(app).toMatch(/createTokenRotation\(\{[^}]*fetch: trackedFetch/);
    expect(app).toMatch(/createCommandStack\(\{[^}]*fetch: trackedFetch/);
    expect(count(app, /fetch\(input, init\)/g)).toBe(1); // the one inside the counter
  });
  it("the controller gets the wiring's options, and a held reload still shows the small banner", () => {
    expect(main).toContain("() => location.reload(), app.updateOptions)");
    expect(app).toContain("updateOptions: updateWiring.options");
    expect(app).toContain('set({ updateReady: s === "waiting" || s === "reload" })');
  });
  it("the tap on the banner or on the stronger prompt is the same single path", () => {
    expect(count(app, /case "update": updates\?\.apply\(\)/g)).toBe(1);
  });
  it("the service worker still skips waiting only from its message handler", () => {
    expect(count(sw, /sw\.skipWaiting\(\)/g)).toBe(1);
    expect(sw.indexOf("sw.skipWaiting()")).toBeGreaterThan(sw.indexOf('"message"'));
  });
});
