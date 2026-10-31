// W3-F3 mounts: app.ts has no DOM test, so this reads its source and pins the joins. The tested modules (shell-strip, vault-wiring,
// authority) must be what app.ts really calls; a module nobody calls is the fault this file exists to catch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("../src/app/app.ts", import.meta.url)), "utf8");
const count = (re: RegExp): number => (app.match(re) ?? []).length;

describe("app.ts mounts the tested modules", () => {
  it("every screen is drawn through withShellStrip, once, around renderApp (the pcoff strip on every screen)", () => {
    expect(count(/withShellStrip\(renderApp\(v\)/g)).toBe(1);
    expect(app).not.toMatch(/innerHTML\s*=\s*renderApp\(/);
    expect(app).toMatch(/from "\.\/shell-strip"/);
    expect(app).toContain("asOf: v.projection?.generatedAt ?? null");
    expect(app).toContain("pcoff: v.pcoff === true");
  });
  it("the vault is driven only through vault-wiring: one call per event, no inline hide/show/lock left", () => {
    expect(app).toMatch(/from "\.\/vault-wiring"/);
    expect(count(/createVaultWiring\(/g)).toBe(1);
    for (const inline of ["vault.hide(", "vault.show(", "vault.lock(", "wakeOrders"]) expect(app, inline).not.toContain(inline);
    expect(count(/vaultWiring\.visibility\(\{ hidden: document\.hidden, phase: lockState\.phase, now: Date\.now\(\) \}\)/g)).toBe(1);
    expect(count(/vaultWiring\.unlocked\(\)/g)).toBe(1);
    expect(count(/vaultWiring\.wipe\(\)/g)).toBe(1);
    expect(count(/vaultWiring\.locked\(\)/g)).toBe(1);
  });
  it("the vault wiring is given the orders key, and an emptied vault reloads only when the phone is not locked", () => {
    expect(app).toContain("key: ORDERS_VAULT_KEY");
    expect(app).toContain('if (emptied && lockState.phase !== "locked") void h.reload()');
  });
  it("the orders host gets the real command-authority expiry (the PC time), not a constant undefined", () => {
    expect(app).toContain("authorityExpiresAt: s.authorityExpiresAt");
    expect(app).not.toMatch(/authorityExpiresAt:\s*\(\)\s*=>/);
  });
});
