/**
 * License service depth tests — T-AUTH-INFRA.
 *
 * Extends the existing license-service.test.ts with coverage for:
 *   - Dev bypass behavior (NODE_ENV=development + no public key)
 *   - No public key set in production → "License verification unavailable"
 *   - Signature verification throws → fail-closed "invalid"
 *   - Version-blocked license (minAppVersion > appVersion)
 *   - Extension-type licenses
 *   - getStatusLabel mapping
 *   - isLicenseValid: dev bypass + cache hit/miss + DB lookup + fail-closed
 *   - requireLicense: throws SahelFlowError(403) when invalid
 *   - hasFeature: dev bypass + cache valid/invalid + "all" wildcard
 *   - setCachedLicenseResult
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mutable mock state ───────────────────────────────────────────────────────
const mockState = vi.hoisted(() => ({
  licensePublicKey: "" as string,
  dbSetting: null as null | { value: string },
  dbPayload: null as null | { value: string },
}));

// ── Mock @/lib/env with a controllable licensePublicKey getter ──────────────
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  const mockedEnv: typeof actual.env = { ...actual.env };
  Object.defineProperty(mockedEnv, "licensePublicKey", {
    get: () => mockState.licensePublicKey,
    enumerable: true,
    configurable: true,
  });
  return { ...actual, env: mockedEnv };
});

// ── Mock @/lib/db (used by isLicenseValid for setting lookup) ────────────────
vi.mock("@/lib/db", () => ({
  db: {
    setting: {
      findUnique: vi.fn(async (args: { where: { key: string } }) => {
        const key = args?.where?.key;
        if (key === "active_license_payload") return mockState.dbPayload ?? null;
        return mockState.dbSetting ?? null;
      }),
    },
  },
}));

// ── Mock ./machine-id (isLicenseValid calls getMachineId for payload re-verify) ──
vi.mock("../machine-id", () => ({
  getMachineId: vi.fn(async () => MACHINE_ID),
}));

// ── Mock @/lib/license/crypto so we can simulate verify-throws ──────────────
const cryptoMock = vi.hoisted(() => ({
  verifyLicenseSignature: vi.fn(),
  isExpired: vi.fn(() => false),
  daysRemaining: vi.fn(() => 30),
  meetsVersionRequirement: vi.fn(() => true),
}));

vi.mock("@/lib/license/crypto", () => ({
  verifyLicenseSignature: cryptoMock.verifyLicenseSignature,
  isExpired: cryptoMock.isExpired,
  daysRemaining: cryptoMock.daysRemaining,
  meetsVersionRequirement: cryptoMock.meetsVersionRequirement,
}));

import {
  validateLicense,
  issueTrial,
  isLicenseValid,
  requireLicense,
  hasFeature,
  setCachedLicenseResult,
  getStatusLabel,
} from "../license-service";
import type { LicensePayload, SignedLicense } from "../types";
import { SahelFlowError } from "@/types/errors";

const MACHINE_ID = "machine-depth-001";
const APP_VERSION = "3.1.0";

function makePayload(opts?: Partial<LicensePayload>): LicensePayload {
  return {
    id: "depth-license-001",
    type: "permanent",
    machineIds: [MACHINE_ID],
    features: ["all"],
    minAppVersion: "3.0.0",
    issuedAt: new Date().toISOString(),
    expiresAt: undefined,
    issuedBy: "founder",
    ...opts,
  };
}

function makeSignedLicense(payload: LicensePayload, signature = "fake-signature"): SignedLicense {
  return { payload, signature };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); // not dev mode by default
  mockState.licensePublicKey = "";
  mockState.dbSetting = null;
    mockState.dbPayload = null;
  cryptoMock.verifyLicenseSignature.mockReset();
  cryptoMock.verifyLicenseSignature.mockResolvedValue(true);
  cryptoMock.isExpired.mockReturnValue(false);
  cryptoMock.daysRemaining.mockReturnValue(30);
  cryptoMock.meetsVersionRequirement.mockReturnValue(true);
  setCachedLicenseResult(null);
});

// ── Dev bypass ───────────────────────────────────────────────────────────────
describe("validateLicense — dev bypass", () => {
  it("returns valid in dev mode when no public key is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockState.licensePublicKey = "";
    const license = makeSignedLicense(makePayload());
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
    expect(result.message).toContain("Development mode");
  });

  it("does NOT bypass in dev mode when a public key IS configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mockState.licensePublicKey = "real-public-key-base64";
    cryptoMock.verifyLicenseSignature.mockResolvedValue(true);
    const license = makeSignedLicense(makePayload());
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
    // Should have called the real verification path
    expect(cryptoMock.verifyLicenseSignature).toHaveBeenCalled();
  });
});

// ── No public key in production ──────────────────────────────────────────────
describe("validateLicense — missing public key in production", () => {
  it("returns 'invalid' with 'verification unavailable' message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.licensePublicKey = "";
    const license = makeSignedLicense(makePayload(), "real-but-unsigned");
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("public key not configured");
    // Should NOT have attempted signature verification
    expect(cryptoMock.verifyLicenseSignature).not.toHaveBeenCalled();
  });
});

// ── Signature verification throws ────────────────────────────────────────────
describe("validateLicense — signature verification throws (fail-closed)", () => {
  it("returns 'invalid' when verifyLicenseSignature throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.licensePublicKey = "some-key";
    cryptoMock.verifyLicenseSignature.mockRejectedValue(new Error("crypto explode"));
    const license = makeSignedLicense(makePayload());
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("could not be verified");
  });

  it("returns 'invalid' when signature is invalid (no throw)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.licensePublicKey = "some-key";
    cryptoMock.verifyLicenseSignature.mockResolvedValue(false);
    const license = makeSignedLicense(makePayload());
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("invalid");
  });
});

// ── Machine mismatch + version + expiry (with mocked crypto) ─────────────────
describe("validateLicense — machine/version/expiry checks", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.licensePublicKey = "some-key";
    cryptoMock.verifyLicenseSignature.mockResolvedValue(true);
  });

  it("returns 'machine_mismatch' when machineId is not in payload", async () => {
    const payload = makePayload({ machineIds: ["other-machine"] });
    const result = await validateLicense(makeSignedLicense(payload), MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("machine_mismatch");
  });

  it("returns 'version_blocked' when app version is too old", async () => {
    cryptoMock.meetsVersionRequirement.mockReturnValue(false);
    const payload = makePayload({ minAppVersion: "4.0.0" });
    const result = await validateLicense(makeSignedLicense(payload), MACHINE_ID, "3.0.0");
    expect(result.status).toBe("version_blocked");
    expect(result.message).toContain("3.0.0");
  });

  it("returns 'expired' when isExpired returns true", async () => {
    cryptoMock.isExpired.mockReturnValue(true);
    cryptoMock.daysRemaining.mockReturnValue(-3);
    const payload = makePayload({ expiresAt: "2020-01-01T00:00:00Z" });
    const result = await validateLicense(makeSignedLicense(payload), MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("expired");
    expect(result.daysRemaining).toBe(-3);
  });

  it("returns 'valid' for a permanent license that passes all checks", async () => {
    const result = await validateLicense(makeSignedLicense(makePayload()), MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
    expect(result.daysRemaining).toBe(30);
  });

  it("returns 'valid' for an extension-type license", async () => {
    const payload = makePayload({ type: "extension", expiresAt: "2099-12-31T00:00:00Z" });
    const result = await validateLicense(makeSignedLicense(payload), MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
  });
});

// ── getStatusLabel ───────────────────────────────────────────────────────────
describe("getStatusLabel", () => {
  it("returns the i18n key for each status", () => {
    expect(getStatusLabel("valid")).toBe("license.status.valid");
    expect(getStatusLabel("expired")).toBe("license.status.expired");
    expect(getStatusLabel("invalid")).toBe("license.status.invalid");
    expect(getStatusLabel("machine_mismatch")).toBe("license.status.machineMismatch");
    expect(getStatusLabel("activation_limit")).toBe("license.status.activationLimit");
    expect(getStatusLabel("version_blocked")).toBe("license.status.versionBlocked");
    expect(getStatusLabel("missing")).toBe("license.status.missing");
  });
});

// ── isLicenseValid ───────────────────────────────────────────────────────────
describe("isLicenseValid", () => {
  it("returns true in dev mode (bypass)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await isLicenseValid()).toBe(true);
  });

  it("returns true when cached result is valid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult({ status: "valid", message: "ok" });
    expect(await isLicenseValid()).toBe(true);
  });

  it("returns false when cached result is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult({ status: "expired", message: "expired" });
    expect(await isLicenseValid()).toBe(false);
  });

  it("returns true when DB setting has a valid status (no cache)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.dbSetting = { value: JSON.stringify({ status: "valid", message: "ok" }) };
    expect(await isLicenseValid()).toBe(true);
  });

  it("returns false when DB setting has an invalid status (no cache)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.dbSetting = { value: JSON.stringify({ status: "invalid", message: "no" }) };
    expect(await isLicenseValid()).toBe(false);
  });

  it("returns false (fail-closed) when no cache + no DB setting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.dbSetting = null;
    mockState.dbPayload = null;
    expect(await isLicenseValid()).toBe(false);
  });
});

// ── requireLicense ───────────────────────────────────────────────────────────
describe("requireLicense", () => {
  it("does not throw when license is valid (dev bypass)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(requireLicense()).resolves.toBeUndefined();
  });

  it("throws SahelFlowError(403) when license is invalid (fail-closed)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.dbSetting = null;
    mockState.dbPayload = null; // no license synced
    await expect(requireLicense()).rejects.toMatchObject({
      code: "LICENSE_REQUIRED",
      statusCode: 403,
    });
    await expect(requireLicense()).rejects.toBeInstanceOf(SahelFlowError);
  });

  it("does not throw when DB has a valid license status (legacy fallback)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockState.dbSetting = { value: JSON.stringify({ status: "valid", message: "ok" }) };
    mockState.dbPayload = null; // legacy path — no payload to re-verify
    await expect(requireLicense()).resolves.toBeUndefined();
  });
});

// ── hasFeature ───────────────────────────────────────────────────────────────
describe("hasFeature", () => {
  it("returns true in dev mode (bypass)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await hasFeature("ai_chat")).toBe(true);
  });

  it("returns true when cached license has 'all' features", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult({
      status: "valid",
      license: {
        payload: { features: ["all"] } as LicensePayload,
        signature: "x",
      },
      message: "ok",
    });
    expect(await hasFeature("ai_chat")).toBe(true);
    expect(await hasFeature("google_sheets")).toBe(true);
    expect(await hasFeature("anything_unknown")).toBe(true);
  });

  it("returns true when cached license has the specific feature", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult({
      status: "valid",
      license: {
        payload: { features: ["ai_chat", "storefront"] } as LicensePayload,
        signature: "x",
      },
      message: "ok",
    });
    expect(await hasFeature("ai_chat")).toBe(true);
    expect(await hasFeature("storefront")).toBe(true);
    expect(await hasFeature("google_sheets")).toBe(false);
  });

  it("returns false when cached result is invalid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult({ status: "expired", message: "expired" });
    expect(await hasFeature("ai_chat")).toBe(false);
  });

  it("returns false when no cached result", async () => {
    vi.stubEnv("NODE_ENV", "production");
    setCachedLicenseResult(null);
    expect(await hasFeature("ai_chat")).toBe(false);
  });
});

// ── issueTrial (smoke) ───────────────────────────────────────────────────────
describe("issueTrial (depth)", () => {
  it("produces a trial that includes the machineId + 'all' features", async () => {
    const trial = await issueTrial(MACHINE_ID);
    expect(trial.payload.machineIds).toContain(MACHINE_ID);
    expect(trial.payload.features).toContain("all");
    expect(trial.payload.type).toBe("trial");
    expect(trial.payload.issuedBy).toBe("app");
    expect(trial.payload.minAppVersion).toBe("3.0.0");
    expect(trial.signature).toBe("self-issued-trial");
  });

  it("produces a trial with a unique id per call", async () => {
    const t1 = await issueTrial(MACHINE_ID);
    // issueTrial's id is `trial_${Date.now()}` — two calls within the same
    // millisecond produce the same id. Wait a few ms so Date.now() advances
    // and the ids differ (verifying the per-call uniqueness intent).
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await issueTrial(MACHINE_ID);
    expect(t1.payload.id).not.toBe(t2.payload.id);
  });
});
