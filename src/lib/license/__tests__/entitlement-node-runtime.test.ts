import { createPrivateKey, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canonicalEntitlementBytes,
  validateSignedEntitlement,
  type EntitlementClaims,
} from "../entitlement";

const PRIVATE_KEY_HEX =
  "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const PUBLIC_KEY_BASE64 = "ebVWLo/mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ=";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function claims(): EntitlementClaims {
  return {
    domain: "sahelflow.license.entitlement.v2",
    formatVersion: 2,
    licenseId: "trial_node_runtime_001",
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    deviceBinding: `sfdb1_${"a".repeat(64)}`,
    productMajor: 1,
    type: "trial",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    supportEndsAt: "2031-01-01T00:00:00.000Z",
    shopSlots: 10,
    memberLimit: 10,
    deviceLimit: 10,
    backupBytes: 50 * 1024 * 1024 * 1024,
    mediaBytes: 10 * 1024 * 1024 * 1024,
    features: ["core"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 0,
    keyId: "ci-trial-key-v1",
    issuer: "trial-service",
  };
}

function signedEntitlement() {
  const entitlementClaims = claims();
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      PKCS8_ED25519_PREFIX,
      Buffer.from(PRIVATE_KEY_HEX, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });
  return {
    claims: entitlementClaims,
    signature: sign(
      null,
      Buffer.from(canonicalEntitlementBytes(entitlementClaims)),
      privateKey,
    ).toString("base64"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("packaged Node entitlement verification", () => {
  it("verifies a valid Ed25519 entitlement without global WebCrypto", async () => {
    vi.stubGlobal("crypto", undefined);
    const entitlement = signedEntitlement();

    await expect(
      validateSignedEntitlement(
        entitlement,
        {
          workspaceId: entitlement.claims.workspaceId,
          installationId: entitlement.claims.installationId,
          deviceBinding: entitlement.claims.deviceBinding,
          appVersion: "1.0.0-internal.14",
          minimumRevocationEpoch: 0,
          now: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          trial: { "ci-trial-key-v1": PUBLIC_KEY_BASE64 },
          permanent: {},
        },
      ),
    ).resolves.toMatchObject({ status: "valid" });
  });

  it("still rejects a tampered signature", async () => {
    const entitlement = signedEntitlement();
    const signature = Buffer.from(entitlement.signature, "base64");
    signature[0] ^= 0x01;

    await expect(
      validateSignedEntitlement(
        { ...entitlement, signature: signature.toString("base64") },
        {
          workspaceId: entitlement.claims.workspaceId,
          installationId: entitlement.claims.installationId,
          deviceBinding: entitlement.claims.deviceBinding,
          appVersion: "1.0.0-internal.14",
          minimumRevocationEpoch: 0,
          now: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          trial: { "ci-trial-key-v1": PUBLIC_KEY_BASE64 },
          permanent: {},
        },
      ),
    ).resolves.toMatchObject({ status: "invalid" });
  });
});
