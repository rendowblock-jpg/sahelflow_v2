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

  it("keeps Signal logical identifiers out of protected filenames and envelopes", () => {
    const auth = source("sidecars/whatsapp/protected-auth-state.ts");
    expect(auth).toContain('const FILENAME_PURPOSE = "sahelflow/whatsapp/auth-state/filename/v2"');
    expect(auth).toContain('createHmac("sha256", key)');
    expect(auth).toContain("cipher.setAAD(aad(recordId))");
    expect(auth).toContain("decipher.setAAD(aad(recordId))");
    expect(auth).not.toContain("parsed.recordId");
    expect(auth).not.toContain("recordId,\n      iv:");
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

  it("migrates and verifies queued spool records before destructive legacy-key retirement", () => {
    const crypto = source("sidecars/whatsapp/inbound-spool-crypto.ts");
    const migrationStart = crypto.indexOf(
      "migrateLegacySpoolRecords(directory, oldKey, key);",
    );
    const retirementStart = crypto.indexOf(
      "retireLegacyKeyFile(legacyPath, directory, key);",
    );
    expect(migrationStart).toBeGreaterThanOrEqual(0);
    expect(retirementStart).toBeGreaterThanOrEqual(0);
    expect(migrationStart).toBeLessThan(retirementStart);

    const retirementBodyStart = crypto.indexOf("function retireLegacyKeyFile(");
    const retirementBodyEnd = crypto.indexOf(
      "function recoverInterruptedRetirement(",
      retirementBodyStart,
    );
    expect(retirementBodyStart).toBeGreaterThanOrEqual(0);
    expect(retirementBodyEnd).toBeGreaterThan(retirementBodyStart);
    const retirementBody = crypto.slice(retirementBodyStart, retirementBodyEnd);
    const verifyStart = retirementBody.indexOf(
      "verifyProtectedSpoolRecords(directory, protectedKey);",
    );
    const eraseStart = retirementBody.indexOf(
      "eraseLegacyKeyFile(retirementPath);",
    );
    expect(verifyStart).toBeGreaterThanOrEqual(0);
    expect(eraseStart).toBeGreaterThanOrEqual(0);
    expect(verifyStart).toBeLessThan(eraseStart);

    expect(crypto).toContain("Packaged WhatsApp inbound spool refuses raw key authority");
  });
});
