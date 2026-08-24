import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("packaged WhatsApp protected-storage contract", () => {
  it("does not use Baileys plaintext multi-file auth as durable production authority", () => {
    const whatsapp = source("sidecars/whatsapp/whatsapp.ts");
    const auth = source("sidecars/whatsapp/protected-auth-state.ts");
    expect(whatsapp).not.toContain("useMultiFileAuthState");
    expect(whatsapp).toContain("useProtectedWhatsAppAuthState");
    expect(auth).toContain('const PROTECTED_DIRECTORY = "whatsapp-auth-protected"');
    expect(auth).toContain("BufferJSON.replacer");
    expect(auth).toContain("BufferJSON.reviver");
    expect(auth).toContain("writeMarker(key)");
    expect(auth).toContain("retireLegacyDirectory()");
  });

  it("uses an installation-bound DPAPI CurrentUser root with separated auth and spool subkeys", () => {
    const storage = source("sidecars/whatsapp/protected-storage-key.ts");
    expect(storage).toContain('const ALGORITHM = "windows-dpapi-current-user"');
    expect(storage).toContain("Security.Cryptography.ProtectedData");
    expect(storage).toContain("DataProtectionScope]::CurrentUser");
    expect(storage).toContain("workspaceId");
    expect(storage).toContain("installationId");
    expect(storage).toContain('const AUTH_SUBKEY_PURPOSE = "sahelflow/whatsapp/auth-state/v1"');
    expect(storage).toContain('const SPOOL_SUBKEY_PURPOSE = "sahelflow/whatsapp/inbound-spool/v2"');
    expect(storage).toContain("Packaged WhatsApp storage refuses raw key environment authority");
  });

  it("migrates queued spool records before retiring the legacy plaintext key", () => {
    const crypto = source("sidecars/whatsapp/inbound-spool-crypto.ts");
    expect(crypto).toContain("migrateLegacySpoolRecords(directory, oldKey, key)");
    expect(crypto).toContain("eraseLegacyKeyFile(legacyPath)");
    expect(crypto.indexOf("migrateLegacySpoolRecords(directory, oldKey, key)")).toBeLessThan(
      crypto.indexOf("eraseLegacyKeyFile(legacyPath)"),
    );
    expect(crypto).toContain("Packaged WhatsApp inbound spool refuses raw key authority");
  });
});
