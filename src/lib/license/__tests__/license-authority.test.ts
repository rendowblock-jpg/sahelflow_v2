process.env.SF_MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { getPublicKeyAsync, signAsync } from "@noble/ed25519";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ShopContext } from "@/lib/shops/context";
import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
  type EntitlementClaims,
} from "../entitlement";
import {
  activateSignedEntitlement,
  getLicenseAuthorityProjection,
  licenseAuthorityPath,
  requiresAuthenticatedEntitlementActivation,
} from "../license-authority";

vi.mock("../native-commercial-authority", () => ({
  advanceNativeRevocationFloor: vi.fn(
    async (_minimumRevocationEpoch: number, options?: { initializePermanentRecovery?: boolean }) => {
      if (!options?.initializePermanentRecovery) return;
      process.env.SF_LICENSE_CLOCK_ANCHOR_STATUS = "ready";
      process.env.SF_LICENSE_CLOCK_ANCHOR_MS = String(
        new Date("2026-08-10T00:00:00.000Z").getTime(),
      );
      process.env.SF_LICENSE_REVOCATION_FLOOR = "0";
      process.env.SF_LICENSE_MINIMUM_PERMANENT_RECOVERY_EPOCH = "5481516234200000";
    },
  ),
}));

const PRIVATE_KEY = new Uint8Array(
  Buffer.from("883e9345ecd41c7cc2d2761720aabada5fd6e1316d6799206cd2707537ea968b", "hex"),
);
const dataDirectory = mkdtempSync(join(tmpdir(), "sahelflow-license-authority-"));
const shop: ShopContext = {
  shopId: "default",
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopIncarnationId: "3".repeat(32),
  databaseFileId: "4".repeat(32),
  registryRevision: 1,
  migrationSetSha256: "5".repeat(64),
};

async function signedClaims(overrides: Partial<EntitlementClaims> = {}) {
  const claims: EntitlementClaims = {
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    licenseId: "license_authority_001",
    workspaceId: shop.workspaceId,
    installationId: shop.installationId,
    deviceBinding: `sfdb1_${"a".repeat(64)}`,
    productMajor: 1,
    type: "trial",
    issuedAt: "2026-08-02T00:00:00.000Z",
    expiresAt: "2026-08-09T00:00:00.000Z",
    supportEndsAt: "2031-08-02T00:00:00.000Z",
    shopSlots: 1,
    memberLimit: 25,
    deviceLimit: 1,
    backupBytes: 20_000_000_000,
    mediaBytes: 0,
    features: ["sahelflow.complete"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 0,
    keyId: "trial_test_001",
    issuer: "trial-service",
    ...overrides,
  };
  const signature = await signAsync(canonicalEntitlementBytes(claims), PRIVATE_KEY);
  return { claims, signature: Buffer.from(signature).toString("base64") };
}

beforeEach(async () => {
  rmSync(dataDirectory, { recursive: true, force: true });
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("SF_DATA_DIR", dataDirectory);
  vi.stubEnv("SF_DEVICE_BINDING", `sfdb1_${"a".repeat(64)}`);
  vi.stubEnv("APP_VERSION", "1.0.0-internal.13");
  vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_MS", "");
  vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "");
  vi.stubEnv("SF_LICENSE_REVOCATION_FLOOR", "");
  vi.stubEnv("SF_LICENSE_MINIMUM_PERMANENT_RECOVERY_EPOCH", "");
  const publicKey = await getPublicKeyAsync(PRIVATE_KEY);
  vi.stubEnv(
    "SF_LICENSE_TRIAL_PUBLIC_KEYS",
    JSON.stringify({ trial_test_001: Buffer.from(publicKey).toString("base64") }),
  );
  vi.stubEnv(
    "SF_LICENSE_PERMANENT_PUBLIC_KEYS",
    JSON.stringify({ permanent_test_001: Buffer.from(publicKey).toString("base64") }),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dataDirectory, { recursive: true, force: true });
});

