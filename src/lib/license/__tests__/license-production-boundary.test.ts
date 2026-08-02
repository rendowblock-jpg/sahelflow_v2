import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production licensing authority inventory", () => {
  it("uses direct native SMBIOS binding without raw browser or shell identity", () => {
    const nativeBinding = read("src-tauri/src/device_binding.rs");
    const tauri = read("src-tauri/src/lib.rs");

    expect(nativeBinding).toContain("GetSystemFirmwareTable");
    expect(nativeBinding).toContain("sahelflow.device-binding.v1");
    expect(tauri).toContain('"SF_DEVICE_BINDING"');
    expect(tauri).not.toContain("Get-CimInstance");
    expect(tauri).not.toContain("MachineGuid");
    expect(existsSync(join(process.cwd(), "src/lib/license/machine-id.ts"))).toBe(false);
  });

  it("removes self-issued, browser-persisted and shop-setting license authority", () => {
    expect(existsSync(join(process.cwd(), "src/lib/license/license-client.ts"))).toBe(false);
    expect(read("src/stores/license-store.ts")).not.toContain("persist(");
    expect(read("src/lib/license/license-authority.ts")).not.toContain(
      "active_license_status",
    );
    expect(read("src/app/api/license/sync/route.ts")).not.toContain("prisma.setting");
  });

  it("keeps permanent signing offline and trial signing in the bounded worker", () => {
    const signer = read("scripts/sign-license-entitlement.ts");
    const worker = read("control-plane/licensing/worker.ts");
    expect(signer).toContain('claims.issuer !== "founder-offline"');
    expect(signer).toContain("Permanent private key must remain outside the repository");
    expect(worker).toContain("TRIAL_PRIVATE_KEY_PKCS8");
    expect(worker).not.toContain("PERMANENT_PRIVATE");
  });
});
