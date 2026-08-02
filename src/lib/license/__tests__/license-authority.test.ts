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
  vi.stubEnv("SF_DATA_DIR", dataDirectory);
  vi.stubEnv("SF_DEVICE_BINDING", `sfdb1_${"a".repeat(64)}`);
  vi.stubEnv("APP_VERSION", "1.0.0-internal.13");
  vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_MS", "");
  vi.stubEnv("SF_LICENSE_CLOCK_ANCHOR_STATUS", "");
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

  it("keeps missing-anchor trials locked while allowing signed permanent recovery", async () => {
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
    ).resolves.toMatchObject({ status: "valid", type: "permanent" });
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
});