describe("installation license authority", () => {
  it("activates outside the shop database and survives restart reads", async () => {
    const entitlement = await signedClaims();
    await expect(
      activateSignedEntitlement(entitlement, shop, new Date("2026-08-03T00:00:00.000Z")),
    ).resolves.toMatchObject({ status: "valid", licenseId: "license_authority_001" });
    expect(licenseAuthorityPath()).toContain("system");
    await expect(
      getLicenseAuthorityProjection(shop, new Date("2026-08-03T01:00:00.000Z")),
    ).resolves.toMatchObject({ status: "valid", shopSlots: 1, memberLimit: 25 });
  });

  it("does not let online trial recovery replace a permanent entitlement", async () => {
    const permanent = await signedClaims({
      licenseId: "license_permanent_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
    });
    await activateSignedEntitlement(
      permanent,
      shop,
      new Date("2026-08-03T00:00:00.000Z"),
    );
    const trial = await signedClaims({ licenseId: "license_trial_reissue_001" });
    await expect(
      activateSignedEntitlement(trial, shop, new Date("2026-08-03T01:00:00.000Z"), {
        allowOnlineTrialInitialization: true,
      }),
    ).rejects.toMatchObject({ code: "LICENSE_ENTITLEMENT_DOWNGRADE" });
  });

  it("uses an expired canonical online trial only to reseal permanent recovery authority", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "missing");
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_MS", "");
    const expiredTrial = await signedClaims({
      licenseId: "license_expired_canonical_trial_001",
      expiresAt: "2026-08-03T00:00:00.000Z",
    });
    const now = new Date("2026-08-10T00:00:00.000Z");

    await expect(activateSignedEntitlement(expiredTrial, shop, now)).rejects.toMatchObject({
      code: "LICENSE_AUTHORITY_UNAVAILABLE",
    });
    await expect(
      activateSignedEntitlement(expiredTrial, shop, now, {
        allowOnlineTrialInitialization: true,
      }),
    ).resolves.toMatchObject({
      status: "expired",
      type: "trial",
      minimumPermanentRecoveryEpoch: 5_481_516_234_200_000,
    });
    await expect(getLicenseAuthorityProjection(shop, now)).resolves.toMatchObject({
      status: "expired",
      type: "trial",
      minimumPermanentRecoveryEpoch: 5_481_516_234_200_000,
    });
  });

  it("fails closed when authenticated state is edited or rolled back in time", async () => {
    const entitlement = await signedClaims();
    await activateSignedEntitlement(entitlement, shop, new Date("2026-08-03T00:00:00.000Z"));
    const path = licenseAuthorityPath();
    const document = JSON.parse(readFileSync(path, "utf8")) as {
      state: { entitlement: { claims: { shopSlots: number } } };
    };
    document.state.entitlement.claims.shopSlots = 99;
    writeFileSync(path, JSON.stringify(document));
    await expect(getLicenseAuthorityProjection(shop)).rejects.toMatchObject({
      code: "LICENSE_AUTHORITY_UNAVAILABLE",
    });

    rmSync(dataDirectory, { recursive: true, force: true });
    vi.stubEnv("SF_DATA_DIR", dataDirectory);
    await activateSignedEntitlement(entitlement, shop, new Date("2026-08-03T00:00:00.000Z"));
    await expect(
      getLicenseAuthorityProjection(shop, new Date("2026-08-02T00:00:00.000Z")),
    ).resolves.toMatchObject({ status: "clock_rollback" });
  });

  it("rejects an authentic AppData snapshot behind the protected native clock", async () => {
    const entitlement = await signedClaims();
    await activateSignedEntitlement(entitlement, shop, new Date("2026-08-03T00:00:00.000Z"));
    vi.stubEnv(
      "SF_LICENSE_CLOCK_ANCHOR_MS",
      String(new Date("2026-08-08T00:00:00.000Z").getTime()),
    );
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "ready");
    await expect(
      getLicenseAuthorityProjection(shop, new Date("2026-08-04T00:00:00.000Z")),
    ).resolves.toMatchObject({ status: "clock_rollback" });
  });

  it("keeps missing-anchor claims locked until authoritative reconciliation", async () => {
    const trial = await signedClaims();
    await activateSignedEntitlement(trial, shop, new Date("2026-08-03T00:00:00.000Z"));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "missing");
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_MS", "");

    await expect(
      getLicenseAuthorityProjection(shop, new Date("2026-08-04T00:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_AUTHORITY_UNAVAILABLE" });

    const recovery = await signedClaims({
      licenseId: "license_clock_recovery_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
      recoveryEpoch: 1,
    });
    await expect(
      activateSignedEntitlement(recovery, shop, new Date("2026-08-04T00:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_AUTHORITY_UNAVAILABLE" });
  });

  it("rejects historical permanent claims below the native recovery epoch", async () => {
    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "ready");
    vi.stubEnv(
      "SF_LICENSE_CLOCK_ANCHOR_MS",
      String(new Date("2026-08-03T00:00:00.000Z").getTime()),
    );
    vi.stubEnv("SF_LICENSE_REVOCATION_FLOOR", "0");
    vi.stubEnv("SF_LICENSE_MINIMUM_PERMANENT_RECOVERY_EPOCH", "5481516234200000");
    const historical = await signedClaims({
      licenseId: "license_historical_recovery_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
      recoveryEpoch: 1,
    });
    await expect(
      activateSignedEntitlement(historical, shop, new Date("2026-08-04T00:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_RECOVERY_CHALLENGE_REQUIRED" });

    const differentEpoch = await signedClaims({
      licenseId: "license_different_recovery_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
      recoveryEpoch: 5_481_516_234_200_001,
    });
    await expect(
      activateSignedEntitlement(differentEpoch, shop, new Date("2026-08-04T00:00:30.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_RECOVERY_CHALLENGE_REQUIRED" });

    const reconciled = await signedClaims({
      licenseId: "license_current_recovery_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
      recoveryEpoch: 5_481_516_234_200_000,
    });
    await expect(
      activateSignedEntitlement(reconciled, shop, new Date("2026-08-04T00:01:00.000Z")),
    ).resolves.toMatchObject({
      status: "valid",
      minimumPermanentRecoveryEpoch: 5_481_516_234_200_000,
    });
  });

  it("recovers corrupt local state only with an exact offline recovery claim", async () => {
    const trial = await signedClaims();
    await activateSignedEntitlement(trial, shop, new Date("2026-08-03T00:00:00.000Z"));
    writeFileSync(licenseAuthorityPath(), "{\"tampered\":true}\n");

    const recovery = await signedClaims({
      licenseId: "license_permanent_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
      recoveryEpoch: 1,
    });
    await expect(requiresAuthenticatedEntitlementActivation(recovery)).resolves.toBe(false);
    await expect(
      activateSignedEntitlement(recovery, shop, new Date("2026-08-03T01:00:00.000Z")),
    ).resolves.toMatchObject({ status: "valid", type: "permanent" });
    expect(readdirSync(join(dataDirectory, "system"))).toContainEqual(
      expect.stringContaining("license-authority.json.recovered."),
    );
  });

  it("persists a signed monotonic transfer revocation on the old installation", async () => {
    const active = await signedClaims({
      licenseId: "license_transfer_001",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
    });
    await activateSignedEntitlement(active, shop, new Date("2026-08-03T00:00:00.000Z"));

    const revoked = await signedClaims({
      licenseId: "license_transfer_001",
      type: "permanent",
      expiresAt: null,
      transferState: "revoked",
      transferEpoch: 1,
      revocationEpoch: 1,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
    });
    await expect(
      activateSignedEntitlement(revoked, shop, new Date("2026-08-03T01:00:00.000Z")),
    ).resolves.toMatchObject({ status: "revoked", licenseId: "license_transfer_001" });
    await expect(
      getLicenseAuthorityProjection(shop, new Date("2026-08-03T02:00:00.000Z")),
    ).resolves.toMatchObject({ status: "revoked" });
    await expect(
      activateSignedEntitlement(active, shop, new Date("2026-08-03T03:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_REVOKED" });

    vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "ready");
    vi.stubEnv("SF_LICENSE_REVOCATION_FLOOR", "1");
    rmSync(licenseAuthorityPath(), { force: true });
    await expect(
      activateSignedEntitlement(active, shop, new Date("2026-08-03T04:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_REVOKED" });
  });

  it("rejects a revocation that does not advance the installed license lineage", async () => {
    const active = await signedClaims({
      licenseId: "license_transfer_002",
      type: "permanent",
      expiresAt: null,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
    });
    await activateSignedEntitlement(active, shop, new Date("2026-08-03T00:00:00.000Z"));
    const unrelated = await signedClaims({
      licenseId: "license_unrelated_001",
      type: "permanent",
      expiresAt: null,
      transferState: "revoked",
      transferEpoch: 1,
      revocationEpoch: 1,
      keyId: "permanent_test_001",
      issuer: "founder-offline",
    });
    await expect(
      activateSignedEntitlement(unrelated, shop, new Date("2026-08-03T01:00:00.000Z")),
    ).rejects.toMatchObject({ code: "LICENSE_REVOCATION_ROLLBACK" });
  });
});
