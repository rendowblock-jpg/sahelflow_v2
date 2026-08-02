import { getPublicKeyAsync, signAsync } from "@noble/ed25519";
import { describe, expect, it } from "vitest";

import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
  validateSignedEntitlement,
  type EntitlementClaims,
  type LicenseVerificationKeyring,
  type SignedEntitlement,
} from "../entitlement";

const PRIVATE_KEY = new Uint8Array(
  Buffer.from("883e9345ecd41c7cc2d2761720aabada5fd6e1316d6799206cd2707537ea968b", "hex"),
);
const DEVICE_BINDING = `sfdb1_${"a".repeat(64)}`;
const WORKSPACE_ID = "1".repeat(32);
const INSTALLATION_ID = "2".repeat(32);

function claims(overrides: Partial<EntitlementClaims> = {}): EntitlementClaims {
  return {
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    licenseId: "license_test_001",
    workspaceId: WORKSPACE_ID,
    installationId: INSTALLATION_ID,
    deviceBinding: DEVICE_BINDING,
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
}

async function fixture(overrides: Partial<EntitlementClaims> = {}) {
  const claim = claims(overrides);
  const signature = await signAsync(canonicalEntitlementBytes(claim), PRIVATE_KEY);
  const publicKey = await getPublicKeyAsync(PRIVATE_KEY);
  const entitlement: SignedEntitlement = {
    claims: claim,
    signature: Buffer.from(signature).toString("base64"),
  };
  const keyring: LicenseVerificationKeyring = {
    trial: { trial_test_001: Buffer.from(publicKey).toString("base64") },
    permanent: {},
  };
  return { entitlement, keyring };
}

const context = {
  workspaceId: WORKSPACE_ID,
  installationId: INSTALLATION_ID,
  deviceBinding: DEVICE_BINDING,
  appVersion: "1.0.0-internal.13",
  minimumRevocationEpoch: 0,
  now: new Date("2026-08-03T00:00:00.000Z"),
};

describe("signed entitlement authority", () => {
  it("accepts an exact signed claim and rejects post-signature mutation", async () => {
    const { entitlement, keyring } = await fixture();
    await expect(validateSignedEntitlement(entitlement, context, keyring)).resolves.toMatchObject({
      status: "valid",
    });

    entitlement.claims.shopSlots = 2;
    await expect(validateSignedEntitlement(entitlement, context, keyring)).resolves.toMatchObject({
      status: "invalid",
    });
  });

  it("separates trial and permanent signing authorities", async () => {
    const { entitlement, keyring } = await fixture();
    const permanentOnly: LicenseVerificationKeyring = {
      trial: {},
      permanent: keyring.trial,
    };
    await expect(
      validateSignedEntitlement(entitlement, context, permanentOnly),
    ).resolves.toMatchObject({ status: "invalid" });
  });

  it("denies wrong device, rollback, expiry, revocation and pending transfer", async () => {
    const valid = await fixture();
    await expect(
      validateSignedEntitlement(
        valid.entitlement,
        { ...context, deviceBinding: `sfdb1_${"b".repeat(64)}` },
        valid.keyring,
      ),
    ).resolves.toMatchObject({ status: "device_mismatch" });
    await expect(
      validateSignedEntitlement(
        valid.entitlement,
        { ...context, now: new Date("2026-08-01T00:00:00.000Z") },
        valid.keyring,
      ),
    ).resolves.toMatchObject({ status: "clock_rollback" });

    const expired = await fixture({ expiresAt: "2026-08-03T00:00:00.000Z" });
    await expect(
      validateSignedEntitlement(expired.entitlement, context, expired.keyring),
    ).resolves.toMatchObject({ status: "expired" });
    await expect(
      validateSignedEntitlement(valid.entitlement, { ...context, minimumRevocationEpoch: 1 }, valid.keyring),
    ).resolves.toMatchObject({ status: "revoked" });

    const pending = await fixture({ transferState: "pending" });
    await expect(
      validateSignedEntitlement(pending.entitlement, context, pending.keyring),
    ).resolves.toMatchObject({ status: "transfer_required" });
  });
});
