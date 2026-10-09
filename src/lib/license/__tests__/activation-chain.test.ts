import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ActivationCodeError,
  encodeActivationCode,
  parseActivationInput,
} from "../activation-code";
import { activationServerErrorKey } from "../activation-errors";
import {
  canonicalEntitlementBytes,
  entitlementClaimsSchema,
  validateSignedEntitlement,
} from "../entitlement";
import { PERMANENT_PACKAGE, packageTotalDzd, permanentLicenseClaims } from "../packages";
import { decodeLicenseRequest, encodeLicenseRequest } from "../request-code";

const REQUEST = {
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  deviceBinding: `sfdb1_${"c".repeat(64)}`,
  productMajor: 1,
  transferEpoch: 0,
  revocationEpoch: 0,
  recoveryEpoch: 2,
  currentLicenseId: null,
};

function signedLicense(extraShops = 0) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const claims = entitlementClaimsSchema.parse(
    permanentLicenseClaims(decodeLicenseRequest(encodeLicenseRequest(REQUEST)), {
      extraShops,
      keyId: "permanent-test-key",
      issuedAt: new Date("2026-10-08T00:00:00Z"),
    }),
  );
  const signature = sign(null, canonicalEntitlementBytes(claims), privateKey).toString("base64");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
  return { signed: { claims, signature }, keyring: { trial: {}, permanent: { "permanent-test-key": raw } } };
}

describe("permanent licence package", () => {
  it("grants exactly the SahelFlow 1.0 commercial package", () => {
    const claims = permanentLicenseClaims(REQUEST, {
      issuedAt: new Date("2026-10-08T00:00:00Z"),
      licenseId: "perm-test-0001",
    });
    expect(claims).toMatchObject({
      type: "permanent",
      issuer: "founder-offline",
      expiresAt: null,
      shopSlots: 5,
      memberLimit: 11,
      deviceLimit: 23,
      backupBytes: 20_000_000_000,
      mediaBytes: 10_000_000_000,
      supportEndsAt: "2031-10-08T00:00:00.000Z",
      recoveryEpoch: 2,
    });
    expect(entitlementClaimsSchema.safeParse(claims).success).toBe(true);
  });

  it("adds paid extra shops up to the ten-shop ceiling", () => {
    const claims = permanentLicenseClaims(REQUEST, { extraShops: 5 });
    expect(claims.shopSlots).toBe(PERMANENT_PACKAGE.maximumShops);
    expect(claims.backupBytes).toBe(40_000_000_000);
    expect(claims.mediaBytes).toBe(20_000_000_000);
    expect(packageTotalDzd(5)).toBe(60_000);
    expect(() => permanentLicenseClaims(REQUEST, { extraShops: 6 })).toThrow(RangeError);
  });
});

describe("activation code", () => {
  it("round-trips a signed licence, even when WhatsApp wraps it over lines", () => {
    const { signed } = signedLicense();
    const code = encodeActivationCode(signed);
    expect(code.startsWith("SFLA1.")).toBe(true);
    const wrapped = `Here is your licence:\n${(code.match(/.{1,40}/g) ?? []).join("\n")}\n`;
    expect(parseActivationInput(wrapped)).toEqual(signed);
  });

  it("still accepts the legacy JSON form", () => {
    const { signed } = signedLicense();
    expect(parseActivationInput(JSON.stringify(signed, null, 2))).toEqual(signed);
  });

  it("names a truncated or altered code before it reaches the server", () => {
    const code = encodeActivationCode(signedLicense().signed);
    const failure = (input: string) => {
      try {
        parseActivationInput(input);
      } catch (error) {
        return error instanceof ActivationCodeError ? error.code : "other";
      }
      return "none";
    };
    expect(failure("")).toBe("LICENSE_CODE_EMPTY");
    expect(failure("hello")).toBe("LICENSE_CODE_UNRECOGNIZED");
    expect(failure(code.slice(0, -12))).toBe("LICENSE_CODE_CHECKSUM");
    expect(failure(code.replace(/\.(.)/, ".X$1"))).toBe("LICENSE_CODE_CHECKSUM");
    expect(failure("{not json")).toBe("LICENSE_CODE_UNREADABLE");
  });

  it("produces a licence the installation accepts end to end", async () => {
    const { signed, keyring } = signedLicense(2);
    const parsed = parseActivationInput(encodeActivationCode(signed));
    const result = await validateSignedEntitlement(
      parsed,
      {
        workspaceId: REQUEST.workspaceId,
        installationId: REQUEST.installationId,
        deviceBinding: REQUEST.deviceBinding,
        appVersion: "1.0.0-internal.42",
        minimumRevocationEpoch: 0,
        now: new Date("2026-10-08T01:00:00Z"),
      },
      keyring,
    );
    expect(result.status).toBe("valid");
    expect(result.entitlement?.claims.shopSlots).toBe(7);
  });
});

describe("activation error guidance", () => {
  it("tells the seller what to do for each rejection", () => {
    expect(activationServerErrorKey({ code: "LICENSE_DEVICE_MISMATCH" })).toBe(
      "license.activation.error.otherComputer",
    );
    expect(
      activationServerErrorKey({ code: "LICENSE_INVALID", error: "Entitlement signing key is unavailable" }),
    ).toBe("license.activation.error.unknownKey");
    expect(
      activationServerErrorKey({ code: "LICENSE_INVALID", error: "Entitlement signature is invalid" }),
    ).toBe("license.activation.error.signature");
    expect(activationServerErrorKey({ code: "LICENSE_RECOVERY_CHALLENGE_REQUIRED" })).toBe(
      "license.activation.error.recovery",
    );
    expect(activationServerErrorKey({ code: "ACTION_FORBIDDEN" })).toBe(
      "license.activation.error.permission",
    );
    expect(activationServerErrorKey({ code: "SOMETHING_ELSE" })).toBe("license.activationFailed");
  });
});
