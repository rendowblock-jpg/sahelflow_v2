// W4SEC-05, phone side: app.ts has no DOM test (see app-mounts.test.ts), so this reads the sources and pins the joins. The token
// rotation module and the per-request token getter are only worth anything if the app really calls them at the three moments.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const app = read("../src/app/app.ts");
const commands = read("../src/app/commands.ts");
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

describe("the app asks the relay about the device token", () => {
  it("builds the rotation once, from the real database, relay URL and clock", () => {
    expect(app).toMatch(/from "\.\.\/sync\/token-rotation"/);
    expect(count(app, /createTokenRotation\(/g)).toBe(1);
    expect(app).toContain("relayBase: __RELAY_URL__");
  });
  it("asks at launch, on return to the foreground (not when hidden) and when back online - three places, nowhere else", () => {
    expect(count(app, /checkToken\(\)/g)).toBe(3);
    expect(app).toMatch(/paint\(\); attachFor\(\); detectPaired\(\); checkToken\(\);/);
    expect(app).toMatch(/sync\.onOnline\(\); checkToken\(\);/);
    expect(app).toMatch(/if \(!document\.hidden\) checkToken\(\);/);
  });
  it("a failed check can never reach the seller: it is swallowed here and the module itself never wipes", () => {
    expect(app).toContain("void tokenRotation.check().catch(() => undefined)");
    const code = read("../src/sync/token-rotation.ts").replace(/\/\/.*$/gm, ""); // comments say "never wipes"; the code must not mention it
    expect(code).not.toMatch(/wipe|revoke/i);
  });
  it("the command stack reads the saved token at every request instead of keeping the one it started with", () => {
    expect(commands).toMatch(/token: async \(\) => \(await d\.db\.get<PairingIdentity>\("keys", "credentials"\)\)\?\.deviceToken \?\? identity\.deviceToken/);
  });
});
