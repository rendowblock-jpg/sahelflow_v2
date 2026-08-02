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

  it("fails every release build closed when licensing configuration is absent", () => {
    const build = read("src-tauri/build.rs");
    const tauri = read("src-tauri/src/lib.rs");
    for (const name of [
      "SF_LICENSE_SERVICE_URL",
      "SF_LICENSE_TRIAL_PUBLIC_KEYS",
      "SF_LICENSE_PERMANENT_PUBLIC_KEYS",
    ]) {
      expect(build).toContain(`"${name}"`);
      expect(tauri).toContain(`env!("${name}")`);
    }
    expect(build).toContain("required_release_value(name)");
    expect(build).toContain('starts_with("https://")');
    expect(build).toContain("validate_keyring");
  });

  it("anchors trial time outside replayable AppData before starting the server", () => {
    const anchor = read("src-tauri/src/license_clock.rs");
    const tauri = read("src-tauri/src/lib.rs");
    const authority = read("src/lib/license/license-authority.ts");
    const nativeAuthority = read("src/lib/license/native-commercial-authority.ts");

    expect(anchor).toContain("HKEY_CURRENT_USER");
    expect(anchor).toContain("CryptProtectData");
    expect(anchor).toContain("CryptUnprotectData");
    expect(anchor).not.toContain("authority_file_exists");
    expect(anchor).toContain("start_runtime_observer");
    expect(anchor).toContain("RUNTIME_OBSERVE_INTERVAL");
    expect(anchor).toContain("minimum_revocation_epoch");
    expect(anchor).toContain("process_revocation_requests");
    expect(anchor).toContain("installation_authority_preexists");
    expect(anchor).toContain("observe(&device_binding, true)");
    expect(tauri).toContain("license_clock::start_runtime_observer");
    expect(tauri).toContain('"SF_LICENSE_REVOCATION_FLOOR"');
    expect(authority).toContain("advanceNativeRevocationFloor");
    expect(authority).toContain("nativeRevocationFloor");
    expect(nativeAuthority).toContain("timingSafeEqual");
    expect(nativeAuthority).toContain("REQUEST_MAC_DOMAIN");
    expect(nativeAuthority).toContain("process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS = \"ready\"");
    expect(authority).toContain("LICENSE_ENTITLEMENT_DOWNGRADE");
    const trialRoute = read("src/app/api/license/trial/route.ts");
    expect(trialRoute).toContain("nativeAuthorityNeedsOnlineInitialization");
    expect(trialRoute).toContain(
      "allowOnlineTrialInitialization: true",
    );
    expect(tauri).toContain('"SF_LICENSE_CLOCK_ANCHOR_MS"');
    expect(tauri).toContain('"SF_LICENSE_CLOCK_ANCHOR_STATUS"');
    expect(authority).toContain("highestObservedAt(lastObservedAt, permitsClockRecovery)");
  });

  it("gates protected server rendering and background provider effects", () => {
    const rootLayout = read("src/app/layout.tsx");
    const dashboardLayout = read("src/app/(dashboard)/layout.tsx");
    const whatsAppWorker = read("src/lib/whatsapp/outbox-worker.ts");
    const courierWorker = read("src/lib/delivery/outbox-worker.ts");

    expect(rootLayout).not.toContain("<LicenseBoundary>");
    expect(dashboardLayout).toContain("getLicenseAuthorityProjection");
    expect(dashboardLayout.indexOf("if (!licenseValid)")).toBeLessThan(
      dashboardLayout.indexOf("{children}"),
    );
    expect(whatsAppWorker.indexOf("requireLicenseEntitlement")).toBeLessThan(
      whatsAppWorker.indexOf("drainDueWhatsAppEffects({"),
    );
    expect(courierWorker.indexOf("requireLicenseEntitlement")).toBeLessThan(
      courierWorker.indexOf("drainDueCourierBookings({"),
    );
  });
});
