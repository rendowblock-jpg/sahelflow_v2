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

  it("fails customer release builds closed until two owned public trial routes are provisioned", () => {
    const build = read("src-tauri/build.rs");
    const tauri = read("src-tauri/src/lib.rs");
    const release = read(".github/workflows/release.yml");
    const versionAuthority = read("sahelflow.version.json");
    for (const name of [
      "SF_LICENSE_SERVICE_URL",
      "SF_LICENSE_TRIAL_PUBLIC_KEYS",
      "SF_LICENSE_PERMANENT_PUBLIC_KEYS",
    ]) {
      expect(build).toContain(`"${name}"`);
      expect(tauri).toContain(`env!("${name}")`);
    }
    expect(build).toContain("required_release_value(name)");
    expect(build).toContain("configured_service_urls");
    expect(build).toContain("split('|')");
    expect(build).toContain("primary and recovery HTTPS origins");
    expect(build).toContain("workers.dev must not be packaged");
    expect(build).toContain("production trial primary and recovery origins must be distinct");
    expect(build).toContain("configured_owned_host_suffix");
    expect(build).toContain("../sahelflow.version.json");
    expect(build).toContain("std::net::IpAddr");
    expect(build).toContain("public DNS hostnames, not IP/reserved/private-style destinations");
    expect(build).toContain("provisioned SahelFlow-owned host suffix");
    expect(versionAuthority).toContain('"ownedHostSuffix": null');
    expect(build).toContain('std::env::var("GITHUB_WORKFLOW")');
    expect(build).toContain('"CI" | "Native source contract" | "Windows Rust release parity"');
    expect(build).toContain('routes == ["https://license.invalid"]');
    expect(build).toContain("validate_keyring");
    expect(release).toContain("name: Build Signed Internal Windows Update");
    expect(release).toContain(
      "SF_LICENSE_SERVICE_URL: ${{ secrets.SF_LICENSE_SERVICE_URL || vars.SF_LICENSE_SERVICE_URL }}",
    );
    expect(build).not.toContain('"Build Signed Internal Windows Update" |');
  });

  it("keeps the production worker off workers.dev and makes health prove issuance readiness", () => {
    const wrangler = read("control-plane/licensing/wrangler.toml.example");
    const worker = read("control-plane/licensing/worker.ts");
    expect(wrangler).toContain("workers_dev = false");
    expect(wrangler).toContain("[observability]");
    expect(wrangler).toContain("enabled = true");
    expect(worker).toContain('url.pathname === "/healthz"');
    expect(worker).toContain(
      '"SELECT device_binding, license_id, issued_at, expires_at FROM trial_entitlement LIMIT 1"',
    );
    expect(worker).toContain("trialConfiguration(environment)");
    expect(worker).toContain("await importTrialPrivateKey(environment)");
    expect(worker).toContain("TRIAL_KEY_ID_PATTERN");
    expect(worker).toContain("TRIAL_MEMBER_LIMIT, \"TRIAL_MEMBER_LIMIT\", 25");
    expect(worker).toContain('return json({ status: "unavailable" }, 503)');
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
    expect(anchor).toContain("minimum_permanent_recovery_epoch");
    expect(anchor).toContain("permanent_recovery_challenge");
    expect(anchor).toContain("process_revocation_requests");
    expect(anchor).toContain("installation_authority_preexists");
    expect(anchor).toContain("observe(&device_binding, true)");
    expect(tauri).toContain("license_clock::start_runtime_observer");
    expect(tauri).toContain('"SF_LICENSE_REVOCATION_FLOOR"');
    expect(tauri).toContain('"SF_LICENSE_MINIMUM_PERMANENT_RECOVERY_EPOCH"');
    expect(authority).toContain("advanceNativeRevocationFloor");
    expect(authority).toContain("nativeRevocationFloor");
    expect(nativeAuthority).toContain("timingSafeEqual");
    expect(nativeAuthority).toContain("REQUEST_MAC_DOMAIN");
    expect(nativeAuthority).toContain("initializePermanentRecovery");
    expect(nativeAuthority).toContain("process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS = \"ready\"");
    expect(authority).toContain("LICENSE_ENTITLEMENT_DOWNGRADE");
    expect(authority).toContain("LICENSE_RECOVERY_CHALLENGE_REQUIRED");
    expect(authority).toContain('reconcileExpiredOnlineTrial =');
    expect(authority).toContain("reconcileInstalledPermanent");
    const licensePanel = read("src/components/settings/license-panel.tsx");
    expect(licensePanel).toContain("minimumPermanentRecoveryEpoch");
    expect(licensePanel).toContain("permanentActivationAvailable = !valid || !permanent");
    expect(licensePanel).toContain("{permanentActivationAvailable && (");
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
